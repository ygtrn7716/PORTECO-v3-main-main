// src/components/utils/calculateInvoiceToDate.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayjsTR, TR_TZ } from "@/lib/dayjs";
import {
  calculateInvoice,
  calculateYekdemMahsup,
} from "@/components/utils/calculateInvoice";
import type { InvoiceBreakdown, TariffType } from "@/components/utils/calculateInvoice";
import {
  fetchInvoiceOverrides,
  applyReactiveValueOverrides,
  resolveUnitPriceOverride,
} from "@/components/utils/invoiceOverrides";
import { fetchAllConsumption, fetchAllPtf } from "@/lib/paginatedFetch";

type TariffRow = {
  dagitim_bedeli: number | null;
  guc_bedeli: number | null;
  guc_bedeli_asim: number | null;
  kdv: number | null;
  btv: number | null;
  reaktif_bedel: number | null;
};

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isMissingColumnError(err: any, col: string) {
  const msg = String(err?.message ?? "");
  return msg.includes("does not exist") && msg.includes(col);
}

function mapTermToTariffType(term: string | null | undefined): TariffType {
  return term === "cift_terim" ? "dual" : "single";
}

function hourKeyUtc(ts: any) {
  // timestampz -> UTC hour key
  return new Date(ts).toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
}

async function fetchSubYekdemValue(
  supabase: SupabaseClient,
  params: { uid: string; sub: number; year: number; month: number }
): Promise<{ yekdem_value: number | null; usd_kur: number | null }> {
  const { uid, sub, year, month } = params;

  // 1) period_year/period_month (primary)
  const r1 = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value, usd_kur")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (!r1.error) {
    return {
      yekdem_value: r1.data?.yekdem_value != null ? num(r1.data.yekdem_value, 0) : null,
      usd_kur: r1.data?.usd_kur != null ? num(r1.data.usd_kur, 0) : null,
    };
  }

  // 2) year/month (fallback)
  if (isMissingColumnError(r1.error, "period_year") || isMissingColumnError(r1.error, "period_month")) {
    const r2 = await supabase
      .from("subscription_yekdem")
      .select("yekdem_value, usd_kur")
      .eq("user_id", uid)
      .eq("subscription_serno", sub)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (r2.error) throw r2.error;
    return {
      yekdem_value: r2.data?.yekdem_value != null ? num(r2.data.yekdem_value, 0) : null,
      usd_kur: r2.data?.usd_kur != null ? num(r2.data.usd_kur, 0) : null,
    };
  }

  throw r1.error;
}

async function fetchSubYekdemForMahsup(
  supabase: SupabaseClient,
  params: { uid: string; sub: number; year: number; month: number }
): Promise<{ yekdem_value: number | null; yekdem_final: number | null } | null> {
  const { uid, sub, year, month } = params;

  // 1) period_year/period_month (primary)
  const r1 = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value, yekdem_final")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (!r1.error) {
    if (!r1.data) return null;
    return {
      yekdem_value: r1.data.yekdem_value != null ? num(r1.data.yekdem_value, 0) : null,
      yekdem_final: r1.data.yekdem_final != null ? num(r1.data.yekdem_final, 0) : null,
    };
  }

  // 2) year/month (fallback)
  if (isMissingColumnError(r1.error, "period_year") || isMissingColumnError(r1.error, "period_month")) {
    const r2 = await supabase
      .from("subscription_yekdem")
      .select("yekdem_value, yekdem_final")
      .eq("user_id", uid)
      .eq("subscription_serno", sub)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (r2.error) throw r2.error;
    if (!r2.data) return null;

    return {
      yekdem_value: r2.data.yekdem_value != null ? num(r2.data.yekdem_value, 0) : null,
      yekdem_final: r2.data.yekdem_final != null ? num(r2.data.yekdem_final, 0) : null,
    };
  }

  throw r1.error;
}

async function fetchSubDigerDegerler(
  supabase: SupabaseClient,
  params: { uid: string; sub: number; year: number; month: number }
): Promise<number> {
  const { uid, sub, year, month } = params;

  const r1 = await supabase
    .from("subscription_yekdem")
    .select("diger_degerler")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (!r1.error) return num(r1.data?.diger_degerler, 0);

  if (isMissingColumnError(r1.error, "year") || isMissingColumnError(r1.error, "month")) {
    const r2 = await supabase
      .from("subscription_yekdem")
      .select("diger_degerler")
      .eq("user_id", uid)
      .eq("subscription_serno", sub)
      .eq("period_year", year)
      .eq("period_month", month)
      .maybeSingle();

    if (r2.error) throw r2.error;
    return num(r2.data?.diger_degerler, 0);
  }

  throw r1.error;
}

async function fetchPtfMapToDate(params: {
  supabase: SupabaseClient;
  startIso: string;
  endIso: string; // inclusive end
}) {
  const { supabase, startIso, endIso } = params;

  // önce ptf_tl_kwh dene (paginated - PostgREST max_rows limiti aşılmasın)
  const r1 = await fetchAllPtf({
    supabase,
    columns: "ts, ptf_tl_kwh",
    startIso,
    endIso,
    endInclusive: true,
  });

  if (!r1.error) {
    const map = new Map<string, number>();
    for (const row of r1.data ?? []) {
      const v = num((row as any).ptf_tl_kwh, NaN);
      if (!Number.isFinite(v)) continue;
      map.set(hourKeyUtc((row as any).ts), v);
    }
    return map;
  }

  // fallback: ptf_tl_mwh / 1000
  if (isMissingColumnError(r1.error, "ptf_tl_kwh")) {
    const r2 = await fetchAllPtf({
      supabase,
      columns: "ts, ptf_tl_mwh",
      startIso,
      endIso,
      endInclusive: true,
    });

    if (r2.error) throw r2.error;

    const map = new Map<string, number>();
    for (const row of r2.data ?? []) {
      const mwh = num((row as any).ptf_tl_mwh, NaN);
      if (!Number.isFinite(mwh)) continue;
      map.set(hourKeyUtc((row as any).ts), mwh / 1000); // TL/kWh
    }
    return map;
  }

  throw r1.error;
}

export type MonthInvoiceToDateResult = {
  periodYear: number;
  periodMonth: number;

  rangeStart: string; // TR text
  rangeEnd: string;   // TR text
  rangeStartIso: string;
  rangeEndIso: string;

  totalConsumptionKwh: number; // ptf ile eşleşen saatlerin tüketimi
  totalProductionKwh: number;  // veriş (gn) toplam kWh
  skippedKwh: number;          // ptf olmayan saatler varsa

  monthlyPTF_tl_kwh: number;   // tüketim-ağırlıklı ort PTF
  monthlyYekdem_tl_kwh: number;
  monthlyUsdKur: number;       // 0 ise fallback (perakende_enerji_bedeli)

  kbk: number;
  unitPriceEnergy: number;        // (PTF+YEKDEM)*KBK
  unitPriceDistribution: number;  // TL/kWh

  btvRate: number;
  vatRate: number;
  tariffType: TariffType;

  contractPowerKw: number;
  monthFinalDemandKw: number;
  hasDemandData: boolean;

  reactivePenaltyCharge: number;
  reactiveRiPercent: number;
  reactiveRcPercent: number;

  trafoDegeri: number;
  digerDegerler: number;

  onYil: boolean;
  lisansliSatis: boolean;
  perakendeEnerjiBedeli: number;
  // GES Üretim Satışı dağıtım kesinti oranı (TL/kWh) — lisansli_satis'e göre seçilmiş.
  dagitimUreticiBedeli: number;

  breakdown: InvoiceBreakdown;

  hasYekdemMahsup: boolean;
  yekdemMahsup: number;
  yekdemMissing: "none" | "value" | "final" | "both";

  totalWithMahsup: number;

  // ── Ay-içi paneli için opsiyonel davranışlar ──
  isProjected: boolean;            // projectToMonthEnd uygulandı mı
  projectionFactor: number;        // f = aydakiToplamGun / gecenGun (yoksa 1)
  projectedConsumptionKwh: number; // billableKwh × f (ay sonu tahmini tüketim)
  projectedTrafoKwh: number;       // trafoDegeri × f (ay sonu tahmini trafo kaybı)
  gesMahsupExcluded: boolean;      // GES/veriş kaynaklı mahsup hesaba katılmadı mı
};

export async function computeMonthInvoiceToDate(params: {
  supabase: SupabaseClient;
  uid: string;
  subscriptionSerNo: number;
  year: number;
  month: number; // 1-12
  requirePrevMonthMahsup?: boolean; // default: false (card’ı öldürmesin)
  // ── ConsumptionDetail (/dashboard/consumption) ay-içi tahmini fatura paneli için ──
  // GES/veriş kaynaklı mahsubu hesaptan çıkar (veriş kWh = 0 kabul edilir):
  //  • dağıtımdaki yarı-mahsup (D/2 × veriş) devre dışı → dağıtım tam çekiş üzerinden
  //  • "GES Üretim Satışı" (veriş satış) kalemi tetiklenmez
  // NOT: "Önceki Dönem YEKDEM Mahsubu" bundan ETKİLENMEZ (o YEKDEM mahsubu, GES değil).
  excludeGesMahsup?: boolean; // default: false
  // Tüketimi ay sonuna projekte et (günlük ortalama × kalan gün). kWh ile çarpılan
  // tüm kalemler (enerji, dağıtım, trafo, BTV) ve reaktif ceza bu faktörle ölçeklenir.
  projectToMonthEnd?: boolean; // default: false
}): Promise<MonthInvoiceToDateResult | null> {
  const {
    supabase,
    uid,
    subscriptionSerNo,
    year,
    month,
    requirePrevMonthMahsup = false,
    excludeGesMahsup = false,
    projectToMonthEnd = false,
  } = params;

  // M (bu ay)
  const m = dayjsTR().year(year).month(month - 1);
  const monthStart = m.startOf("month");
  const monthEndExclusive = monthStart.clone().add(1, "month");

  const monthStartIso = monthStart.toDate().toISOString();
  const monthEndExclusiveIso = monthEndExclusive.toDate().toISOString();

  // ✅ şart: bu ay için yekdem_value girilmiş olmalı (senin istediğin davranış)
  // + usd_kur (10 yıl üstü tesislerde veriş fazlası satış birim fiyatı için)
  const yekRow = await fetchSubYekdemValue(supabase, {
    uid,
    sub: subscriptionSerNo,
    year,
    month,
  });
  if (yekRow.yekdem_value == null) return null;
  const monthlyYekdem = yekRow.yekdem_value;
  const monthlyUsdKur = yekRow.usd_kur ?? 0;

  // Fatura kalem override'ları (cari ay) — admin müdahaleleri to-date tahmine de
  // yansır. Fail-open: tahmin paneli hiçbir yere yazmaz, hata → doğal değerler.
  const lineOverrides = await fetchInvoiceOverrides({
    userId: uid,
    subscriptionSerno: subscriptionSerNo,
    periodYear: year,
    periodMonth: month,
  }).catch((e) => {
    console.error("invoice overrides load error (to-date):", e);
    return null;
  });

  // PTF cutoff (bu ay içinde en son ts)
  const maxPtf = await supabase
    .from("epias_ptf_hourly")
    .select("ts")
    .gte("ts", monthStartIso)
    .lt("ts", monthEndExclusiveIso)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxPtf.error) throw maxPtf.error;
  if (!maxPtf.data?.ts) return null;

  const cutoffIso = new Date(maxPtf.data.ts as any).toISOString();

  // PTF map (start -> cutoff inclusive)
  const ptfMap = await fetchPtfMapToDate({
    supabase,
    startIso: monthStartIso,
    endIso: cutoffIso,
  });

  if (ptfMap.size === 0) return null;

  // tüketim (start -> cutoff inclusive) + reaktif yüzdeler için ri/rc
  // paginated - PostgREST max_rows limiti aşılmasın
  const cons = await fetchAllConsumption({
    supabase,
    userId: uid,
    subscriptionSerno: subscriptionSerNo,
    columns: "ts, cn, ri, rc, gn",
    startIso: monthStartIso,
    endIso: cutoffIso,
    endInclusive: true,
  });

  if (cons.error) throw cons.error;

  let billableKwh = 0;
  let skippedKwh = 0;

  let sumPtfWeighted = 0; // Σ (kWh * ptf_kwh)

  let totalRi = 0;
  let totalRc = 0;
  let totalGn = 0;
  let netPositiveDrawKwh = 0; // Σ max(0, cn − gn) — saatlik net pozitif çekiş
  let netExcessFeedKwh = 0;   // Σ max(0, gn − cn) — saatlik net fazla veriş

  for (const row of cons.data ?? []) {
    const cn = num((row as any).cn, 0);
    const ri = num((row as any).ri, 0);
    const rc = num((row as any).rc, 0);
    const gn = num((row as any).gn, 0);

    totalRi += ri;
    totalRc += rc;
    totalGn += gn;
    // cn>0 atlamasından ÖNCE birik: yalnız-verişli saatler de net fazla verişe saysın.
    netPositiveDrawKwh += Math.max(0, cn - gn);
    netExcessFeedKwh += Math.max(0, gn - cn);

    if (!(cn > 0)) continue;

    const k = hourKeyUtc((row as any).ts);
    const ptf = ptfMap.get(k);

    if (ptf == null || !Number.isFinite(ptf)) {
      skippedKwh += cn;
      continue;
    }

    billableKwh += cn;
    sumPtfWeighted += cn * ptf;
  }

  if (!(billableKwh > 0)) return null;

  const monthlyPTF = sumPtfWeighted / billableKwh; // tüketim ağırlıklı ortalama

  // settings: KBK, terim, gerilim, tarife, güç limit, trafo
  const settingsRes = await supabase
    .from("subscription_settings")
    .select("kbk, terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil, lisansli_satis, unit_price_adjustment")
    .eq("user_id", uid)
    .eq("subscription_serno", subscriptionSerNo)
    .maybeSingle();

  if (settingsRes.error) throw settingsRes.error;
  if (!settingsRes.data) return null;

  const kbk = num(settingsRes.data.kbk, 1);
  const terim = settingsRes.data.terim ?? null;
  const gerilim = settingsRes.data.gerilim ?? null;
  const tarife = settingsRes.data.tarife ?? null;

  const contractPowerKw = num(settingsRes.data.guc_bedel_limit, 0);
  const trafoDegeri = num(settingsRes.data.trafo_degeri, 0);
  const onYil = settingsRes.data.on_yil ?? false;
  const lisansliSatis = settingsRes.data.lisansli_satis ?? false;
  // Birim fiyat düzeltmesi (TL/kWh, +/-): (PTF+YEKDEM)*KBK sonrası eklenir. null = 0.
  const unitPriceAdjustment = num(settingsRes.data.unit_price_adjustment, 0);

  if (!terim || !gerilim || !tarife) return null;

  const tariffType = mapTermToTariffType(terim);

  // multiplier + btv_enabled (owner_subscriptions)
  let multiplier = 1;
  let btvEnabled = true;

  const subRes1 = await supabase
    .from("owner_subscriptions")
    .select("multiplier, btv_enabled")
    .eq("user_id", uid)
    .eq("subscription_serno", subscriptionSerNo)
    .maybeSingle();

  if (subRes1.error) throw subRes1.error;
  if (subRes1.data?.multiplier != null && Number.isFinite(Number(subRes1.data.multiplier))) {
    multiplier = Number(subRes1.data.multiplier);
    btvEnabled = subRes1.data.btv_enabled ?? true;
  } else {
    const subRes2 = await supabase
      .from("owner_subscriptions")
      .select("multiplier, btv_enabled")
      .eq("subscription_serno", subscriptionSerNo)
      .maybeSingle();

    if (subRes2.error) throw subRes2.error;
    if (subRes2.data?.multiplier != null && Number.isFinite(Number(subRes2.data.multiplier))) {
      multiplier = Number(subRes2.data.multiplier);
    }
    btvEnabled = subRes2.data?.btv_enabled ?? true;
  }

  // resmi dağıtım/güç tarifesi
  const tariffRes = await supabase
    .from("distribution_tariff_official")
    .select("dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel, perakende_enerji_bedeli, dagitim_uretici_1, dagitim_uretici_2")
    .eq("terim", terim)
    .eq("gerilim", gerilim)
    .eq("tarife", tarife)
    .maybeSingle();

  if (tariffRes.error) throw tariffRes.error;
  const t = tariffRes.data as TariffRow | null;
  if (!t) return null;

  const unitPriceDistribution = num(t.dagitim_bedeli, 0);
  const perakendeEnerjiBedeli = num((t as any).perakende_enerji_bedeli, 0);
  // GES Üretim Satışı dağıtım kesinti oranı (lisansli_satis'e göre; on_yil etkilemez).
  const dagitimUreticiBedeli = lisansliSatis
    ? num((t as any).dagitim_uretici_1, 0)
    : num((t as any).dagitim_uretici_2, 0);
  const powerPrice = num(t.guc_bedeli, 0);
  const powerExcessPrice = num(t.guc_bedeli_asim, 0);

  const btvRate = btvEnabled ? num(t.btv, 0) / 100 : 0;
  const vatRate = num(t.kdv, 0) / 100;

  // reaktif ceza (InvoiceDetail ile aynı)
  const REACTIVE_LIMIT_RI = 20;
  const REACTIVE_LIMIT_RC = 15;

  // Payload override'ı varsa Ri/Rc toplamları mutlak değiştirilir.
  const { riSum: effTotalRi, rcSum: effTotalRc } = applyReactiveValueOverrides(
    totalRi,
    totalRc,
    lineOverrides
  );

  const riPercent = billableKwh > 0 ? (effTotalRi / billableKwh) * 100 : 0;
  const rcPercent = billableKwh > 0 ? (effTotalRc / billableKwh) * 100 : 0;

  const reactiveUnitPrice = num(t.reaktif_bedel, 0);
  const riPenaltyEnergy = riPercent > REACTIVE_LIMIT_RI ? effTotalRi : 0;
  const rcPenaltyEnergy = rcPercent > REACTIVE_LIMIT_RC ? effTotalRc : 0;
  const penaltyEnergy = riPenaltyEnergy + rcPenaltyEnergy;
  const reactivePenaltyCharge = penaltyEnergy * reactiveUnitPrice; // KDV öncesi

  const dmRes = await supabase
    .from("demand_monthly")
    .select("period_year, period_month, max_demand_kw")
    .eq("user_id", uid)
    .eq("subscription_serno", subscriptionSerNo)
    .eq("period_year", year)
    .eq("period_month", month)
    .eq("is_final", true)
    .maybeSingle();

  if (dmRes.error) throw dmRes.error;

  const hasDemandData = !!dmRes.data;
  const monthFinalDemandKw = hasDemandData
    ? num(dmRes.data?.max_demand_kw, 0) * multiplier
    : 0;

  // unitPriceEnergy (InvoiceDetail ile aynı)
  const unitPriceEnergy = (monthlyPTF + monthlyYekdem) * kbk + unitPriceAdjustment;
  // Efektif (override'lı) birim fiyatlar — sonuç gösterim alanları için.
  // calculateInvoice'a DOĞAL fiyatlar geçilir; override içeride uygulanır.
  const effectiveUnitPriceEnergy = resolveUnitPriceOverride(
    unitPriceEnergy,
    lineOverrides?.enerji
  );
  const effectiveUnitPriceDistribution = resolveUnitPriceOverride(
    unitPriceDistribution,
    lineOverrides?.dagitim
  );

  // diger_degerler (KDV dahil gibi ekleniyor)
  const digerDegerler = await fetchSubDigerDegerler(supabase, {
    uid,
    sub: subscriptionSerNo,
    year,
    month,
  });

  // ── Ay sonu projeksiyonu (opsiyonel) ──
  // gecenGun       = bugünün ayın kaçıncı günü (TR, now.getDate())
  // gunlukOrtalama = billableKwh / gecenGun
  // tahmini        = billableKwh + (kalanGun × gunlukOrtalama)
  // f = tahmini / billableKwh = aydakiToplamGun / gecenGun  (matematiksel olarak aynı)
  // Guard: gecenGun=0 veya billableKwh=0 ise projeksiyon YOK (f=1, ham değer kullanılır).
  const gecenGun = dayjsTR().date();
  const aydakiToplamGun = m.daysInMonth();
  const projectionFactor =
    projectToMonthEnd && gecenGun > 0 && billableKwh > 0 && aydakiToplamGun > 0
      ? aydakiToplamGun / gecenGun
      : 1;

  const projConsumptionKwh = billableKwh * projectionFactor;
  const projTrafoKwh = trafoDegeri * projectionFactor;
  // Reaktif ceza: RI/RC oranları (eşik kararı) değişmez; yalnız mutlak tutar f ile ölçeklenir.
  const projReactivePenaltyCharge = reactivePenaltyCharge * projectionFactor;

  // GES mahsubu hariç tutulacaksa veriş 0 kabul edilir (yarı-mahsup + veriş satış kapanır).
  // Aksi halde veriş ve saatlik net değerleri de projeksiyon faktörüyle ölçeklenir.
  const productionForCalc = excludeGesMahsup ? 0 : totalGn * projectionFactor;
  const netPositiveDrawForCalc = excludeGesMahsup
    ? undefined
    : netPositiveDrawKwh * projectionFactor;
  const netExcessFeedForCalc = excludeGesMahsup
    ? undefined
    : netExcessFeedKwh * projectionFactor;

  // base invoice (mahsup hariç)
  const breakdown = calculateInvoice({
    totalConsumptionKwh: projConsumptionKwh,
    unitPriceEnergy,
    unitPriceDistribution,
    btvRate,
    vatRate,
    tariffType,
    contractPowerKw,
    monthFinalDemandKw,
    powerPrice,
    powerExcessPrice,
    reactivePenaltyCharge: projReactivePenaltyCharge,
    trafoDegeri: projTrafoKwh,
    totalProductionKwh: productionForCalc,
    onYil,
    perakendeEnerjiBedeli,
    usdKur: monthlyUsdKur,
    lisansliSatis,
    netPositiveDrawKwh: netPositiveDrawForCalc,
    netExcessFeedKwh: netExcessFeedForCalc,
  }, lineOverrides);

  // YEKDEM mahsup: M-1 (tam ay)  — InvoiceDetail ile aynı mantık
  // Lisanslı Satış tesisleri mahsup akışına hiç girmez.
  let yekdemMahsup = 0;
  let hasYekdemMahsup = false;
  let yekdemMissing: "none" | "value" | "final" | "both" = "both";

  if (lisansliSatis) {
    yekdemMissing = "none";
  } else {
   try {
    const prevForMahsup = m.subtract(1, "month"); // M-1
    const prevStart = prevForMahsup.startOf("month");
    const prevEndExclusive = prevStart.clone().add(1, "month");

    let prevKwh = 0;

    const dailyPrev = await supabase
      .from("consumption_daily")
      .select("day, kwh_in")
      .eq("user_id", uid)
      .eq("subscription_serno", subscriptionSerNo)
      .gte("day", prevStart.format("YYYY-MM-DD"))
      .lt("day", prevEndExclusive.format("YYYY-MM-DD"));

    if (!dailyPrev.error && dailyPrev.data?.length) {
      prevKwh = (dailyPrev.data ?? []).reduce(
        (sum: number, r: any) => sum + (num(r.kwh_in, 0)),
        0
      );
    } else {
      const hourlyPrev = await fetchAllConsumption({
        supabase,
        userId: uid,
        subscriptionSerno: subscriptionSerNo,
        columns: "ts, cn",
        startIso: prevStart.toDate().toISOString(),
        endIso: prevEndExclusive.toDate().toISOString(),
      });

      if (!hourlyPrev.error && hourlyPrev.data?.length) {
        prevKwh = (hourlyPrev.data ?? []).reduce(
          (sum: number, r: any) => sum + (num(r.cn, 0)),
          0
        );
      }
    }

    if (prevKwh > 0) {
      const yRow = await fetchSubYekdemForMahsup(supabase, {
        uid,
        sub: subscriptionSerNo,
        year: prevForMahsup.year(),
        month: prevForMahsup.month() + 1,
      });

      if (yRow) {
        const hasValue = yRow.yekdem_value != null;
        const hasFinal = yRow.yekdem_final != null;

        if (hasValue && hasFinal) {
          yekdemMahsup = calculateYekdemMahsup({
            totalKwh: prevKwh,
            kbk,
            btvRate,
            vatRate,
            yekdemOld: num(yRow.yekdem_value, 0),
            yekdemNew: num(yRow.yekdem_final, 0),
          });
          hasYekdemMahsup = true;
          yekdemMissing = "none";
        } else if (!hasValue && !hasFinal) {
          yekdemMissing = "both";
        } else if (!hasValue) {
          yekdemMissing = "value";
        } else {
          yekdemMissing = "final";
        }
      }
    }
   } catch {
    yekdemMahsup = 0;
    hasYekdemMahsup = false;
   }
  }

  if (requirePrevMonthMahsup && !hasYekdemMahsup && !lisansliSatis) return null;

  const totalWithMahsup = breakdown.totalInvoice + yekdemMahsup + digerDegerler;

  return {
    periodYear: year,
    periodMonth: month,

    rangeStart: monthStart.format("DD.MM.YYYY HH:mm"),
    rangeEnd: dayjsTR(cutoffIso).format("DD.MM.YYYY HH:mm"),
    rangeStartIso: monthStartIso,
    rangeEndIso: cutoffIso,

    totalConsumptionKwh: billableKwh,
    totalProductionKwh: totalGn,
    skippedKwh,

    monthlyPTF_tl_kwh: monthlyPTF,
    monthlyYekdem_tl_kwh: monthlyYekdem,
    monthlyUsdKur,

    kbk,
    // Gösterim alanları efektif (override'lı) birim fiyatlar.
    unitPriceEnergy: effectiveUnitPriceEnergy,
    unitPriceDistribution: effectiveUnitPriceDistribution,

    btvRate,
    vatRate,
    tariffType,

    contractPowerKw,
    monthFinalDemandKw,
    hasDemandData,

    // Kalem override'ı (amount/exclude) dahil nihai ceza.
    reactivePenaltyCharge: breakdown.reactivePenaltyCharge,
    reactiveRiPercent: riPercent,
    reactiveRcPercent: rcPercent,

    trafoDegeri,
    digerDegerler,

    onYil,
    lisansliSatis,
    perakendeEnerjiBedeli,
    dagitimUreticiBedeli,

    breakdown,

    hasYekdemMahsup,
    yekdemMahsup,
    yekdemMissing,

    totalWithMahsup,

    isProjected: projectToMonthEnd,
    projectionFactor,
    projectedConsumptionKwh: projConsumptionKwh,
    projectedTrafoKwh: projTrafoKwh,
    gesMahsupExcluded: excludeGesMahsup,
  };
}
