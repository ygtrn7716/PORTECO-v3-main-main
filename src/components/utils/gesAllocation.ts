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
};

const EMPTY_CONTEXT: GesMahsupContext = {
  hasAny: false,
  byPlant: new Map(),
  plantSourceSerno: new Map(),
  assignedSernos: new Map(),
  sourceSernos: new Map(),
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
    .select("id, linked_serno, source_serno")
    .in("id", plantIds);

  if (pErr) throw pErr;

  const plantSourceSerno = new Map<string, number>();
  const sourceSernos = new Map<number, string>();
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
  }

  return { hasAny: true, byPlant, plantSourceSerno, assignedSernos, sourceSernos };
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

  const key = `${gesPlantId}|${startIso}|${endIso}|${endInclusive ? 1 : 0}`;
  const hit = allocationCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;

  const promise = computeGesAllocationUncached(params, assignments, sourceSerno, ctx);
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
  ctx: GesMahsupContext
): Promise<GesAllocationResult | null> {
  const { supabase, userId, startIso, endIso, endInclusive = false } = params;

  // Kaynak + atanan tesislerin saatlik serileri (paginated)
  const sernosToFetch = new Set<number>([sourceSerno]);
  for (const a of assignments) sernosToFetch.add(a.subscription_serno);

  const seriesBySerno = new Map<number, Map<string, { cn: number; gn: number }>>();
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
      for (const row of (res.data ?? []) as Array<{ ts: string; cn?: unknown; gn?: unknown }>) {
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
    })
  );

  const srcSeries = seriesBySerno.get(sourceSerno) ?? new Map();

  const perSerno = new Map<number, { allocByHour: Map<string, number>; allocTotal: number }>();
  for (const a of assignments) {
    perSerno.set(a.subscription_serno, { allocByHour: new Map(), allocTotal: 0 });
  }

  let excessTotal = 0;
  let gesGnTotal = 0;

  for (const [hour, src] of srcSeries) {
    const srcGn = src.gn;
    if (!(srcGn > 0)) continue;
    gesGnTotal += srcGn;

    let remaining = srcGn;
    for (const a of assignments) {
      if (remaining <= 0) break;
      const row = seriesBySerno.get(a.subscription_serno)?.get(hour);
      const cn = row ? row.cn : 0;
      // HERHANGİ bir plant'in kaynak sernosuysa own_gn=0 sayılır: gn'i kendi
      // tüketiminin verişi değil, bir havuzun üretimidir.
      const ownGn = row && !ctx.sourceSernos.has(a.subscription_serno) ? row.gn : 0;
      const residual = Math.max(0, cn - ownGn);
      const alloc = Math.min(remaining, residual);
      if (alloc > 0) {
        const bucket = perSerno.get(a.subscription_serno)!;
        bucket.allocByHour.set(hour, (bucket.allocByHour.get(hour) ?? 0) + alloc);
        bucket.allocTotal += alloc;
        remaining -= alloc;
      }
    }
    excessTotal += remaining;
  }

  return {
    gesPlantId: assignments[0].ges_plant_id,
    sourceSerno,
    perSerno,
    excessTotal,
    gesGnTotal,
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
    }
  | { role: "source" }
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
    if (sourcePlantId) return { role: "source" };
    return null;
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
  // arası geçici boşlukta bile artık kaybolmaz).
  const minPriority = plantAssignments.reduce(
    (m, a) => Math.min(m, a.priority),
    Infinity
  );

  return {
    role: "assigned",
    priority: assignment.priority,
    allocByHour: bucket?.allocByHour ?? new Map(),
    allocTotal: bucket?.allocTotal ?? 0,
    excessTotal: assignment.priority === minPriority ? result.excessTotal : 0,
    isSource: ctx.sourceSernos.has(subscriptionSerno),
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
