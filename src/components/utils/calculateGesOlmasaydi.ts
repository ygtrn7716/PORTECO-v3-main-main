// src/components/utils/calculateGesOlmasaydi.ts
//
// GES olmasaydı fatura karşılaştırma hesaplaması — 4 kartlı modelin çekirdeği.
//
//  Kart 1 (Mevcut Faturanız)        = caller'dan gelen ödenecek toplam (totalWithMahsup).
//                                     Fatura sayfasındaki "Genel Toplam (YEKDEM Mahsubu
//                                     Dahil)" ile birebir aynı — burada YENİDEN HESAPLANMAZ.
//  Kart 2 (Satılan Enerji Bedeli)   = caller'ın calculateGesUretimSatisi ile hesapladığı
//                                     net gelir (satisKwh > 0 ise gösterilir).
//  Kart 3 (GES Olmasaydı Faturanız) = karşı-olgusal fatura. Producer modunda ham tüketim
//                                     (= çekiş + GES üretim − veriş, saat bazında) üzerinden
//                                     GES'siz birim fiyatla; receiver modunda mevcut girdilerle
//                                     ama mahsup tahsisi sıfırlanarak hesaplanır. Kart 1 ile
//                                     simetri için YEKDEM mahsubu + diğer bedeller eklenir.
//  Kart 4 (GES Tasarrufu)           = Kart 3 − Kart 1 + Kart 2.
//
// mode = "receiver": Talep Birleştirme ile mahsup ALAN, kendi üretimi olmayan tesis.
// Üretim/veriş verisi yok → DB fetch yapılmaz; ham tüketim = çekiş kabul edilir ve
// "GES olmasaydı fatura" = tahsis uygulanmadan yeniden çalıştırılan fatura motoru.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllConsumption, fetchAllPtf } from "@/lib/paginatedFetch";
import { type InvoiceBreakdown, type TariffType } from "./calculateInvoice";
import {
  calculateInvoiceForMethod,
  DEFAULT_INVOICE_METHOD,
  isNetInvoiceMethod,
  type InvoiceMethodId,
  type MethodInvoiceBreakdown,
} from "@/lib/invoiceMethods";
import {
  isIpragazYekBirlesikPeriod,
  type InvoiceMethodInputs,
} from "@/components/utils/calculateInvoiceNetMethods";
import { computeHourlyNetAggregates } from "@/components/utils/hourlyNetAggregates";
import {
  addTrafoKaybiToRows,
  hourGridKeys,
  normalizeTrafoKaybi,
  trafoGridCapIso,
} from "@/components/utils/trafoKaybi";

const PAGE = 1000;

export type GesOlmasaydiMode = "producer" | "receiver";

export interface GesOlmasaydiResult {
  mode: GesOlmasaydiMode;
  /** false = üretim anlık tüketimi beslemiyor (arazi GES): ham tüketim = çekiş,
   *  karşı-olgusal = mahsupsuz fatura. UI'ın DETAY varyant anahtarı. */
  anlikUretimKullanimi: boolean;
  hamTuketimKwh: number;      // receiver / anlık-kullanımsız: = mevcutTuketimKwh
  mevcutTuketimKwh: number;
  gesUretimKwh: number;       // receiver: 0
  verisMahsupKwh: number;     // Kart 1 alt metni (uygulanan mahsup)
  allocatedKwh: number | null; // receiver DETAY satırı (tahsis edilen mahsup)
  /** Kart 2 — satış yoksa null → kart render edilmez. */
  satis: { satisKwh: number; satisNetGelir: number } | null;
  gesOlmasaydiFatura: number; // Kart 3 = breakdown.totalInvoice + yekdemMahsup + digerDegerler
  mevcutFatura: number;       // Kart 1 (pass-through)
  tasarruf: number;           // Kart 4 = gesOlmasaydiFatura − mevcutFatura + satisNetGelir
  tasarrufYuzde: number;      // tasarruf / gesOlmasaydiFatura × 100
  hamBirimFiyat: number;      // receiver: = mevcutBirimFiyat
  mevcutBirimFiyat: number;
  /** Karşı-olgusal ENERJİ birim fiyatı — YALNIZ metod 2/3/5'te dolu (ÇIPLAK: wPos × KBK).
   *  Metod 1/4'te undefined: o motorlarda YEKDEM zaten hamBirimFiyat'ın içinde. */
  gesOlmasaydiEnerjiBirim?: number;
  /** Karşı-olgusal YEK birim fiyatı (YEKDEM × KBK) — metod 2/3/5'te YEKDEM ayrı kalem
   *  olduğu için birim fiyattan görünmez; DETAY'da açıkça gösterilsin diye türetilir.
   *  gesOlmasaydiEnerjiBirim ile İKİSİ BİRLİKTE set edilir; toplamları hamBirimFiyat'tır. */
  gesOlmasaydiYekBirim?: number;
  gesOlmasaydiBreakdown: InvoiceBreakdown;
  /** Metod 2/3 tesiste karşı-olgusal saatlik girdiler kurulamadı (o dönem için
   *  saatlik tüketim/PTF yok) → Metod 1 yaklaşımıyla hesaplandı. UI "yaklaşık" der. */
  counterfactualApproximate?: boolean;
}

export interface GesOlmasaydiParams {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  /** default "producer". "receiver" = talep birleştirme ile mahsup alan üretimsiz tesis. */
  mode?: GesOlmasaydiMode;
  /** subscription_settings.anlik_uretim_kullanimi: null/undefined/true = behind-the-meter
   *  (mevcut davranış). false = üretim anlık tüketimi beslemez (arazi GES): ham tüketim =
   *  çekiş; karşı-olgusal fatura mahsupsuz + dağıtım düzeltmesiz hesaplanır. */
  anlikUretimKullanimi?: boolean | null;
  // Mevcut fatura hesabından gelen değerler (yeniden sorgulamayı önlemek için).
  // mevcutFatura = ÖDENECEK TOPLAM (totalWithMahsup) — fatura sayfasıyla birebir.
  mevcutFatura: number;
  mevcutBirimFiyat: number;
  mevcutTuketimKwh: number;
  /** breakdown.verisMahsupKwh — Kart 1 alt metni. */
  verisMahsupKwh: number;
  /** Kart 2 girdileri — caller calculateGesUretimSatisi ile hesaplar; 0/undefined → kart yok. */
  satisKwh?: number;
  satisNetGelir?: number;
  /** Kart 3 simetrisi: mevcut faturadaki YEKDEM mahsubu + diğer bedeller karşı-olgusal
   *  faturaya da eklenir → Kart 4 = Kart 3 − Kart 1 + Kart 2 ekranda birebir tutar. */
  yekdemMahsup?: number;
  digerDegerler?: number;
  /** Talep Birleştirme: bu faturaya tahsis edilen mahsup kWh (receiver DETAY satırı). */
  allocatedKwh?: number | null;
  monthlyYekdem: number;
  kbk: number;
  // Birim fiyat düzeltmesi (TL/kWh, +/-): karşı-olgusal birim fiyata da uygulanır ki
  // GES'li/GES'siz fatura aynı sözleşme bazında karşılaştırılsın. null/undefined = 0.
  unitPriceAdjustment?: number | null;
  // Tarife parametreleri
  unitPriceDistribution: number;
  btvRate: number;
  vatRate: number;
  tariffType: TariffType;
  contractPowerKw: number;
  monthFinalDemandKw: number;
  powerPrice: number;
  powerExcessPrice: number;
  reactivePenaltyCharge: number;
  trafoDegeri: number;
  // Veriş satış parametreleri
  onYil?: boolean;
  perakendeEnerjiBedeli?: number;
  // Lisanslı Satış: true ise GES tüketim faturasını etkilemez; tasarruf =
  // satılan enerjinin net geliri olarak ortaya çıkar.
  lisansliSatis?: boolean;
  /** Tesisin fatura metodu — karşı-olgusal fatura da aynı metod motorunu kullanır. */
  invoiceMethodId?: InvoiceMethodId;
  /** MEVCUT (GES'li) faturanın metod 2/3 girdileri. Karşı-olgusalda yalnız önceki
   *  dönem YEKDEM alanları taşınır (önceki dönem her iki dünyada da aynı gerçek);
   *  cari agregalar ham seriden yeniden kurulur.
   *  Metod 7 (Meram): `meram` bloğu da taşınır — Y (tahminiYekdem), trafo kaybı t,
   *  adj ve GDDK iki dünyada AYNI (GES'ten bağımsız); yalnız G_own = 0 (GES yok →
   *  kendi veriş yok → dağıtım D×C tam) ve mahsup 0. */
  methodInputs?: InvoiceMethodInputs | null;
}

/**
 * Metod 7 karşı-olgusu için ORTAK kurulum: mevcut girdide `meram` yoksa null
 * (diğer metodlar → davranış birebir). t > 0 ise ham satırlara dönemin her saatinde
 * t eklenir (trafoKaybi.ts; cari dönemde son veri saatine kadar) → wPos t-ağırlıklı.
 */
function meramCounterfactualRows<R extends { ts?: string | number | Date; cn?: unknown; gn?: unknown }>(
  prev: InvoiceMethodInputs | null | undefined,
  rows: readonly R[],
  startIso: string,
  endIso: string,
): { rows: Array<R | { ts: string; cn: number; gn: number }>; trafoKwh: number } | null {
  if (!prev?.meram) return null;
  const t = normalizeTrafoKaybi(prev.meram.trafoKaybiSaatlik);
  if (!(t > 0)) return { rows: rows.slice(), trafoKwh: 0 };
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
  return addTrafoKaybiToRows(rows, t, hourGridKeys(startIso, endIso, { capIso }));
}

/** Metod 7 karşı-olgu `meram` bloğu: G_own = 0, trafo kWh karşı-olgu satırlarından. */
function meramCounterfactualBlock(
  prev: InvoiceMethodInputs,
  trafoKwh: number,
): NonNullable<InvoiceMethodInputs["meram"]> {
  return { ...prev.meram!, ownGnTotal: 0, trafoKaybiKwh: trafoKwh };
}

/** Tasarruf formülü TEK yerde: tüm modlar bu montajdan geçer. */
function assembleResult(args: {
  params: GesOlmasaydiParams;
  mode: GesOlmasaydiMode;
  breakdown: InvoiceBreakdown;
  hamTuketimKwh: number;
  gesUretimKwh: number;
  hamBirimFiyat: number;
  anlikUretimKullanimi?: boolean; // default true (behind-the-meter)
  /** Metod 2/3'te karşı-olgusal girdiler kurulamadıysa true (UI "yaklaşık" rozeti). */
  approximate?: boolean;
}): GesOlmasaydiResult {
  const { params, mode, breakdown } = args;

  const gesOlmasaydiFatura =
    breakdown.totalInvoice + (params.yekdemMahsup ?? 0) + (params.digerDegerler ?? 0);

  const satisKwh = params.satisKwh ?? 0;
  const satis =
    satisKwh > 0
      ? { satisKwh, satisNetGelir: params.satisNetGelir ?? 0 }
      : null;

  // Tasarruf = GES Olmasaydı Faturanız − Mevcut Fatura + Satılan Enerji Net Geliri.
  // Fatura ile satış gelirinin birbirini götürmesinin her iki yönünü de kapsar.
  const tasarruf = gesOlmasaydiFatura - params.mevcutFatura + (satis?.satisNetGelir ?? 0);
  const tasarrufYuzde =
    gesOlmasaydiFatura > 0 ? (tasarruf / gesOlmasaydiFatura) * 100 : 0;

  // Karşı-olgusal birim fiyatın ayrışımı — YALNIZ net metodlarda (m2/m3/m5) anlamlı:
  // o motorlarda enerji ÇIPLAK fiyatlanır (wPos × KBK) ve YEKDEM ayrı KALEMdir, yani
  // hamBirimFiyat'ın YEKDEM bileşeni tek satırda görünmez. Değerler motorun ÜRETTİĞİ
  // çıktıdan okunur (override dahil) — yeni aritmetik veya ikinci bir fiyat yolu YOK.
  // Metod 1/4 çıktısında energyUnitPriceApplied anahtarı hiç bulunmaz → ikisi de
  // undefined kalır ve UI bugünkü tek satırı korur.
  // m5 birleşik (İpragaz 2026-08+): YEK zaten enerji satırına gömülü → ayrışım
  // anlamsız; her ikisi undefined kalır ve UI tek "Birim Fiyat (GES'siz)" satırına
  // (hamBirimFiyat = (PTF+YEKDEM)×KBK, YEK dahil) düşer — Metod 1/4 ile aynı görünüm.
  const mb = breakdown as MethodInvoiceBreakdown;
  // m7 (Meram): YEKDEM zaten enerji birim fiyatında (U) → ayrışım yok, tek satır.
  const splitOk =
    mb.energyUnitPriceApplied != null &&
    mb.netEnergyKwh > 0 &&
    !mb.yekEnerjiyeGomulu &&
    !mb.meram;
  const gesOlmasaydiEnerjiBirim = splitOk ? mb.energyUnitPriceApplied : undefined;
  const gesOlmasaydiYekBirim = splitOk
    ? (mb.yekTahminiCharge ?? 0) / mb.netEnergyKwh
    : undefined;

  return {
    mode,
    anlikUretimKullanimi: args.anlikUretimKullanimi ?? true,
    hamTuketimKwh: args.hamTuketimKwh,
    mevcutTuketimKwh: params.mevcutTuketimKwh,
    gesUretimKwh: args.gesUretimKwh,
    verisMahsupKwh: params.verisMahsupKwh,
    allocatedKwh: params.allocatedKwh ?? null,
    satis,
    gesOlmasaydiFatura,
    mevcutFatura: params.mevcutFatura,
    tasarruf,
    tasarrufYuzde,
    hamBirimFiyat: args.hamBirimFiyat,
    mevcutBirimFiyat: params.mevcutBirimFiyat,
    gesOlmasaydiEnerjiBirim,
    gesOlmasaydiYekBirim,
    gesOlmasaydiBreakdown: breakdown,
    counterfactualApproximate: args.approximate ?? false,
  };
}

/**
 * 2C — ÜRETİMSİZ dünyanın metod 2/3 karşı-olgusal girdileri.
 *
 * receiver / arazi-GES dallarında "GES olmasaydı" senaryosunda efektif gn = 0'dır
 * (tahsis uygulanmaz / üretim ayrı sayaçtan şebekeye gider) ⇒
 *   pos = cn · mahsup = 0 · excess = 0 · wPos = cn-ağırlıklı ÇIPLAK PTF.
 *
 * Trick: satırlar `gn` OLMADAN çekilir ve view=null geçilir → gesAllocation'ın
 * "view=null → mevcut davranış" dalına düşer, num(undefined)=0 ⇒ pos_h = cn_h.
 * İKİNCİ BİR AGREGASYON YOLU KURULMAZ — üretici dalıyla aynı fonksiyon.
 *
 * Saatlik veri yoksa null döner → çağıran Metod 1 yaklaşımını korur + "yaklaşık" der.
 */
async function buildNoGesCounterfactualMi(p: {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  kbk: number;
  monthlyYekdem: number;
  prev?: InvoiceMethodInputs | null;
}): Promise<InvoiceMethodInputs | null> {
  const startIso = new Date(p.periodYear, p.periodMonth - 1, 1).toISOString();
  const endIso = new Date(p.periodYear, p.periodMonth, 1).toISOString();

  const [cnRes, ptfRes] = await Promise.all([
    fetchAllConsumption({
      supabase: p.supabase,
      userId: p.userId,
      subscriptionSerno: p.subscriptionSerno,
      columns: "ts, cn",
      startIso,
      endIso,
    }),
    fetchAllPtf({ supabase: p.supabase, columns: "ts, ptf_tl_mwh", startIso, endIso }),
  ]);
  if (cnRes.error || ptfRes.error) return null;
  const rawRows = (cnRes.data ?? []) as Array<{ ts: string; cn: unknown }>;
  if (rawRows.length === 0) return null;
  // Metod 7: trafo kaybı t karşı-olguda da tüketimin içinde (GES'ten bağımsız).
  const meramRows = meramCounterfactualRows(p.prev, rawRows, startIso, endIso);
  const rows = meramRows ? meramRows.rows : rawRows;

  // hourlyNetAggregates.ts ile AYNI anahtarlama (UTC saat başı).
  const ptfMap = new Map<string, number>();
  for (const r of (ptfRes.data ?? []) as Array<{ ts: string; ptf_tl_mwh: unknown }>) {
    const mwh = Number(r.ptf_tl_mwh);
    if (!Number.isFinite(mwh)) continue;
    ptfMap.set(new Date(r.ts).toISOString().slice(0, 13), mwh / 1000);
  }

  const agg = computeHourlyNetAggregates({ rows, view: null, ptfMap });
  if (!(agg.sumPos > 0) || !(agg.wPos > 0)) return null;

  return {
    sumCn: agg.sumCn,
    sumGn: 0,
    sumPos: agg.sumPos,
    sumMahsup: 0,
    sumExcess: 0,
    wPos: agg.wPos,
    kbk: p.kbk,
    // m7: Y (final varsa final) mevcut girdiden; diğer metodlarda aylık tahmini.
    tahminiYekdem: meramRows && p.prev ? p.prev.tahminiYekdem : p.monthlyYekdem,
    // Önceki dönem her iki dünyada da AYNI gerçek → mevcut girdilerden taşınır
    // (üretici dalındaki kuralın aynısı).
    prevSumPos: p.prev?.prevSumPos ?? null,
    prevTahminiYekdem: p.prev?.prevTahminiYekdem ?? null,
    prevGerceklesenYekdem: p.prev?.prevGerceklesenYekdem ?? null,
    mahsuplasmaUnitPrice: null,
    ...(meramRows && p.prev
      ? { meram: meramCounterfactualBlock(p.prev, meramRows.trafoKwh) }
      : {}),
  };
}

/** GES production_hourly'den paginated fetch */
async function fetchAllGesProduction(
  supabase: SupabaseClient,
  plantIds: string[],
  startIso: string,
  endIso: string,
): Promise<{ data: any[]; error: any }> {
  const all: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ges_production_hourly")
      .select("ts, energy_kwh")
      .in("ges_plant_id", plantIds)
      .gte("ts", startIso)
      .lt("ts", endIso)
      .order("ts", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) return { data: all, error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return { data: all, error: null };
}

/** GES production_daily'den paginated fetch (hourly yoksa fallback). */
async function fetchAllGesProductionDaily(
  supabase: SupabaseClient,
  plantIds: string[],
  startDate: string, // YYYY-MM-DD (inclusive)
  endDateExclusive: string, // YYYY-MM-DD (exclusive)
): Promise<{ data: any[]; error: any }> {
  const all: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ges_production_daily")
      .select("date, energy_kwh")
      .in("ges_plant_id", plantIds)
      .gte("date", startDate)
      .lt("date", endDateExclusive)
      .order("date", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) return { data: all, error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return { data: all, error: null };
}

/** Dönem toplam GES üretimi (kWh) — DETAY satırı için. Hourly tablo öncelikli,
 *  satır yoksa/hata varsa daily fallback; ikisi de yoksa 0 (hesabı engellemez). */
async function fetchTotalGesProductionKwh(
  supabase: SupabaseClient,
  plantIds: string[],
  periodYear: number,
  periodMonth: number,
): Promise<number> {
  const start = new Date(periodYear, periodMonth - 1, 1);
  const end = new Date(periodYear, periodMonth, 1);
  const gesRes = await fetchAllGesProduction(
    supabase,
    plantIds,
    start.toISOString(),
    end.toISOString(),
  );
  if (!gesRes.error && gesRes.data.length > 0) {
    return gesRes.data.reduce(
      (s: number, r: { energy_kwh: number | null }) => s + (Number(r.energy_kwh) || 0),
      0,
    );
  }

  const { startDate, endDateExclusive } = monthDateBounds(periodYear, periodMonth);
  const dailyRes = await fetchAllGesProductionDaily(
    supabase,
    plantIds,
    startDate,
    endDateExclusive,
  );
  if (!dailyRes.error) {
    return dailyRes.data.reduce(
      (s: number, r: { energy_kwh: number | null }) => s + (Number(r.energy_kwh) || 0),
      0,
    );
  }
  return 0;
}

function hourKey(ts: string): number {
  return Math.floor(new Date(ts).getTime() / 3_600_000) * 3_600_000;
}

// TR günü (UTC+3 sabit) — daily fallback gün-bazlı agregasyonda kullanılır.
function dayKeyTR(ts: string): string {
  const trMs = new Date(ts).getTime() + 3 * 3_600_000;
  return new Date(trMs).toISOString().slice(0, 10);
}

// periodYear/periodMonth → YYYY-MM-DD ay başı ve bir sonraki ay başı.
function monthDateBounds(periodYear: number, periodMonth: number) {
  const mm = String(periodMonth).padStart(2, "0");
  const startDate = `${periodYear}-${mm}-01`;
  const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
  const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
  const endDateExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { startDate, endDateExclusive };
}

export async function calculateGesOlmasaydi(
  params: GesOlmasaydiParams,
): Promise<GesOlmasaydiResult | null> {
  const { supabase, userId, subscriptionSerno, periodYear, periodMonth } = params;
  const methodId = params.invoiceMethodId ?? DEFAULT_INVOICE_METHOD;
  // İpragaz 2026-08+ (m5): karşı-olgusal fatura da YEK'i enerji satırına gömer
  // (ana faturayla aynı kapı; yalnız m5 okur, diğer metodlar yok sayar).
  const ipragazYekBirlesik = methodId === 5 && isIpragazYekBirlesikPeriod(periodYear, periodMonth);

  // ── Receiver modu: Talep Birleştirme ile mahsup alan üretimsiz tesis ──────
  // Üretim/veriş yok → ham tüketim = çekiş; DB fetch gerekmez. "GES olmasaydı
  // fatura" = tahsis SIFIRLANARAK yeniden çalıştırılan fatura motoru (Veriş
  // Mahsup kalemiyle birlikte dağıtım D/2 avantajı ve BTV etkisi de kalkar).
  if (params.mode === "receiver") {
    // 2C: karşı-olgusal = "tahsis hiç uygulanmasaydı" → efektif gn=0.
    // Saatlik tüketim + PTF'den gerçek metod 2/3 girdileri kurulur; veri yoksa
    // Metod 1 yaklaşımı korunur ve kart "yaklaşık" rozeti gösterir.
    const cfMi =
      isNetInvoiceMethod(methodId)
        ? await buildNoGesCounterfactualMi({
            supabase,
            userId,
            subscriptionSerno,
            periodYear,
            periodMonth,
            kbk: params.kbk,
            monthlyYekdem: params.monthlyYekdem,
            prev: params.methodInputs,
          })
        : null;

    const breakdown = calculateInvoiceForMethod(methodId, {
      totalConsumptionKwh: params.mevcutTuketimKwh,
      unitPriceEnergy: params.mevcutBirimFiyat,
      unitPriceDistribution: params.unitPriceDistribution,
      btvRate: params.btvRate,
      vatRate: params.vatRate,
      tariffType: params.tariffType,
      contractPowerKw: params.contractPowerKw,
      monthFinalDemandKw: params.monthFinalDemandKw,
      powerPrice: params.powerPrice,
      powerExcessPrice: params.powerExcessPrice,
      reactivePenaltyCharge: params.reactivePenaltyCharge,
      trafoDegeri: params.trafoDegeri,
      totalProductionKwh: 0, // tahsis yok → veriş/mahsup yok
      // netPositiveDraw/netExcessFeed bilinçli geçilmiyor → aylık davranış (mahsup 0)
      methodInputs: cfMi ?? undefined,
      ipragazYekBirlesik,
    });

    return assembleResult({
      params,
      mode: "receiver",
      breakdown,
      hamTuketimKwh: params.mevcutTuketimKwh,
      gesUretimKwh: 0,
      hamBirimFiyat: params.mevcutBirimFiyat,
      approximate: (isNetInvoiceMethod(methodId)) && cfMi == null,
    });
  }

  // ── Lisanslı Satış: GES tüketim faturasını etkilemez ──────────────────────
  // Karşı-olgusal fatura ≈ mevcut dönem faturası → tasarruf = satış net geliri.
  // Üretim yalnızca DETAY satırı (gesUretimKwh) için çekilir.
  if (params.lisansliSatis) {
    let totalGesKwh = 0;
    const { data: plantsData } = await supabase
      .from("ges_plants")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("linked_serno", subscriptionSerno);

    if (plantsData && plantsData.length > 0) {
      totalGesKwh = await fetchTotalGesProductionKwh(
        supabase,
        plantsData.map((p: { id: string }) => p.id),
        periodYear,
        periodMonth,
      );
    }

    const breakdown = calculateInvoiceForMethod(methodId, {
      totalConsumptionKwh: params.mevcutTuketimKwh,
      unitPriceEnergy: params.mevcutBirimFiyat,
      unitPriceDistribution: params.unitPriceDistribution,
      btvRate: params.btvRate,
      vatRate: params.vatRate,
      tariffType: params.tariffType,
      contractPowerKw: params.contractPowerKw,
      monthFinalDemandKw: params.monthFinalDemandKw,
      powerPrice: params.powerPrice,
      powerExcessPrice: params.powerExcessPrice,
      reactivePenaltyCharge: params.reactivePenaltyCharge,
      trafoDegeri: params.trafoDegeri,
      totalProductionKwh: 0,
      lisansliSatis: true,
      // 2C: bu dalın semantiği "karşı-olgusal fatura ≈ mevcut dönem faturası"
      // (GES tüketim faturasını etkilemez). Metod 2/3'te bu, mevcut girdilerin
      // aynen kullanılması demektir — ek fetch YOK, Metod 1 yaklaşımından kesin daha doğru.
      methodInputs: params.methodInputs ?? undefined,
      ipragazYekBirlesik,
    });

    return assembleResult({
      params,
      mode: "producer",
      breakdown,
      hamTuketimKwh: params.mevcutTuketimKwh,
      gesUretimKwh: totalGesKwh,
      hamBirimFiyat: params.mevcutBirimFiyat,
      approximate: (isNetInvoiceMethod(methodId)) && params.methodInputs == null,
    });
  }

  // ── Anlık üretim kullanımı YOK (arazi GES): ham tüketim = çekiş ───────────
  // Üretim tesisin anlık tüketimini beslemez (tamamı ayrı sayaçtan şebekeye
  // verilir) → çekiş zaten gerçek ham tüketimdir; saatlik üretim ekleme/veriş
  // çıkarma YAPILMAZ. "GES olmasaydı fatura" = veriş mahsubu VE dağıtımdaki
  // mahsup düzeltmesi (distributionAdjustment) uygulanmadan yeniden çalıştırılan
  // fatura motoru — receiver dalıyla aynı çağrı şekli. Tüketim profili
  // değişmediği için birim fiyat da mevcutBirimFiyat'tır (PTF ağırlığı yeniden
  // türetilmez). Üretim yalnız DETAY satırı için çekilir; veri yoksa 0 ile
  // devam edilir (hesap üretime bağımlı değil).
  // NOT: lisanslı satış kontrolünden SONRA gelmeli — lisanslı dal motoru
  // lisansliSatis:true ile çağırır (dağıtım tabanı/BTV farklı hesaplanır).
  if (params.anlikUretimKullanimi === false) {
    const { data: plants, error: plantsErr } = await supabase
      .from("ges_plants")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("linked_serno", subscriptionSerno);

    if (plantsErr || !plants || plants.length === 0) return null;

    const totalGesKwh = await fetchTotalGesProductionKwh(
      supabase,
      plants.map((p: { id: string }) => p.id),
      periodYear,
      periodMonth,
    );

    // 2C: arazi GES → üretim tesisin anlık tüketimini beslemez; karşı-olgusalda
    // efektif gn=0 (tesis tahsis alıcısı olsa bile mahsup kalkar). Receiver
    // dalıyla aynı yardımcı; veri yoksa Metod 1 yaklaşımı + "yaklaşık" rozeti.
    const cfMi =
      isNetInvoiceMethod(methodId)
        ? await buildNoGesCounterfactualMi({
            supabase,
            userId,
            subscriptionSerno,
            periodYear,
            periodMonth,
            kbk: params.kbk,
            monthlyYekdem: params.monthlyYekdem,
            prev: params.methodInputs,
          })
        : null;

    const breakdown = calculateInvoiceForMethod(methodId, {
      totalConsumptionKwh: params.mevcutTuketimKwh,
      unitPriceEnergy: params.mevcutBirimFiyat,
      unitPriceDistribution: params.unitPriceDistribution,
      btvRate: params.btvRate,
      vatRate: params.vatRate,
      tariffType: params.tariffType,
      contractPowerKw: params.contractPowerKw,
      monthFinalDemandKw: params.monthFinalDemandKw,
      powerPrice: params.powerPrice,
      powerExcessPrice: params.powerExcessPrice,
      reactivePenaltyCharge: params.reactivePenaltyCharge,
      trafoDegeri: params.trafoDegeri,
      totalProductionKwh: 0, // mahsup yok → dağıtım düzeltmesiz, tam BTV
      // netPositiveDraw/netExcessFeed bilinçli geçilmiyor → aylık davranış (mahsup 0)
      methodInputs: cfMi ?? undefined,
      ipragazYekBirlesik,
    });

    return assembleResult({
      params,
      mode: "producer",
      breakdown,
      hamTuketimKwh: params.mevcutTuketimKwh,
      gesUretimKwh: totalGesKwh,
      hamBirimFiyat: params.mevcutBirimFiyat,
      anlikUretimKullanimi: false,
      approximate: (isNetInvoiceMethod(methodId)) && cfMi == null,
    });
  }

  // ── Producer modu: ham tüketim üzerinden karşı-olgusal fatura ─────────────
  // 1) Bu tüketim aboneliğine (subscription_serno) BAĞLI aktif GES plant'ları bul.
  //    linked_serno filtresi sayesinde her tüketim tesisi sadece kendi GES
  //    üretimini görür. Birden fazla plant aynı abonelikle eşleşebilir
  //    (örn. iki manuel + bir API plant).
  const { data: plants, error: plantsErr } = await supabase
    .from("ges_plants")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("linked_serno", subscriptionSerno);

  if (plantsErr || !plants || plants.length === 0) return null;
  const plantIds = plants.map((p: { id: string }) => p.id);

  // 2) Dönem aralığı
  const start = new Date(periodYear, periodMonth - 1, 1);
  const end = new Date(periodYear, periodMonth, 1);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // 3) Paralel fetch: GES üretim + tüketim + PTF
  const [gesRes, cnRes, ptfRes] = await Promise.all([
    fetchAllGesProduction(supabase, plantIds, startIso, endIso),
    fetchAllConsumption({
      supabase,
      userId,
      subscriptionSerno,
      columns: "ts, cn, gn",
      startIso,
      endIso,
    }),
    fetchAllPtf({ supabase, startIso, endIso }),
  ]);

  if (gesRes.error || cnRes.error || ptfRes.error) return null;

  // Metod 7: ham tüketime trafo kaybı t da girer (her saat, eksik satırlar dahil) —
  // GES'ten bağımsız, iki dünyada aynı. Diğer metodlarda null → satırlar aynen.
  const meramRows = meramCounterfactualRows(params.methodInputs, cnRes.data, startIso, endIso);
  const cnRows = meramRows ? meramRows.rows : cnRes.data;

  let totalHamKwh = 0;
  let totalGesKwh = 0;
  let hamPtfTl = 0; // Σ(ham_kwh × ptf_TL_per_kWh)

  if (gesRes.data.length > 0) {
    // 4a) Hourly path — GES üretimi saat bazında topla (birden fazla plant olabilir)
    const gesMap = new Map<number, number>();
    for (const r of gesRes.data) {
      const key = hourKey(r.ts);
      gesMap.set(key, (gesMap.get(key) ?? 0) + (Number(r.energy_kwh) || 0));
    }

    // PTF map
    const ptfMap = new Map<number, number>();
    for (const r of ptfRes.data) {
      ptfMap.set(hourKey(r.ts), Number(r.ptf_tl_mwh) || 0);
    }

    // Saat bazında ham tüketim hesapla + PTF ağırlıklı ortalama
    for (const row of cnRows) {
      const key = hourKey(row.ts);
      const cn = Number(row.cn) || 0;
      const gn = Number(row.gn) || 0;
      const gesKwh = gesMap.get(key) ?? 0;
      const ptfMwh = ptfMap.get(key);

      totalGesKwh += gesKwh;

      // Ham tüketim = çekiş + GES üretim - veriş (min 0)
      const ham = Math.max(0, cn + gesKwh - gn);
      totalHamKwh += ham;

      // PTF maliyeti (ham tüketim ağırlıklı)
      if (ptfMwh != null && ham > 0) {
        hamPtfTl += ham * (ptfMwh / 1000); // TL/MWh → TL/kWh
      }
    }
  } else {
    // 4b) Daily fallback — hourly tablosunda bu dönem için satır yok.
    // ges_production_daily'den günlük üretimi al, consumption + PTF saatlerini
    // TR-gününe göre agrega et, gün-ağırlıklı PTF ortalaması ile hesapla.
    const { startDate, endDateExclusive } = monthDateBounds(periodYear, periodMonth);
    const dailyRes = await fetchAllGesProductionDaily(
      supabase,
      plantIds,
      startDate,
      endDateExclusive,
    );
    if (dailyRes.error || dailyRes.data.length === 0) return null;

    const gesDayMap = new Map<string, number>();
    for (const r of dailyRes.data) {
      const k = String(r.date); // PostgreSQL date → "YYYY-MM-DD"
      gesDayMap.set(k, (gesDayMap.get(k) ?? 0) + (Number(r.energy_kwh) || 0));
    }

    type DayAgg = { cn: number; gn: number; ptfSum: number; ptfCount: number };
    const dayMap = new Map<string, DayAgg>();
    for (const row of cnRows) {
      const k = dayKeyTR(row.ts);
      const agg = dayMap.get(k) ?? { cn: 0, gn: 0, ptfSum: 0, ptfCount: 0 };
      agg.cn += Number(row.cn) || 0;
      agg.gn += Number(row.gn) || 0;
      dayMap.set(k, agg);
    }
    for (const row of ptfRes.data) {
      const k = dayKeyTR(row.ts);
      const agg = dayMap.get(k);
      if (!agg) continue; // consumption olmayan günleri sayma
      agg.ptfSum += Number(row.ptf_tl_mwh) || 0;
      agg.ptfCount += 1;
    }

    for (const [day, agg] of dayMap) {
      const gesKwh = gesDayMap.get(day) ?? 0;
      totalGesKwh += gesKwh;

      const ham = Math.max(0, agg.cn + gesKwh - agg.gn);
      totalHamKwh += ham;

      if (agg.ptfCount > 0 && ham > 0) {
        const dailyAvgPtfMwh = agg.ptfSum / agg.ptfCount;
        hamPtfTl += ham * (dailyAvgPtfMwh / 1000);
      }
    }
  }

  if (totalHamKwh === 0) return null;

  // 7) Ham tüketim-ağırlıklı ortalama PTF (TL/kWh)
  const hamWeightedPtf = hamPtfTl / totalHamKwh;

  // 8) GES olmasaydı birim fiyat. m7: Y = mevcut girdinin YEKDEM'i (final varsa final).
  const cfYekdem =
    meramRows && params.methodInputs ? params.methodInputs.tahminiYekdem : params.monthlyYekdem;
  const hamUnitPriceEnergy =
    (hamWeightedPtf + cfYekdem) * params.kbk + (params.unitPriceAdjustment ?? 0);

  // 8b) Metod 2/3 karşı-olgusal girdiler: GES yok → gn=0 ⇒ pos=cn=ham,
  // mahsup/excess=0, wPos = ham-ağırlıklı ÇIPLAK PTF (zaten hesaplandı).
  // Önceki dönem alanları mevcut dünyadan aynen taşınır (gerçekleşmiş veri).
  const counterfactualMi: InvoiceMethodInputs | undefined =
    isNetInvoiceMethod(methodId)
      ? {
          sumCn: totalHamKwh,
          sumGn: 0,
          sumPos: totalHamKwh,
          sumMahsup: 0,
          sumExcess: 0,
          wPos: hamWeightedPtf,
          kbk: params.kbk,
          tahminiYekdem: cfYekdem,
          prevSumPos: params.methodInputs?.prevSumPos ?? null,
          prevTahminiYekdem: params.methodInputs?.prevTahminiYekdem ?? null,
          prevGerceklesenYekdem: params.methodInputs?.prevGerceklesenYekdem ?? null,
          mahsuplasmaUnitPrice: null, // mahsup 0 → muhtelif-2 zaten 0
          ...(meramRows && params.methodInputs
            ? { meram: meramCounterfactualBlock(params.methodInputs, meramRows.trafoKwh) }
            : {}),
        }
      : undefined;

  // 9) GES olmasaydı fatura (veriş = 0, çünkü GES yok)
  const gesOlmasaydiBreakdown = calculateInvoiceForMethod(methodId, {
    totalConsumptionKwh: totalHamKwh,
    unitPriceEnergy: hamUnitPriceEnergy,
    unitPriceDistribution: params.unitPriceDistribution,
    btvRate: params.btvRate,
    vatRate: params.vatRate,
    tariffType: params.tariffType,
    contractPowerKw: params.contractPowerKw,
    monthFinalDemandKw: params.monthFinalDemandKw,
    powerPrice: params.powerPrice,
    powerExcessPrice: params.powerExcessPrice,
    reactivePenaltyCharge: params.reactivePenaltyCharge,
    trafoDegeri: params.trafoDegeri,
    totalProductionKwh: 0, // GES yok → veriş yok
    // on_yil ve perakende irrelevant — veriş 0
    methodInputs: counterfactualMi,
    ipragazYekBirlesik,
  });

  return assembleResult({
    params,
    mode: "producer",
    breakdown: gesOlmasaydiBreakdown,
    hamTuketimKwh: totalHamKwh,
    gesUretimKwh: totalGesKwh,
    hamBirimFiyat: hamUnitPriceEnergy,
  });
}
