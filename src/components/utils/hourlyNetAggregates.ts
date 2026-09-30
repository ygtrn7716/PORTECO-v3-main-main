// src/components/utils/hourlyNetAggregates.ts
//
// Metod 2/3 motorlarının (calculateInvoiceNetMethods.ts) ihtiyaç duyduğu SAATLİK
// NET AGREGALAR. Metod 1'in dağıtım için kullandığı saatlik-net mantığının
// (net_positive_draw_kwh / net_excess_feed_kwh) ve gesAllocation waterfall
// tahsisinin AYNISI yeniden kullanılır — paralel ikinci bir saatlik yol YOK.
//
// applyAllocationToHourlyRows (gesAllocation.ts:366) üç agregayı zaten üretir
// (sumPos/sumExcess/sumGn); bu modül ek olarak sumCn, sumMahsup ve METOD 2/3'e
// ÖZGÜ tek yeni büyüklüğü hesaplar: wPos = Σ(pos_h × PTF_h) / Σ pos_h
// (pozitif çekiş saatleri üzerinden PTF-ağırlıklı ÇIPLAK PTF).

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllConsumption, fetchAllPtf } from "@/lib/paginatedFetch";
import {
  applyAllocationToHourlyRows,
  fetchGesMahsupContext,
  getFacilityAllocation,
  type FacilityAllocationView,
  type GesMahsupContext,
} from "@/components/utils/gesAllocation";
import { dayjsTR } from "@/lib/dayjs";
import type {
  InvoiceMethodInputs,
} from "@/components/utils/calculateInvoiceNetMethods";
// YALNIZ tip: invoiceMethods.ts runtime'da @/lib/supabase'i yükler (env ister);
// bu modül tsx kabul testinden (check-invoice-methods F12) import ediliyor.
import type { InvoiceMethodId } from "@/lib/invoiceMethods";
import {
  addTrafoKaybiToRows,
  hourGridKeys,
  normalizeTrafoKaybi,
  trafoGridCapIso,
} from "@/components/utils/trafoKaybi";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// gesAllocation.ts:60-63 ile BİREBİR aynı (orada modül-private, export edilmiyor).
// allocByHour anahtarları bu fonksiyonla üretildiği için PTF map'i de aynı
// anahtarlamayı kullanmalı.
function hourKeyUtc(ts: string | number | Date): string {
  return new Date(ts).toISOString().slice(0, 13);
}

export type HourlyNetAggregates = {
  sumCn: number;
  sumGn: number;
  sumPos: number;
  sumMahsup: number;
  sumExcess: number;
  /** Pos-ağırlıklı ÇIPLAK PTF (TL/kWh). PTF'li pozitif çekiş yoksa 0. */
  wPos: number;
  /** Σ(pos_h × PTF_h) — yalnız PTF'i olan saatler. */
  vPos: number;
  /** wPos'a giren pozitif çekiş kWh'ı. */
  ptfCoveredPosKwh: number;
  /** PTF'i olmadığı için wPos'a giremeyen pozitif çekiş kWh'ı. */
  ptfMissingPosKwh: number;
  /** Mahsup-ağırlıklı ÇIPLAK PTF (TL/kWh). PTF'li mahsup yoksa 0. Metod 3 mahsuplaşma formülü. */
  wMahsup: number;
  /** Σ(mahsup_h × PTF_h) — yalnız PTF'i olan saatler. */
  vMahsup: number;
  /** wMahsup'a giren mahsup (saat-içi örtüşme) kWh'ı. */
  ptfCoveredMahsupKwh: number;
  /** Tesisin KENDİ sayacının dönem verişi (ham Σgn): tahsis görünümü varsa
   *  view.ownGnTotal, yoksa satırların ham Σgn'i. Metot 7 dağıtım bedeli (G_own). */
  sumOwnGn: number;
  /** Satırlara eklenmiş trafo kaybı (t × saat, kWh). Metot 7 dışında 0. */
  trafoKaybiKwh: number;
};

type HourlyRow = { ts?: string | number | Date; cn?: unknown; gn?: unknown };

/**
 * SAF hesap. Saatlik satırlar + tahsis görünümü + PTF map'inden agregaları üretir.
 * sumPos/sumGn/sumExcess, applyAllocationToHourlyRows ile BİT DÜZEYİNDE aynı kalır
 * (aynı usedHours guard'ı, aynı excessTotal davranışı). Ek olarak wPos hesaplanır.
 */
export function computeHourlyNetAggregates(p: {
  rows: HourlyRow[];
  view: FacilityAllocationView;
  ptfMap: Map<string, number>;
  /** Satırlar trafoKaybi.addTrafoKaybiToRows ile t eklenmiş geldiyse eklenen kWh
   *  (yalnız raporlanır; hesap satırların kendisinden yapılır). */
  trafoKaybiKwh?: number;
}): HourlyNetAggregates {
  const { rows, view, ptfMap } = p;

  // sumPos/sumGn/sumExcess'i mevcut ortak fonksiyondan al → birebir tutarlılık.
  const base = applyAllocationToHourlyRows(rows, view);
  const sumPos = base.netPositiveDrawKwh;
  const sumExcess = base.netExcessFeedKwh;
  const sumGn = base.totalGn;

  let sumCn = 0;
  let vPos = 0;
  let ptfCoveredPosKwh = 0;
  let ptfMissingPosKwh = 0;
  // Mahsup (saat-içi örtüşme) PTF ağırlıklandırması — wMahsup için.
  let vMahsup = 0;
  let ptfCoveredMahsupKwh = 0;
  let rawGn = 0; // ham Σgn (view yoksa G_own)

  // Saat başına efektif gn'i applyAllocationToHourlyRows ile AYNI kuralla türet;
  // yalnız PTF ağırlıklandırması için pos_h'ı yeniden hesapla.
  const usedHours = new Set<string>();
  const isAssigned = view != null && view.role === "assigned";
  const isSourceRole = view != null && view.role === "source";

  for (const row of rows) {
    const cn = num(row.cn);
    sumCn += cn;
    rawGn += num(row.gn);

    let effGn: number;
    if (isSourceRole) {
      effGn = 0; // üretim sayacı nötr
    } else if (isAssigned) {
      // TB-KARAR: alici-kendi-ges — Alıcı tesis bir havuzun kaynağı değilse önce
      // kendi verişiyle netleşir, orana net çekişiyle girer. İş kuralı değişebilir;
      // değişirse bu etiketli satırlar güncellenir.
      // ⚠️ applyAllocationToHourlyRows (gesAllocation.ts) ile ELLE eşlenen kopya —
      // biri değişirse diğeri de değişmeli (üç dağıtım modunda da aynı kural).
      const ownGn = view!.isSource ? 0 : num(row.gn);
      let alloc = 0;
      if (row.ts != null) {
        const key = hourKeyUtc(row.ts);
        if (!usedHours.has(key)) {
          usedHours.add(key);
          alloc = view!.allocByHour.get(key) ?? 0;
        }
      }
      effGn = ownGn + alloc;
    } else {
      effGn = num(row.gn); // view=null → ham
    }

    const posH = Math.max(0, cn - effGn);
    const mahsupH = cn - posH; // = min(cn, effGn) ≥ 0
    if (row.ts == null) continue; // ts yoksa PTF ağırlıklandırması yapılamaz (pos ve mahsup)

    const ptf = ptfMap.get(hourKeyUtc(row.ts));
    const ptfOk = ptf != null && Number.isFinite(ptf);

    // Pozitif çekiş → wPos (mevcut davranış BİREBİR korunur).
    if (posH > 0) {
      if (ptfOk) {
        ptfCoveredPosKwh += posH;
        vPos += posH * ptf!;
      } else {
        ptfMissingPosKwh += posH;
      }
    }

    // Mahsup → wMahsup (YENİ). posH işaretinden BAĞIMSIZ: mahsup-baskın saatler (posH=0)
    // en büyük mahsupH'ı taşır; eski `posH<=0 → continue` bunları atlıyordu.
    if (mahsupH > 0 && ptfOk) {
      ptfCoveredMahsupKwh += mahsupH;
      vMahsup += mahsupH * ptf!;
    }
  }

  // min(cn, effGn) = cn − max(0, cn−effGn) → saat-içi örtüşme (excessTotal lump'ı
  // pos'u etkilemediği için bu kimlik tahsisli tesiste de geçerli).
  const sumMahsup = Math.max(0, sumCn - sumPos);
  const wPos = ptfCoveredPosKwh > 0 ? vPos / ptfCoveredPosKwh : 0;
  // wPos deseniyle: pay+paydada yalnız PTF'li saatler. Tam-PTF ayda ptfCoveredMahsupKwh ≈ sumMahsup.
  const wMahsup = ptfCoveredMahsupKwh > 0 ? vMahsup / ptfCoveredMahsupKwh : 0;

  // Tesisin kendi verişi: tahsis görünümünde allocation fetch'inden (aynı pencere,
  // aynı ham satırlar) gelen ownGnTotal; görünüm yoksa satırların ham Σgn'i.
  const sumOwnGn = view != null ? view.ownGnTotal : rawGn;

  return {
    sumCn, sumGn, sumPos, sumMahsup, sumExcess,
    wPos, vPos, ptfCoveredPosKwh, ptfMissingPosKwh,
    wMahsup, vMahsup, ptfCoveredMahsupKwh,
    sumOwnGn,
    trafoKaybiKwh: p.trafoKaybiKwh ?? 0,
  };
}

// ── Yükleyici (async) ────────────────────────────────────────────
// Yalnız metod 2/3 tesislerinde çağrılır → metod 1 tarafında sıfır ek maliyet.

const CACHE_TTL_MS = 5 * 60 * 1000;
const aggCache = new Map<string, { at: number; promise: Promise<HourlyNetAggregates | null> }>();

export function clearHourlyNetAggregatesCache(): void {
  aggCache.clear();
}

async function loadUncached(p: {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  ctx?: GesMahsupContext;
  /** Metot 7 (Meram): saatlik trafo kaybı (kWh/saat). > 0 ise dönemin her saatine
   *  (eksik satırlar dahil) tüketime eklenir. Yok/0 → davranış bit-identik. */
  trafoKaybiSaatlik?: number;
}): Promise<HourlyNetAggregates | null> {
  const { supabase, userId, subscriptionSerno, periodYear, periodMonth } = p;

  // Ay sınırı: billedInvoiceInputs.ts:210-214 ile aynı idiyom, endInclusive=false.
  // getFacilityAllocation'ın cache anahtarı endInclusive içerdiği için tüketim
  // fetch'i ile allocation'a AYNI aralık geçilmeli.
  // .date(1): ayın 29-31'inde kısa aya .month() set edilince taşmayı önler.
  const m = dayjsTR().date(1).year(periodYear).month(periodMonth - 1);
  const monthStart = m.startOf("month");
  const monthEndExclusive = monthStart.clone().add(1, "month");
  const startIso = monthStart.toDate().toISOString();
  const endIso = monthEndExclusive.toDate().toISOString();

  const hourly = await fetchAllConsumption({
    supabase,
    userId,
    subscriptionSerno,
    columns: "ts, cn, gn",
    startIso,
    endIso,
  });
  if (hourly.error) throw hourly.error;
  let rows = (hourly.data ?? []) as HourlyRow[];
  if (rows.length === 0) return null;

  // Metot 7: satırlara t (tamamlanmış dönemde tüm saatler; cari dönemde son veri
  // saatine kadar). Tahsis görünümü de aynı pencereden, t'li kapasiteyle gelir.
  const t = normalizeTrafoKaybi(p.trafoKaybiSaatlik);
  let trafoKaybiKwh = 0;
  if (t > 0) {
    let lastMs = -Infinity;
    for (const r of rows) {
      const ms = r.ts != null ? new Date(r.ts).getTime() : NaN;
      if (ms > lastMs) lastMs = ms;
    }
    const capIso = trafoGridCapIso({
      startIso,
      endIso,
      lastTs: Number.isFinite(lastMs) ? lastMs : null,
      nowMs: Date.now(),
    });
    const aug = addTrafoKaybiToRows(rows, t, hourGridKeys(startIso, endIso, { capIso }));
    rows = aug.rows;
    trafoKaybiKwh = aug.trafoKwh;
  }

  const ctx = p.ctx ?? (await fetchGesMahsupContext(supabase, userId));
  const view = await getFacilityAllocation({
    supabase,
    userId,
    subscriptionSerno,
    startIso,
    endIso,
    ctx,
  });

  // PTF map — billedInvoiceInputs.ts:270-285 (DOĞRU desen: doğrudan ptf_tl_mwh/1000;
  // ptf_tl_kwh son aylarda %100 NULL, calculateInvoiceToDate deseni boş map dönerdi).
  const ptfRes = await fetchAllPtf({ supabase, columns: "ts, ptf_tl_mwh", startIso, endIso });
  if (ptfRes.error) throw ptfRes.error;
  const ptfMap = new Map<string, number>();
  for (const row of (ptfRes.data ?? []) as Array<{ ts: string; ptf_tl_mwh: unknown }>) {
    const mwh = Number(row.ptf_tl_mwh);
    if (!Number.isFinite(mwh)) continue;
    ptfMap.set(hourKeyUtc(row.ts), mwh / 1000);
  }

  return computeHourlyNetAggregates({ rows, view, ptfMap, trafoKaybiKwh });
}

/**
 * Tesis+dönem için saatlik net agregalar. Metod 2/3 girdilerini kurar.
 * Hata durumunda THROW eder (caller metod 2/3'ü bilinçli seçtiği için sessiz
 * yutma yok); veri yoksa null döner. Oturum başına 5 dk cache.
 */
export function loadHourlyNetAggregates(p: {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  ctx?: GesMahsupContext;
  trafoKaybiSaatlik?: number;
}): Promise<HourlyNetAggregates | null> {
  const t = normalizeTrafoKaybi(p.trafoKaybiSaatlik);
  const key = `${p.subscriptionSerno}|${p.periodYear}|${p.periodMonth}` + (t > 0 ? `|t:${t}` : "");
  const hit = aggCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;

  const promise = loadUncached(p);
  aggCache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    const cur = aggCache.get(key);
    if (cur && cur.promise === promise) aggCache.delete(key);
  });
  return promise;
}

// ── Metod girdisi kurucusu ───────────────────────────────────────
// Tüm caller'lar (InvoiceDetail, Dashboard, billedInvoiceInputs, to-date) metod
// 2/3 girdilerini bu tek noktadan alır → prevSumPos (D3) mantığı bir yerde yaşar.

async function readSubYekdem(
  supabase: SupabaseClient,
  userId: string,
  serno: number,
  year: number,
  month: number
): Promise<{ tahmini: number | null; gerceklesen: number | null }> {
  const { data, error } = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value, yekdem_final")
    .eq("user_id", userId)
    .eq("subscription_serno", serno)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();
  if (error) throw error;
  return {
    tahmini: data?.yekdem_value != null ? Number(data.yekdem_value) : null,
    gerceklesen: data?.yekdem_final != null ? Number(data.yekdem_final) : null,
  };
}

/** Önceki dönemin net pozitif çekişi (D3): önce snapshot, yoksa saatlik yeniden
 *  hesap, o da yoksa null → YEK Farkı kalemi 0/gizli. */
async function resolvePrevSumPos(
  supabase: SupabaseClient,
  userId: string,
  serno: number,
  prevYear: number,
  prevMonth: number
): Promise<number | null> {
  const snap = await supabase
    .from("invoice_snapshots")
    .select("net_positive_draw_kwh")
    .eq("user_id", userId)
    .eq("subscription_serno", serno)
    .eq("period_year", prevYear)
    .eq("period_month", prevMonth)
    .eq("invoice_type", "billed")
    .maybeSingle();
  if (!snap.error && snap.data?.net_positive_draw_kwh != null) {
    return Number(snap.data.net_positive_draw_kwh);
  }
  // Snapshot yoksa/kolon boşsa o dönemi saatlikten türet.
  const agg = await loadHourlyNetAggregates({
    supabase,
    userId,
    subscriptionSerno: serno,
    periodYear: prevYear,
    periodMonth: prevMonth,
  });
  return agg ? agg.sumPos : null;
}

/**
 * Metod 2/3 için tam `InvoiceMethodInputs`'u kurar. Cari dönem agregaları
 * `current` ile verilmezse yüklenir. Cari saatlik veri yoksa null döner
 * (caller metod 1 dispatch'ine düşer). mahsuplasmaUnitPrice burada null bırakılır
 * — override motor içinde uygulanır.
 */
export async function assembleMethodInputs(p: {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  /** Tesisin fatura metodu. ZORUNLU: Metot 7 girdileri farklı kurulur (derleyici
   *  her caller'ı yakalasın diye opsiyonel değil). */
  invoiceMethodId: InvoiceMethodId;
  kbk: number;
  /** Cari dönem tahmini YEKDEM (subscription_yekdem.yekdem_value, ÇIPLAK). */
  tahminiYekdem: number;
  /** Zaten hesaplanmış cari dönem agregaları (billedInvoiceInputs gibi). */
  current?: HourlyNetAggregates | null;
  ctx?: GesMahsupContext;
}): Promise<InvoiceMethodInputs | null> {
  if (p.invoiceMethodId === 7) return assembleMeramInputs(p);

  const cur =
    p.current ??
    (await loadHourlyNetAggregates({
      supabase: p.supabase,
      userId: p.userId,
      subscriptionSerno: p.subscriptionSerno,
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      ctx: p.ctx,
    }));
  if (!cur) return null;

  const prev = dayjsTR().date(1).year(p.periodYear).month(p.periodMonth - 1).subtract(1, "month");
  const prevYear = prev.year();
  const prevMonth = prev.month() + 1;

  const [prevYekdem, prevSumPos] = await Promise.all([
    readSubYekdem(p.supabase, p.userId, p.subscriptionSerno, prevYear, prevMonth),
    resolvePrevSumPos(p.supabase, p.userId, p.subscriptionSerno, prevYear, prevMonth),
  ]);

  return {
    sumCn: cur.sumCn,
    sumGn: cur.sumGn,
    sumPos: cur.sumPos,
    sumMahsup: cur.sumMahsup,
    sumExcess: cur.sumExcess,
    wPos: cur.wPos,
    wMahsup: cur.wMahsup,
    kbk: p.kbk,
    tahminiYekdem: p.tahminiYekdem,
    prevSumPos,
    prevTahminiYekdem: prevYekdem.tahmini,
    prevGerceklesenYekdem: prevYekdem.gerceklesen,
    mahsuplasmaUnitPrice: null,
  };
}

/**
 * Metot 7 (Meram / MEPAŞ) girdileri. Yalnız m7 tesislerinde üç küçük ek sorgu:
 *  - subscription_settings: trafo_kaybi_saatlik (t) + unit_price_adjustment
 *  - subscription_yekdem (AYNI dönem): Y = yekdem_final ?? tahminiYekdem
 *    (enerji ve mahsuplaşma farkı aynı Y'yi kullanır; `tahminiYekdem` alanına Y yazılır)
 *  - invoice_line_overrides 'yekdem_gddk' → meram.gddk. GDDK formülü bilinmiyor,
 *    aylık elle girilir; girdide taşınması override ALMAYAN tüketicilerin
 *    (alternatif tarife, GES Olmasaydı, tüm-tesisler toplamı) da aynı değeri
 *    görmesini sağlar. Motorda override (admin taslağı) yine önceliklidir.
 * t > 0 ise `current` (t'siz hesaplanmış) yok sayılır, agregalar t'li satırlardan
 * yüklenir. Önceki dönem alanları null: m7'de sonraki ay YEKDEM mahsubu yok.
 */
async function assembleMeramInputs(p: {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  kbk: number;
  tahminiYekdem: number;
  current?: HourlyNetAggregates | null;
  ctx?: GesMahsupContext;
}): Promise<InvoiceMethodInputs | null> {
  const [settingsRes, yekdem, gddkRes] = await Promise.all([
    p.supabase
      .from("subscription_settings")
      .select("trafo_kaybi_saatlik, unit_price_adjustment")
      .eq("user_id", p.userId)
      .eq("subscription_serno", p.subscriptionSerno)
      .maybeSingle(),
    readSubYekdem(p.supabase, p.userId, p.subscriptionSerno, p.periodYear, p.periodMonth),
    p.supabase
      .from("invoice_line_overrides")
      .select("is_excluded, amount_override")
      .eq("user_id", p.userId)
      .eq("subscription_serno", p.subscriptionSerno)
      .eq("period_year", p.periodYear)
      .eq("period_month", p.periodMonth)
      .eq("item_key", "yekdem_gddk")
      .maybeSingle(),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  if (gddkRes.error) throw gddkRes.error;

  const t = normalizeTrafoKaybi(settingsRes.data?.trafo_kaybi_saatlik);
  const adjRaw = settingsRes.data?.unit_price_adjustment;
  const unitPriceAdjustment =
    adjRaw != null && Number.isFinite(Number(adjRaw)) ? Number(adjRaw) : 0;

  const cur =
    (t > 0 ? null : p.current) ??
    (await loadHourlyNetAggregates({
      supabase: p.supabase,
      userId: p.userId,
      subscriptionSerno: p.subscriptionSerno,
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      ctx: p.ctx,
      trafoKaybiSaatlik: t,
    }));
  if (!cur) return null;

  const gddkRow = gddkRes.data;
  const gddk = gddkRow
    ? gddkRow.is_excluded
      ? 0
      : gddkRow.amount_override != null && Number.isFinite(Number(gddkRow.amount_override))
        ? Number(gddkRow.amount_override)
        : null
    : null;

  return {
    sumCn: cur.sumCn,
    sumGn: cur.sumGn,
    sumPos: cur.sumPos,
    sumMahsup: cur.sumMahsup,
    sumExcess: cur.sumExcess,
    wPos: cur.wPos,
    wMahsup: cur.wMahsup,
    kbk: p.kbk,
    tahminiYekdem: yekdem.gerceklesen ?? p.tahminiYekdem,
    prevSumPos: null,
    prevTahminiYekdem: null,
    prevGerceklesenYekdem: null,
    mahsuplasmaUnitPrice: null,
    meram: {
      ownGnTotal: cur.sumOwnGn,
      trafoKaybiSaatlik: t,
      trafoKaybiKwh: cur.trafoKaybiKwh,
      unitPriceAdjustment,
      yekdemIsFinal: yekdem.gerceklesen != null,
      gddk,
    },
  };
}
