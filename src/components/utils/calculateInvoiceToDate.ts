// src/components/utils/calculateInvoiceToDate.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayjsTR, TR_TZ } from "@/lib/dayjs";
import {
  calculateInvoice,
  calculateYekdemMahsup,
} from "@/components/utils/calculateInvoice";
import type { InvoiceBreakdown, TariffType } from "@/components/utils/calculateInvoice";

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
): Promise<number | null> {
  const { uid, sub, year, month } = params;

  const r1 = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (!r1.error) return r1.data?.yekdem_value != null ? num(r1.data.yekdem_value, 0) : null;

  if (isMissingColumnError(r1.error, "year") || isMissingColumnError(r1.error, "month")) {
    const r2 = await supabase
      .from("subscription_yekdem")
      .select("yekdem_value")
      .eq("user_id", uid)
      .eq("subscription_serno", sub)
      .eq("period_year", year)
      .eq("period_month", month)
      .maybeSingle();

    if (r2.error) throw r2.error;
    return r2.data?.yekdem_value != null ? num(r2.data.yekdem_value, 0) : null;
  }

  throw r1.error;
}

async function fetchSubYekdemForMahsup(
  supabase: SupabaseClient,
  params: { uid: string; sub: number; year: number; month: number }
): Promise<{ yekdem_value: number | null; yekdem_final: number | null } | null> {
  const { uid, sub, year, month } = params;

  const r1 = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value, yekdem_final")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (!r1.error) {
    if (!r1.data) return null;
    return {
      yekdem_value: r1.data.yekdem_value != null ? num(r1.data.yekdem_value, 0) : null,
      yekdem_final: r1.data.yekdem_final != null ? num(r1.data.yekdem_final, 0) : null,
    };
  }

  if (isMissingColumnError(r1.error, "year") || isMissingColumnError(r1.error, "month")) {
    const r2 = await supabase
      .from("subscription_yekdem")
      .select("yekdem_value, yekdem_final")
      .eq("user_id", uid)
      .eq("subscription_serno", sub)
      .eq("period_year", year)
      .eq("period_month", month)
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

  // önce ptf_tl_kwh dene
  const r1 = await supabase
    .from("epias_ptf_hourly")
    .select("ts, ptf_tl_kwh")
    .gte("ts", startIso)
    .lte("ts", endIso);

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
    const r2 = await supabase
      .from("epias_ptf_hourly")
      .select("ts, ptf_tl_mwh")
      .gte("ts", startIso)
      .lte("ts", endIso);

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
  skippedKwh: number;          // ptf olmayan saatler varsa

  monthlyPTF_tl_kwh: number;   // tüketim-ağırlıklı ort PTF
  monthlyYekdem_tl_kwh: number;

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

  breakdown: InvoiceBreakdown;

  hasYekdemMahsup: boolean;
  yekdemMahsup: number;

  totalWithMahsup: number;
};

export async function computeMonthInvoiceToDate(params: {
  supabase: SupabaseClient;
  uid: string;
  subscriptionSerNo: number;
  year: number;
  month: number; // 1-12
  requirePrevMonthMahsup?: boolean; // default: false (card’ı öldürmesin)
}): Promise<MonthInvoiceToDateResult | null> {
  const {
    supabase,
    uid,
    subscriptionSerNo,
    year,
    month,
    requirePrevMonthMahsup = false,
  } = params;

  // M (bu ay)
  const m = dayjsTR().year(year).month(month - 1);
  const monthStart = m.startOf("month");
  const monthEndExclusive = monthStart.clone().add(1, "month");

  const monthStartIso = monthStart.toDate().toISOString();
  const monthEndExclusiveIso = monthEndExclusive.toDate().toISOString();

  // ✅ şart: bu ay için yekdem_value girilmiş olmalı (senin istediğin davranış)
  const monthlyYekdem = await fetchSubYekdemValue(supabase, {
    uid,
    sub: subscriptionSerNo,
    year,
    month,
  });
  if (monthlyYekdem == null) return null;

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
  const cons = await supabase
    .from("consumption_hourly")
    .select("ts, cn, ri, rc")
    .eq("user_id", uid)
    .eq("subscription_serno", subscriptionSerNo)
    .gte("ts", monthStartIso)
    .lte("ts", cutoffIso);

  if (cons.error) throw cons.error;

  let billableKwh = 0;
  let skippedKwh = 0;

  let sumPtfWeighted = 0; // Σ (kWh * ptf_kwh)

  let totalRi = 0;
  let totalRc = 0;

  for (const row of cons.data ?? []) {
    const cn = num((row as any).cn, 0);
    const ri = num((row as any).ri, 0);
    const rc = num((row as any).rc, 0);

    totalRi += ri;
    totalRc += rc;

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

  // settings: KBK, terim, gerilim, tarife, güç limit, trafo, btv_enabled
  const settingsRes = await supabase
    .from("subscription_settings")
    .select("kbk, terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, btv_enabled")
    .eq("user_id", uid)
    .eq("subscription_serno", subscriptionSerNo)
    .maybeSingle();

  if (settingsRes.error) throw settingsRes.error;
  if (!settingsRes.data) return null;

  const kbk = num(settingsRes.data.kbk, 1);
  const terim = settingsRes.data.terim ?? null;
  const gerilim = settingsRes.data.gerilim ?? null;
  const tarife = settingsRes.data.tarife ?? null;
  const btvEnabled = settingsRes.data.btv_enabled ?? true;

  const contractPowerKw = num(settingsRes.data.guc_bedel_limit, 0);
  const trafoDegeri = num(settingsRes.data.trafo_degeri, 0);

  if (!terim || !gerilim || !tarife) return null;

  const tariffType = mapTermToTariffType(terim);

  // resmi dağıtım/güç tarifesi
  const tariffRes = await supabase
    .from("distribution_tariff_official")
    .select("dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel")
    .eq("terim", terim)
    .eq("gerilim", gerilim)
    .eq("tarife", tarife)
    .maybeSingle();

  if (tariffRes.error) throw tariffRes.error;
  const t = tariffRes.data as TariffRow | null;
  if (!t) return null;

  const unitPriceDistribution = num(t.dagitim_bedeli, 0);
  const powerPrice = num(t.guc_bedeli, 0);
  const powerExcessPrice = num(t.guc_bedeli_asim, 0);

  const btvRate = btvEnabled ? num(t.btv, 0) / 100 : 0;
  const vatRate = num(t.kdv, 0) / 100;

  // reaktif ceza (InvoiceDetail ile aynı)
  const REACTIVE_LIMIT_RI = 20;
  const REACTIVE_LIMIT_RC = 15;

  const riPercent = billableKwh > 0 ? (totalRi / billableKwh) * 100 : 0;
  const rcPercent = billableKwh > 0 ? (totalRc / billableKwh) * 100 : 0;

  const reactiveUnitPrice = num(t.reaktif_bedel, 0);
  const riPenaltyEnergy = riPercent > REACTIVE_LIMIT_RI ? totalRi : 0;
  const rcPenaltyEnergy = rcPercent > REACTIVE_LIMIT_RC ? totalRc : 0;
  const penaltyEnergy = riPenaltyEnergy + rcPenaltyEnergy;
  const reactivePenaltyCharge = penaltyEnergy * reactiveUnitPrice; // KDV öncesi

  // demand (is_final varsa kullan, yoksa 0)
  let multiplier = 1;

  const subRes1 = await supabase
    .from("owner_subscriptions")
    .select("multiplier")
    .eq("user_id", uid)
    .eq("subscription_serno", subscriptionSerNo)
    .maybeSingle();

  if (subRes1.error) throw subRes1.error;
  if (subRes1.data?.multiplier != null && Number.isFinite(Number(subRes1.data.multiplier))) {
    multiplier = Number(subRes1.data.multiplier);
  } else {
    const subRes2 = await supabase
      .from("owner_subscriptions")
      .select("multiplier")
      .eq("subscription_serno", subscriptionSerNo)
      .maybeSingle();

    if (subRes2.error) throw subRes2.error;
    if (subRes2.data?.multiplier != null && Number.isFinite(Number(subRes2.data.multiplier))) {
      multiplier = Number(subRes2.data.multiplier);
    }
  }

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
  const unitPriceEnergy = (monthlyPTF + monthlyYekdem) * kbk;

  // diger_degerler (KDV dahil gibi ekleniyor)
  const digerDegerler = await fetchSubDigerDegerler(supabase, {
    uid,
    sub: subscriptionSerNo,
    year,
    month,
  });

  // base invoice (mahsup hariç)
  const breakdown = calculateInvoice({
    totalConsumptionKwh: billableKwh,
    unitPriceEnergy,
    unitPriceDistribution,
    btvRate,
    vatRate,
    tariffType,
    contractPowerKw,
    monthFinalDemandKw,
    powerPrice,
    powerExcessPrice,
    reactivePenaltyCharge,
    trafoDegeri,
  });

  // YEKDEM mahsup: M-1 (tam ay)  — InvoiceDetail ile aynı mantık
  let yekdemMahsup = 0;
  let hasYekdemMahsup = false;

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
      const hourlyPrev = await supabase
        .from("consumption_hourly")
        .select("ts, cn")
        .eq("user_id", uid)
        .eq("subscription_serno", subscriptionSerNo)
        .gte("ts", prevStart.toDate().toISOString())
        .lt("ts", prevEndExclusive.toDate().toISOString());

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

      if (yRow?.yekdem_value != null && yRow?.yekdem_final != null) {
        yekdemMahsup = calculateYekdemMahsup({
          totalKwh: prevKwh,
          kbk,
          btvRate,
          vatRate,
          yekdemOld: num(yRow.yekdem_value, 0),
          yekdemNew: num(yRow.yekdem_final, 0),
        });
        hasYekdemMahsup = true;
      }
    }
  } catch {
    yekdemMahsup = 0;
    hasYekdemMahsup = false;
  }

  if (requirePrevMonthMahsup && !hasYekdemMahsup) return null;

  const totalWithMahsup = breakdown.totalInvoice + yekdemMahsup + digerDegerler;

  return {
    periodYear: year,
    periodMonth: month,

    rangeStart: monthStart.format("DD.MM.YYYY HH:mm"),
    rangeEnd: dayjsTR(cutoffIso).format("DD.MM.YYYY HH:mm"),
    rangeStartIso: monthStartIso,
    rangeEndIso: cutoffIso,

    totalConsumptionKwh: billableKwh,
    skippedKwh,

    monthlyPTF_tl_kwh: monthlyPTF,
    monthlyYekdem_tl_kwh: monthlyYekdem,

    kbk,
    unitPriceEnergy,
    unitPriceDistribution,

    btvRate,
    vatRate,
    tariffType,

    contractPowerKw,
    monthFinalDemandKw,
    hasDemandData,

    reactivePenaltyCharge,
    reactiveRiPercent: riPercent,
    reactiveRcPercent: rcPercent,

    trafoDegeri,
    digerDegerler,

    breakdown,

    hasYekdemMahsup,
    yekdemMahsup,

    totalWithMahsup,
  };
}
