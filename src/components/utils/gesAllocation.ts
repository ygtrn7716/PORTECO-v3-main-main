// src/components/utils/gesAllocation.ts
//
// Talep Birleştirme: bir GES'in saatlik üretiminin (veriş, consumption_hourly.gn)
// öncelik sıralı birden fazla tesise waterfall ile dağıtılması.
//
// Üretim kaynağı serno'su: ges_plants.source_serno ?? linked_serno
// (OSOS sayaç verisi; inverter ges_production_* tabloları DEĞİL).
//
// Waterfall (saatlik): remaining = src_gn(h); öncelik sırasıyla
//   alloc = min(remaining, max(0, cn_i(h) − own_gn_i(h))); remaining -= alloc.
// Tüm tesislerden sonra kalan (excess) yalnız EN YÜKSEK öncelikli (normalde
// priority=1) tesisin faturasında "fazla üretim satışı" olarak işlenir;
// diğerlerinde satış 0'dır.
//
// Kaynak tesis LİSTEDE de olabilir (herhangi bir öncelikte): bu durumda kendi
// üretimi (gn) dağıtılan havuzdur, kendi tüketimine mahsupta own_gn=0 kabul
// edilir (alloc = min(remaining, cn)) ve rol "assigned" olur (isSource=true).
// Kaynak tesis listede DEĞİLSE rol "source" olur ve faturasında gn=0 sayılır
// (üretimi tümüyle diğer tesislere dağıtılır).
//
// Atama satırı olmayan kullanıcı/tesislerde tüm fonksiyonlar no-op
// davranır (hasAny=false / view=null) — mevcut davranış birebir korunur.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllConsumption } from "@/lib/paginatedFetch";
import {
  allocateByMode,
  buildPoolSrcSeries,
  coerceTahsisModu,
  isPoolMode,
  type TahsisModu,
} from "@/components/utils/gesAllocationModes";
import {
  addTrafoKaybiToSeries,
  hourGridKeys,
  normalizeTrafoKaybi,
  trafoGridCapIso,
} from "@/components/utils/trafoKaybi";

// Dağıtım modu tipleri/sabitleri gesAllocationModes.ts'te (SIFIR IMPORT kuralı —
// saf matematik tsx kabul testinden yüklenebilsin). Buradan re-export edilir ki
// mevcut importer'lar tek yerden (gesAllocation) almaya devam edebilsin.
export type { TahsisModu } from "@/components/utils/gesAllocationModes";
export {
  TAHSIS_MODU_LABEL,
  coerceTahsisModu,
  isPoolMode,
} from "@/components/utils/gesAllocationModes";

export type GesMahsupAssignment = {
  id: string;
  ges_plant_id: string;
  user_id: string;
  subscription_serno: number;
  priority: number;
};

export type GesMahsupContext = {
  hasAny: boolean;
  /** ges_plant_id → priority ASC sıralı atamalar */
  byPlant: Map<string, GesMahsupAssignment[]>;
  /** ges_plant_id → üretim kaynağı serno (source_serno ?? linked_serno) */
  plantSourceSerno: Map<string, number>;
  /** atanan serno → ges_plant_id */
  assignedSernos: Map<number, string>;
  /** kaynak serno → ges_plant_id (yalnız ataması olan plantlar) */
  sourceSernos: Map<number, string>;
  /** ges_plant_id → dağıtım modu (kolon NULL/bilinmeyen ise "sirali") */
  plantMode: Map<string, TahsisModu>;
  /** atanan serno → saatlik trafo kaybı t (kWh/saat, > 0). Metot 7 (Meram): t
   *  tanımlı tesisin tahsis kapasitesi kap(h) = cn(h) + t, dönemin HER saatinde
   *  (satırı eksik saatler dahil). Yoksa anahtar yok → tahsis bit-identik. */
  trafoKaybiBySerno: Map<number, number>;
};

const EMPTY_CONTEXT: GesMahsupContext = {
  hasAny: false,
  byPlant: new Map(),
  plantSourceSerno: new Map(),
  assignedSernos: new Map(),
  sourceSernos: new Map(),
  plantMode: new Map(),
  trafoKaybiBySerno: new Map(),
};

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function hourKeyUtc(ts: string | number | Date) {
  // timestamptz -> UTC saat anahtarı ("YYYY-MM-DDTHH")
  return new Date(ts).toISOString().slice(0, 13);
}

/**
 * Kullanıcının Talep Birleştirme bağlamını çeker.
 * Atama yoksa tek indexli sorguyla döner (hasAny=false) — sıcak yol ucuz.
 */
export async function fetchGesMahsupContext(
  supabase: SupabaseClient,
  userId: string
): Promise<GesMahsupContext> {
  const { data: rows, error } = await supabase
    .from("ges_mahsup_assignments")
    .select("id, ges_plant_id, user_id, subscription_serno, priority")
    .eq("user_id", userId)
    .order("priority", { ascending: true });

  // Sorgu HATASI sessizce yutulmaz: boş context "atama yok" demek olduğundan,
  // geçici bir hata faturayı tahsissiz hesaplatıp doğru snapshot'ın üzerine
  // yanlış değer yazdırabilir. Hata görünür olmalı.
  if (error) throw error;
  if (!rows || rows.length === 0) return EMPTY_CONTEXT;

  const byPlant = new Map<string, GesMahsupAssignment[]>();
  const assignedSernos = new Map<number, string>();
  for (const r of rows as Record<string, unknown>[]) {
    const a: GesMahsupAssignment = {
      id: String(r.id),
      ges_plant_id: String(r.ges_plant_id),
      user_id: String(r.user_id),
      subscription_serno: Number(r.subscription_serno),
      priority: Number(r.priority),
    };
    const list = byPlant.get(a.ges_plant_id) ?? [];
    list.push(a);
    byPlant.set(a.ges_plant_id, list);
    assignedSernos.set(a.subscription_serno, a.ges_plant_id);
  }
  for (const list of byPlant.values()) {
    list.sort((x, y) => x.priority - y.priority);
  }

  // Yalnız ataması olan plantların kaynak serno'ları gerekli
  const plantIds = Array.from(byPlant.keys());
  const { data: plants, error: pErr } = await supabase
    .from("ges_plants")
    .select("id, linked_serno, source_serno, tahsis_modu")
    .in("id", plantIds);

  if (pErr) throw pErr;

  const plantSourceSerno = new Map<string, number>();
  const sourceSernos = new Map<number, string>();
  const plantMode = new Map<string, TahsisModu>();
  for (const p of (plants ?? []) as Record<string, unknown>[]) {
    const src =
      p.source_serno != null
        ? Number(p.source_serno)
        : p.linked_serno != null
          ? Number(p.linked_serno)
          : null;
    if (src != null && Number.isFinite(src)) {
      plantSourceSerno.set(String(p.id), src);
      sourceSernos.set(src, String(p.id));
    }
    // Kaynak serno'su olmayan plant için de doldurulur (eksik anahtar sürprizi olmasın).
    plantMode.set(String(p.id), coerceTahsisModu(p.tahsis_modu));
  }

  // Metot 7 (Meram) saatlik trafo kaybı — yalnız listelenmiş tesisler; kolon NULL ise
  // satır dönmez → harita boş → tahsis bit-identik.
  const trafoKaybiBySerno = new Map<number, number>();
  const { data: tkRows, error: tkErr } = await supabase
    .from("subscription_settings")
    .select("subscription_serno, trafo_kaybi_saatlik")
    .eq("user_id", userId)
    .in("subscription_serno", Array.from(assignedSernos.keys()))
    .not("trafo_kaybi_saatlik", "is", null);
  if (tkErr) throw tkErr;
  for (const r of (tkRows ?? []) as Record<string, unknown>[]) {
    const t = normalizeTrafoKaybi(r.trafo_kaybi_saatlik);
    if (t > 0) trafoKaybiBySerno.set(Number(r.subscription_serno), t);
  }

  return {
    hasAny: true,
    byPlant,
    plantSourceSerno,
    assignedSernos,
    sourceSernos,
    plantMode,
    trafoKaybiBySerno,
  };
}

export type GesAllocationResult = {
  gesPlantId: string;
  sourceSerno: number;
  /** serno → saatlik tahsis */
  perSerno: Map<number, { allocByHour: Map<string, number>; allocTotal: number }>;
  /** Tüm tesislerden sonra kalan toplam veriş — yalnız priority=1 faturasına yazılır */
  excessTotal: number;
  /** Kaynak gn toplamı — sanity: gesGnTotal ≈ Σ allocTotal + excessTotal */
  gesGnTotal: number;
  /** serno → tesisin KENDİ sayacının dönem verişi (ham Σgn). Yalnız görünüm;
   *  hiçbir tahsis hesabına girmez. */
  ownGnBySerno: Map<number, number>;
};

// (gesPlantId|range) başına tek hesap; eşzamanlı caller'lar Promise'i paylaşır.
const CACHE_TTL_MS = 5 * 60 * 1000;
const allocationCache = new Map<
  string,
  { at: number; promise: Promise<GesAllocationResult | null> }
>();

export function clearGesAllocationCache(): void {
  allocationCache.clear();
}

/**
 * Bir GES'in verilen aralıktaki saatlik waterfall tahsisini hesaplar.
 * Ataması olmayan plant için null döner. Sonuç module-level cache'te tutulur.
 */
export function computeGesAllocation(params: {
  supabase: SupabaseClient;
  userId: string;
  gesPlantId: string;
  startIso: string;
  endIso: string;
  endInclusive?: boolean;
  ctx: GesMahsupContext;
}): Promise<GesAllocationResult | null> {
  const { gesPlantId, startIso, endIso, endInclusive = false, ctx } = params;

  const assignments = ctx.byPlant.get(gesPlantId);
  const sourceSerno = ctx.plantSourceSerno.get(gesPlantId);
  if (!assignments || assignments.length === 0 || sourceSerno == null) {
    return Promise.resolve(null);
  }

  const mode = ctx.plantMode.get(gesPlantId) ?? "sirali";

  // Mod cache ANAHTARINA girer: clearGesAllocationCache() yalnız admin sayfasından
  // çağrılıyor; mod başka bir sekmede/oturumda değişirse eski anahtar TTL boyunca
  // eski algoritmayı servis ederdi. Modu anahtara koymak değişimi anında görünür kılar.
  // Trafo kaybı (Metot 7) da tahsisi değiştirdiği için anahtara girer; t'siz
  // listelerde ek yok → anahtar eskisiyle aynı.
  const tDigest = assignments
    .map((a) => ctx.trafoKaybiBySerno.get(a.subscription_serno) ?? 0)
    .join(",");
  const key =
    `${gesPlantId}|${startIso}|${endIso}|${endInclusive ? 1 : 0}|${mode}` +
    (/[1-9]/.test(tDigest) ? `|t:${tDigest}` : "");
  const hit = allocationCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;

  const promise = computeGesAllocationUncached(params, assignments, sourceSerno, ctx, mode);
  allocationCache.set(key, { at: Date.now(), promise });
  // Hata alan hesap TTL boyunca cache'te kalmasın — sonraki çağrı yeniden dener.
  promise.catch(() => {
    const cur = allocationCache.get(key);
    if (cur && cur.promise === promise) allocationCache.delete(key);
  });
  return promise;
}

async function computeGesAllocationUncached(
  params: {
    supabase: SupabaseClient;
    userId: string;
    startIso: string;
    endIso: string;
    endInclusive?: boolean;
  },
  assignments: GesMahsupAssignment[],
  sourceSerno: number,
  ctx: GesMahsupContext,
  mode: TahsisModu
): Promise<GesAllocationResult | null> {
  const { supabase, userId, startIso, endIso, endInclusive = false } = params;

  // HAVUZ modeli (oransal modlar): havuz = LİSTEDEKİ sayaçların verişleri.
  // GES kaydının kaynak sayacı listede değilse havuza girmez → fetch EDİLMEZ.
  // TEK KAYNAK modeli (sirali): kaynak sayaç + atananlar (bugünkü davranış).
  const pool = isPoolMode(mode);

  const sernosToFetch = new Set<number>();
  if (!pool) sernosToFetch.add(sourceSerno);
  for (const a of assignments) sernosToFetch.add(a.subscription_serno);

  const seriesBySerno = new Map<number, Map<string, { cn: number; gn: number }>>();
  const lastTsBySerno = new Map<number, string>();
  await Promise.all(
    Array.from(sernosToFetch).map(async (serno) => {
      const res = await fetchAllConsumption({
        supabase,
        userId,
        subscriptionSerno: serno,
        columns: "ts, cn, gn",
        startIso,
        endIso,
        endInclusive,
      });
      // Eksik seriyle hesaplanan tahsis yanlış olur ve snapshot'a yazılabilir —
      // hata görünür olmalı (cache eviction sayesinde sonraki çağrı yeniden dener).
      if (res.error) throw res.error;
      const map = new Map<string, { cn: number; gn: number }>();
      let lastMs = -Infinity;
      let lastTs: string | null = null;
      for (const row of (res.data ?? []) as Array<{ ts: string; cn?: unknown; gn?: unknown }>) {
        const ms = new Date(row.ts).getTime();
        if (ms > lastMs) {
          lastMs = ms;
          lastTs = row.ts;
        }
        const key = hourKeyUtc(row.ts);
        const prev = map.get(key);
        if (prev) {
          prev.cn += num(row.cn);
          prev.gn += num(row.gn);
        } else {
          map.set(key, { cn: num(row.cn), gn: num(row.gn) });
        }
      }
      seriesBySerno.set(serno, map);
      if (lastTs != null) lastTsBySerno.set(serno, lastTs);
    })
  );

  // Metot 7 (Meram): t tanımlı LİSTELENMİŞ tesiste kapasite = cn + t, dönemin her
  // saatinde (eksik satır = cn 0). Seri ön-dönüşümü — mod fonksiyonları değişmez.
  // gn'e dokunulmaz → havuz (src) ve ownGnBySerno aynen. Cari dönemde ızgara
  // tesisin son veri saatinde kapanır (gelecek saatlere t eklenmez).
  const nowMs = Date.now();
  for (const a of assignments) {
    const t = ctx.trafoKaybiBySerno.get(a.subscription_serno) ?? 0;
    const series = seriesBySerno.get(a.subscription_serno);
    if (!(t > 0) || !series) continue;
    const capIso = trafoGridCapIso({
      startIso,
      endIso,
      endInclusive,
      lastTs: lastTsBySerno.get(a.subscription_serno) ?? null,
      nowMs,
    });
    const keys = hourGridKeys(startIso, endIso, { endInclusive, capIso });
    seriesBySerno.set(a.subscription_serno, addTrafoKaybiToSeries(series, t, keys));
  }

  // Dağıtım matematiği moda göre saf fonksiyonlara devredilir (gesAllocationModes.ts).
  // "sirali" modu eski satır-içi şelalenin BİREBİR taşınmış hâlidir → bit-identik.
  //
  // İki modelin TEK ayrım noktası burada, girdi kurulumunda:
  //  • sirali  → src = kaynak sayacın serisi; isSourceSerno = ctx.sourceSernos
  //              (alıcı kaynak değilse önce kendi verişiyle netleşir)
  //  • oransal → src = listedeki sayaçların verişlerinin saatlik toplamı;
  //              isSourceSerno = "listede mi?" → listedeki HERKES için own_gn=0,
  //              yani kapasite ham cn. (TB-KARAR: alici-kendi-ges)
  // Matematik fonksiyonları modelden habersizdir.
  const listSernos = new Set<number>(assignments.map((a) => a.subscription_serno));

  const srcSeries = pool
    ? buildPoolSrcSeries({ assignments, seriesBySerno })
    : seriesBySerno.get(sourceSerno) ?? new Map();

  const { perSerno, excessTotal, gesGnTotal } = allocateByMode(mode, {
    assignments,
    seriesBySerno,
    srcSeries,
    // TB-KARAR: alici-kendi-ges
    isSourceSerno: pool
      ? (serno) => listSernos.has(serno)
      : (serno) => ctx.sourceSernos.has(serno),
  });

  // Tesis bazlı HAM kendi verişi (Σgn) — yalnız görünüm/bilgi amaçlı.
  // Zaten çekilmiş serilerden türetilir (ek sorgu yok). Tahsise GİRMEZ; Metot 7
  // (Meram) dağıtım bedelinde G_own olarak kullanılır (hourlyNetAggregates.sumOwnGn).
  // Trafo kaybı yalnız cn'e eklendiği için bu toplamı etkilemez.
  const ownGnBySerno = new Map<number, number>();
  for (const [serno, series] of seriesBySerno) {
    let g = 0;
    for (const [, row] of series) g += row.gn;
    ownGnBySerno.set(serno, Number.isFinite(g) ? g : 0);
  }

  return {
    gesPlantId: assignments[0].ges_plant_id,
    sourceSerno,
    perSerno,
    excessTotal,
    gesGnTotal,
    ownGnBySerno,
  };
}

export type FacilityAllocationView =
  | {
      role: "assigned";
      priority: number;
      allocByHour: Map<string, number>;
      allocTotal: number;
      /** En yüksek öncelik (normalde 1) için havuz artığı; diğerlerinde 0 */
      excessTotal: number;
      /** Tesis aynı zamanda bir GES'in üretim sayacı — own gn havuz sayılır (0) */
      isSource: boolean;
      /** Bu GES'in dağıtım modu — yalnız UI bilgilendirmesi; matematiğe GİRMEZ
       *  (tahsis zaten allocByHour/excessTotal içinde uygulanmış geldi). */
      mode: TahsisModu;
      /** Tesisin KENDİ sayacının dönem verişi (ham Σgn). Havuz modunda bu miktar
       *  havuza katılmıştır. Tahsis hesabına GİRMEZ; Metot 7 (Meram) dağıtım bedelinde
       *  G_own olarak okunur (kendi veriş > tüketim → yarım dağıtım). */
      ownGnTotal: number;
    }
  | {
      role: "source";
      /** Kaynak sayacın dönem verişi (ham Σgn) — dağıtılan havuz. Yalnız görünüm. */
      ownGnTotal: number;
    }
  | null;

/**
 * Tesis bazlı tahsis görünümü. Atama/kaynak ilişkisi yoksa null →
 * caller mevcut davranışını aynen sürdürür.
 */
export async function getFacilityAllocation(params: {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  startIso: string;
  endIso: string;
  endInclusive?: boolean;
  ctx?: GesMahsupContext;
}): Promise<FacilityAllocationView> {
  const { supabase, userId, subscriptionSerno, startIso, endIso, endInclusive } = params;

  const ctx = params.ctx ?? (await fetchGesMahsupContext(supabase, userId));
  if (!ctx.hasAny) return null;

  const assignedPlantId = ctx.assignedSernos.get(subscriptionSerno);
  const sourcePlantId = ctx.sourceSernos.get(subscriptionSerno);

  // Kaynak sayaç, atama listesinde de olabilir (öz tüketim + dağıtım);
  // bu durumda "assigned" görünümü esas alınır (gn'i applyAllocation'da havuz sayılır).
  if (!assignedPlantId) {
    if (!sourcePlantId) return null;

    // HAVUZ modeli: listede OLMAYAN kaynak sayaç "source" rolü ALMAZ. Verişi
    // dağıtılmadığı (havuza girmediği) için kendi faturasında sıfırlanmamalı —
    // aksi halde hem havuza katılmayan üretim kaybolur hem çift sayım doğar.
    // Görünüm null → caller mevcut (tahsissiz) davranışını sürdürür.
    if (isPoolMode(ctx.plantMode.get(sourcePlantId) ?? "sirali")) return null;

    // TEK KAYNAK modeli (sirali): verişi dağıtıldı → kendi faturasında gn=0.
    // ownGnTotal yalnız görünüm için; dağıtılan havuzun büyüklüğünü gösterir.
    const srcResult = await computeGesAllocation({
      supabase,
      userId,
      gesPlantId: sourcePlantId,
      startIso,
      endIso,
      endInclusive,
      ctx,
    });
    return {
      role: "source",
      ownGnTotal: srcResult?.ownGnBySerno.get(subscriptionSerno) ?? 0,
    };
  }

  const result = await computeGesAllocation({
    supabase,
    userId,
    gesPlantId: assignedPlantId,
    startIso,
    endIso,
    endInclusive,
    ctx,
  });
  if (!result) return null;

  const plantAssignments = ctx.byPlant.get(assignedPlantId)!;
  const assignment = plantAssignments.find(
    (a) => a.subscription_serno === subscriptionSerno
  )!;
  const bucket = result.perSerno.get(subscriptionSerno);

  // Fazla üretim satışı EN YÜKSEK önceliğe yazılır (normalde 1; silme/renumber
  // arası geçici boşlukta bile artık kaybolmaz). Oransal modlarda öncelik
  // dağıtımı etkilemez, YALNIZ artanın kime yazılacağını belirler.
  const minPriority = plantAssignments.reduce(
    (m, a) => Math.min(m, a.priority),
    Infinity
  );

  const mode = ctx.plantMode.get(assignedPlantId) ?? "sirali";
  const poolMode = isPoolMode(mode);

  return {
    role: "assigned",
    priority: assignment.priority,
    allocByHour: bucket?.allocByHour ?? new Map(),
    allocTotal: bucket?.allocTotal ?? 0,
    excessTotal: assignment.priority === minPriority ? result.excessTotal : 0,
    // HAVUZ modunda listedeki HERKES için own_gn=0 (verişi havuzda) → isSource=true.
    // TEK KAYNAK modunda yalnız gerçek kaynak sayaç için true.
    // TB-KARAR: alici-kendi-ges
    isSource: poolMode || ctx.sourceSernos.has(subscriptionSerno),
    mode,
    ownGnTotal: result.ownGnBySerno.get(subscriptionSerno) ?? 0,
  };
}

/**
 * Saatlik satırlardan calculateInvoice girdilerini üretir — tüm caller'ların
 * ortak matematik noktası.
 *
 *  - view=null   → bugünkü formüller birebir (Σgn, Σmax(0,cn−gn), Σmax(0,gn−cn)).
 *  - "source"    → üretim sayacı nötrlenir: gn=0 sayılır (üretimi başka
 *                  tesislere tahsis edildi; kendi faturasında satış/mahsup yok).
 *  - "assigned"  → efektif gn = own_gn + alloc(h); excess yalnız p1 view'ında
 *                  totalGn ve netExcess'e eklenir (fazla üretim satışı p1'de).
 */
export function applyAllocationToHourlyRows(
  rows: Array<{ ts?: string | number | Date; cn?: unknown; gn?: unknown }>,
  view: FacilityAllocationView
): {
  totalGn: number;
  netPositiveDrawKwh: number;
  netExcessFeedKwh: number;
  allocatedKwh: number;
} {
  let totalGn = 0;
  let netPositiveDrawKwh = 0;
  let netExcessFeedKwh = 0;

  if (view && view.role === "source") {
    for (const row of rows) {
      netPositiveDrawKwh += num(row.cn);
    }
    return { totalGn: 0, netPositiveDrawKwh, netExcessFeedKwh: 0, allocatedKwh: 0 };
  }

  if (view && view.role === "assigned") {
    // Aynı saatin tahsisi yalnız BİR satıra uygulanır (veri saatlik; guard
    // olası mükerrer saat anahtarında çift saymayı önler).
    const usedHours = new Set<string>();
    for (const row of rows) {
      const cn = num(row.cn);
      // TB-KARAR: alici-kendi-ges — Alıcı tesis bir havuzun kaynağı değilse önce
      // kendi verişiyle netleşir, orana net çekişiyle girer. İş kuralı değişebilir;
      // değişirse bu etiketli satırlar güncellenir.
      // Üretim sayacı olan tesiste own gn havuzdur; kendi verişi sayılmaz —
      // aksi halde havuz üretimi hem burada hem dağıtımda çift sayılır.
      const ownGn = view.isSource ? 0 : num(row.gn);
      let alloc = 0;
      if (row.ts != null) {
        const key = hourKeyUtc(row.ts);
        if (!usedHours.has(key)) {
          usedHours.add(key);
          alloc = view.allocByHour.get(key) ?? 0;
        }
      }
      const effGn = ownGn + alloc;
      totalGn += effGn;
      netPositiveDrawKwh += Math.max(0, cn - effGn);
      netExcessFeedKwh += Math.max(0, effGn - cn);
    }
    totalGn += view.excessTotal;
    netExcessFeedKwh += view.excessTotal;
    return {
      totalGn,
      netPositiveDrawKwh,
      netExcessFeedKwh,
      allocatedKwh: view.allocTotal,
    };
  }

  // view=null → mevcut davranış
  for (const row of rows) {
    const cn = num(row.cn);
    const gn = num(row.gn);
    totalGn += gn;
    netPositiveDrawKwh += Math.max(0, cn - gn);
    netExcessFeedKwh += Math.max(0, gn - cn);
  }
  return { totalGn, netPositiveDrawKwh, netExcessFeedKwh, allocatedKwh: 0 };
}
