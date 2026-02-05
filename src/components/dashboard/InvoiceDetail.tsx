//src/components/dashboard/InvoiceDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { dayjsTR, TR_TZ } from "@/lib/dayjs";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { upsertInvoiceSnapshot } from "@/components/utils/invoiceSnapshots";

import AlternateTariffInvoiceSection from "@/components/dashboard/invoiceDetail/AlternateTariffInvoiceSection";


import {
  calculateInvoice,
  calculateYekdemMahsup,
} from "@/components/utils/calculateInvoice";
import type {
  InvoiceBreakdown,
  TariffType,
} from "@/components/utils/calculateInvoice";


// ---- formatters
const fmtMoney2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtKwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const fmtUnit = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });

type SubscriptionOption = {
  subscriptionSerNo: number;
  title: string | null;
};

type RecommendationStatus =
  | "no_data"
  | "already_optimal"
  | "should_decrease"
  | "should_increase";

interface PowerRecommendation {
  status: RecommendationStatus;
  aMaxLast3?: number;
  xBuffer?: number;
  recommendedKw?: number;
  savingTl?: number;
}


interface InvoiceViewData {
  breakdown: InvoiceBreakdown;
  totalConsumptionKwh: number;
  unitPriceEnergy: number;
  unitPriceDistribution: number;
  btvRate: number;
  vatRate: number;
  tariffType: TariffType;
  contractPowerKw: number;
  monthFinalDemandKw: number;
  monthLabel: string;
  hasDemandData: boolean;
  recommendation: PowerRecommendation;
  lastThreeMonths: {
    periodYear: number;
    periodMonth: number;
    maxDemandKw: number;
  }[];
  yekdemMahsup: number;
  hasYekdemMahsup: boolean;
  totalWithMahsup: number;

  reactivePenaltyCharge: number;
  reactiveRiPercent: number;
  reactiveRcPercent: number;

   trafoDegeri: number; // ✅ ekle

   digerDegerler: number;

}

function mapTermToTariffType(term: string | null | undefined): TariffType {
  return term === "cift_terim" ? "dual" : "single";
}

const LS_SUB_KEY = "eco_selected_sub";

function isMissingColumnError(err: any, col: string) {
  const msg = String(err?.message ?? "");
  return msg.includes("does not exist") && msg.includes(col);
}

async function fetchSubYekdemValue(params: {
  uid: string;
  sub: number;
  year: number;
  month: number;
}): Promise<number | null> {
  const { uid, sub, year, month } = params;

  // 1) year/month
  const r1 = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (!r1.error) return r1.data?.yekdem_value != null ? Number(r1.data.yekdem_value) : null;

  // 2) period_year/period_month
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
    return r2.data?.yekdem_value != null ? Number(r2.data.yekdem_value) : null;
  }

  throw r1.error;
}


async function fetchSubYekdemForMahsup(params: {
  uid: string;
  sub: number;
  year: number;
  month: number;
}): Promise<{ yekdem_value: number | null; yekdem_final: number | null } | null> {
  const { uid, sub, year, month } = params;

  // 1) year/month
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
      yekdem_value: r1.data.yekdem_value != null ? Number(r1.data.yekdem_value) : null,
      yekdem_final: r1.data.yekdem_final != null ? Number(r1.data.yekdem_final) : null,
    };
  }

  // 2) period_year/period_month
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
      yekdem_value: r2.data.yekdem_value != null ? Number(r2.data.yekdem_value) : null,
      yekdem_final: r2.data.yekdem_final != null ? Number(r2.data.yekdem_final) : null,
    };
  }

  throw r1.error;
}

async function fetchSubDigerDegerler(params: {
  uid: string;
  sub: number;
  year: number;
  month: number;
}): Promise<number> {
  const { uid, sub, year, month } = params;

  const r1 = await supabase
    .from("subscription_yekdem")
    .select("diger_degerler")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (!r1.error) return Number(r1.data?.diger_degerler ?? 0) || 0;

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
    return Number(r2.data?.diger_degerler ?? 0) || 0;
  }

  throw r1.error;
}



export default function InvoiceDetail() {
  const { session: authSession, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const uid = authSession?.user?.id ?? null;

  // ---- tesis selector
  const [subs, setSubs] = useState<SubscriptionOption[]>([]);
  const [selectedSub, setSelectedSub] = useState<number | null>(() => {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(LS_SUB_KEY) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState<string | null>(null);

  // ---- main
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<InvoiceViewData | null>(null);

  const REACTIVE_LIMIT_RI = 20;
  const REACTIVE_LIMIT_RC = 15;

  // 0) tesisleri çek
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) return;

    let cancel = false;

    (async () => {
      try {
        setSubsLoading(true);
        setSubsErr(null);

        const { data, error } = await supabase
          .from("subscription_settings")
          .select("subscription_serno, title")
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        if (error) throw error;

        let list: SubscriptionOption[] = [];

        if (data && data.length > 0) {
          list = data.map((r: any) => ({
            subscriptionSerNo: Number(r.subscription_serno),
            title: r.title ?? null,
          }));
        } else {
          const { data: osData, error: osErr } = await supabase
            .from("owner_subscriptions")
            .select("subscription_serno, title")
            .eq("user_id", uid)
            .order("subscription_serno", { ascending: true });

          if (cancel) return;
          if (osErr) throw osErr;

          list = (osData ?? []).map((r: any) => ({
            subscriptionSerNo: Number(r.subscription_serno),
            title: r.title ?? null,
          }));
        }

        setSubs(list);

        if (list.length > 0) {
          const ok =
            selectedSub != null &&
            list.some((s) => s.subscriptionSerNo === selectedSub);
          const next = ok ? selectedSub! : list[0].subscriptionSerNo;

          setSelectedSub(next);
          localStorage.setItem(LS_SUB_KEY, String(next));
        } else {
          setSelectedSub(null);
          localStorage.removeItem(LS_SUB_KEY);
        }
      } catch (e: any) {
        if (!cancel) {
          console.error("subs load error:", e);
          setSubsErr(e?.message ?? "Tesisler yüklenemedi");
          setSubs([]);
          setSelectedSub(null);
        }
      } finally {
        if (!cancel) setSubsLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, sessionLoading]);

  // 1) fatura hesabı (seçili tesis)
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setData(null);

        // Geçen ay (fatura dönemi)
        const prev = dayjsTR().subtract(1, "month");
        const monthStart = prev.startOf("month");
        const monthEndExclusive = monthStart.clone().add(1, "month");
        const periodYear = prev.year();
        const periodMonth = prev.month() + 1;
        const monthLabel = prev.format("MMMM YYYY");

        // 1) tüketim
        const hourly = await supabase
          .from("consumption_hourly")
          .select("ts, cn, ri, rc")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .gte("ts", monthStart.toDate().toISOString())
          .lt("ts", monthEndExclusive.toDate().toISOString());

        if (hourly.error) throw hourly.error;

        let totalConsumptionKwh = 0;
        let totalRi = 0;
        let totalRc = 0;

        for (const row of (hourly.data ?? []) as any[]) {
          totalConsumptionKwh += Number(row.cn) || 0;
          totalRi += Number(row.ri) || 0;
          totalRc += Number(row.rc) || 0;
        }

        // 2) PTF – TL/kWh
        const ptfRes = await supabase.rpc("monthly_ptf_prev_sub", {
          p_tz: TR_TZ,
          p_subscription_serno: selectedSub,
        });
        if (ptfRes.error) throw ptfRes.error;

        const ptfRow = ptfRes.data?.[0];
        const monthlyPTF =
          ptfRow && ptfRow.ptf_tl_per_kwh != null
            ? Number(ptfRow.ptf_tl_per_kwh)
            : 0;

        // 3) YEKDEM (subscription_yekdem -> fallback resmi) – TL/kWh
        let monthlyYekdem = 0;

        const subYekVal = await fetchSubYekdemValue({
          uid,
          sub: selectedSub,
          year: periodYear,
          month: periodMonth,
        });

        if (subYekVal != null) {
          monthlyYekdem = Number(subYekVal) || 0;
        } else {
          const { data: offRow, error: offErr } = await supabase
            .from("yekdem_official")
            .select("yekdem_value, yekdem_tl_per_kwh")
            .eq("year", periodYear)
            .eq("month", periodMonth)
            .maybeSingle();

          if (offErr) throw offErr;

          if (offRow) {
            if (offRow.yekdem_value != null)
              monthlyYekdem = Number(offRow.yekdem_value) || 0;
            else if (offRow.yekdem_tl_per_kwh != null)
              monthlyYekdem = Number(offRow.yekdem_tl_per_kwh) || 0;
          }
        }

        // 4) tesis ayarları (KBK + tarife + güç limit) -> SADECE subscription_settings
        const settingsRes = await supabase
          .from("subscription_settings")
          .select("kbk, terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, btv_enabled")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .maybeSingle();

        if (settingsRes.error) throw settingsRes.error;
        if (!settingsRes.data) {
          throw new Error("subscription_settings bulunamadı (bu tesis için ayar girilmemiş).");
        }

        const kbkRaw = settingsRes.data.kbk;
        const kbk = kbkRaw != null && Number.isFinite(Number(kbkRaw)) ? Number(kbkRaw) : 1;

        const terim = settingsRes.data.terim ?? null;
        const gerilim = settingsRes.data.gerilim ?? null;
        const tarife = settingsRes.data.tarife ?? null;

        const btvEnabled = settingsRes.data.btv_enabled ?? true;

        const contractPowerKw =
          settingsRes.data.guc_bedel_limit != null && Number.isFinite(Number(settingsRes.data.guc_bedel_limit))
            ? Number(settingsRes.data.guc_bedel_limit)
            : 0;

        const missing: string[] = [];
        if (!terim) missing.push("terim");
        if (!gerilim) missing.push("gerilim");
        if (!tarife) missing.push("tarife");

        if (missing.length) {
          throw new Error(`Tesis ayarları eksik: ${missing.join(", ")} (subscription_settings doldur).`);
        }

        const trafoDegeri =
          settingsRes.data.trafo_degeri != null && Number.isFinite(Number(settingsRes.data.trafo_degeri))
            ? Number(settingsRes.data.trafo_degeri)
            : 0;

        const tariffType = mapTermToTariffType(terim);

        // 5) resmi dağıtım/güç tarifesi
        const tariffRes = await supabase
          .from("distribution_tariff_official")
          .select("dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel")
          .eq("terim", terim)
          .eq("gerilim", gerilim)
          .eq("tarife", tarife)
          .maybeSingle();

        if (tariffRes.error) throw tariffRes.error;
        const tariffRow = tariffRes.data;
        if (!tariffRow) throw new Error("Uygun dağıtım tarifesi bulunamadı.");

        const unitPriceEnergy = (monthlyPTF + monthlyYekdem) * kbk;

        const unitPriceDistribution =
          tariffRow.dagitim_bedeli != null ? Number(tariffRow.dagitim_bedeli) : 0;
        const powerPrice =
          tariffRow.guc_bedeli != null ? Number(tariffRow.guc_bedeli) : 0;
        const powerExcessPrice =
          tariffRow.guc_bedeli_asim != null ? Number(tariffRow.guc_bedeli_asim) : 0;

        const btvRate = btvEnabled
          ? (tariffRow.btv != null ? Number(tariffRow.btv) / 100 : 0)
          : 0;

        const vatRate = tariffRow.kdv != null ? Number(tariffRow.kdv) / 100 : 0;

        // 6) reaktif ceza
        const riPercent =
          totalConsumptionKwh > 0 ? (totalRi / totalConsumptionKwh) * 100 : 0;
        const rcPercent =
          totalConsumptionKwh > 0 ? (totalRc / totalConsumptionKwh) * 100 : 0;

        const reactiveUnitPrice =
          tariffRow.reaktif_bedel != null ? Number(tariffRow.reaktif_bedel) : 0;

        const riPenaltyEnergy = riPercent > REACTIVE_LIMIT_RI ? totalRi : 0;
        const rcPenaltyEnergy = rcPercent > REACTIVE_LIMIT_RC ? totalRc : 0;

        const penaltyEnergy = riPenaltyEnergy + rcPenaltyEnergy; // kVArh
        const reactivePenaltyCharge = penaltyEnergy * reactiveUnitPrice; // TL (KDV öncesi)

        // 7) multiplier + demand
        let multiplier = 1;

        // 7a) owner_subscriptions (user_id ile dene)
        const subRes1 = await supabase
          .from("owner_subscriptions")
          .select("multiplier")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .maybeSingle();

        if (subRes1.error) throw subRes1.error;

        if (
          subRes1.data?.multiplier != null &&
          Number.isFinite(Number(subRes1.data.multiplier))
        ) {
          multiplier = Number(subRes1.data.multiplier);
        } else {
          // 7b) owner_subscriptions (user_id’siz dene — bazı yapılarda row bu şekilde bulunuyor)
          const subRes2 = await supabase
            .from("owner_subscriptions")
            .select("multiplier")
            .eq("subscription_serno", selectedSub)
            .maybeSingle();

          if (subRes2.error) throw subRes2.error;

          if (
            subRes2.data?.multiplier != null &&
            Number.isFinite(Number(subRes2.data.multiplier))
          ) {
            multiplier = Number(subRes2.data.multiplier);
          }
        }

        // demand_monthly
        const dmRes = await supabase
          .from("demand_monthly")
          .select("period_year, period_month, max_demand_kw")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .eq("is_final", true);

        if (dmRes.error) throw dmRes.error;

        const allMonths = (dmRes.data ?? [])
          .map((r: any) => ({
            periodYear: Number(r.period_year),
            periodMonth: Number(r.period_month),
            maxDemandKw:
              (r.max_demand_kw != null ? Number(r.max_demand_kw) : 0) * multiplier,
          }))
          .filter(
            (m) => Number.isFinite(m.periodYear) && Number.isFinite(m.periodMonth)
          )
          .sort(
            (a, b) =>
              b.periodYear - a.periodYear || b.periodMonth - a.periodMonth
          );

        const lastThreeMonths = allMonths.slice(0, 3);

        let hasDemandData = false;
        let monthFinalDemandKw = 0;
        for (const m of allMonths) {
          if (m.periodYear === periodYear && m.periodMonth === periodMonth) {
            hasDemandData = true;
            monthFinalDemandKw = m.maxDemandKw;
            break;
          }
        }

        // 8) fatura hesabı (mahsup hariç)
          const breakdown = calculateInvoice({
            totalConsumptionKwh,
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

            trafoDegeri, // ✅
          });

       //ara taşak madde ekliyom  buraya

        const digerDegerler = await fetchSubDigerDegerler({
            uid,
            sub: selectedSub,
            year: periodYear,
            month: periodMonth,
          });

        // 9) YEKDEM mahsup (M-1 için)
        let yekdemMahsupValue = 0;
        let hasYekdemMahsup = false;

        try {
          const billingMonth = dayjsTR().year(periodYear).month(periodMonth - 1); // M
          const prevForYekdem = billingMonth.subtract(1, "month"); // M-1

          const prevStart = prevForYekdem.startOf("month");
          const prevEndExclusive = prevStart.clone().add(1, "month");

          let prevPeriodKwh = 0;

          const dailyPrev = await supabase
            .from("consumption_daily")
            .select("day, kwh_in")
            .eq("user_id", uid)
            .eq("subscription_serno", selectedSub)
            .gte("day", prevStart.format("YYYY-MM-DD"))
            .lt("day", prevEndExclusive.format("YYYY-MM-DD"));

          if (!dailyPrev.error && dailyPrev.data?.length) {
            prevPeriodKwh = dailyPrev.data.reduce(
              (sum: number, row: any) => sum + (Number(row.kwh_in) || 0),
              0
            );
          } else {
            const hourlyPrev = await supabase
              .from("consumption_hourly")
              .select("ts, cn")
              .eq("user_id", uid)
              .eq("subscription_serno", selectedSub)
              .gte("ts", prevStart.toDate().toISOString())
              .lt("ts", prevEndExclusive.toDate().toISOString());

            if (!hourlyPrev.error && hourlyPrev.data?.length) {
              prevPeriodKwh = hourlyPrev.data.reduce(
                (sum: number, row: any) => sum + (Number(row.cn) || 0),
                0
              );
            }
          }

          if (prevPeriodKwh > 0) {
            const yRow = await fetchSubYekdemForMahsup({
              uid,
              sub: selectedSub,
              year: prevForYekdem.year(),
              month: prevForYekdem.month() + 1,
            });

            if (
              yRow &&
              yRow.yekdem_value != null &&
              yRow.yekdem_final != null
            ) {
              const yekdemOld = Number(yRow.yekdem_value);
              const yekdemNew = Number(yRow.yekdem_final);

              yekdemMahsupValue = calculateYekdemMahsup({
                totalKwh: prevPeriodKwh,
                kbk,
                btvRate,
                vatRate,
                yekdemOld,
                yekdemNew,
              });

              hasYekdemMahsup = true;
            }
          }
        } catch (e) {
          console.error("YEKDEM mahsup hesap hatası:", e);
          yekdemMahsupValue = 0;
          hasYekdemMahsup = false;
        }

        const totalWithMahsup = breakdown.totalInvoice + yekdemMahsupValue + digerDegerler;


        // 10) güç limiti tavsiye
        const lastThreeDemands = lastThreeMonths.map((m) => m.maxDemandKw);

        let recommendation: PowerRecommendation = { status: "no_data" };

        if (
          lastThreeDemands.length > 0 &&
          contractPowerKw > 0 &&
          powerExcessPrice > 0
        ) {
          const a = Math.max(...lastThreeDemands);
          const x = a * 0.1;

          if (a < contractPowerKw) {
            const diff = contractPowerKw - a;
            if (diff < x) {
              recommendation = {
                status: "already_optimal",
                aMaxLast3: a,
                xBuffer: x,
              };
            } else {
              const recommendedKw = a + x;
              const savingKw = contractPowerKw - recommendedKw;
              const savingTl = savingKw * powerExcessPrice;

              recommendation = {
                status: "should_decrease",
                aMaxLast3: a,
                xBuffer: x,
                recommendedKw,
                savingTl,
              };
            }
          } else {
            recommendation = { status: "should_increase", aMaxLast3: a, xBuffer: x };
          }
        }


 

        // 11) invoice_history kaydet
        // 11) invoice_snapshots kaydet (SON HAL)
try {
  await upsertInvoiceSnapshot({
    userId: uid,
    subscriptionSerno: selectedSub,
    periodYear,
    periodMonth,
    invoiceType: "billed",
    monthLabel,

    totalConsumptionKwh,
    unitPriceEnergy,
    unitPriceDistribution,
    btvRate,
    vatRate,
    tariffType,

    contractPowerKw,
    monthFinalDemandKw,
    hasDemandData,

    powerPrice,
    powerExcessPrice,

    reactiveRiPercent: riPercent,
    reactiveRcPercent: rcPercent,
    reactivePenaltyCharge,

    breakdown,

    hasYekdemMahsup,
    yekdemMahsup: yekdemMahsupValue,
    totalWithMahsup,
    trafoDegeri,
    trafoCharge: breakdown.trafoCharge,
    digerDegerler,
    

  });
} catch (e) {
  console.error("upsertInvoiceSnapshot error:", e);
}


        if (!cancel) {
          setData({
            breakdown,
            totalConsumptionKwh,
            unitPriceEnergy,
            unitPriceDistribution,
            btvRate,
            vatRate,
            tariffType,
            contractPowerKw,
            monthFinalDemandKw,
            monthLabel,
            hasDemandData,
            recommendation,
            lastThreeMonths,
            yekdemMahsup: yekdemMahsupValue,
            hasYekdemMahsup,
            totalWithMahsup,
            reactivePenaltyCharge,
            reactiveRiPercent: riPercent,
            reactiveRcPercent: rcPercent,          
            trafoDegeri, // ✅ ekle
            digerDegerler
          });
        }
      } catch (e: any) {
        if (!cancel) {
          console.error("Invoice detail error:", e);
          setErr(e?.message ?? "Fatura detayları yüklenemedi.");
          setData(null);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub]);

  const selectedSubLabel =
    subs.find((s) => s.subscriptionSerNo === selectedSub)?.title ??
    (selectedSub != null ? `Tesis ${selectedSub}` : "Tesis seçilmedi");

  const demandInfo = useMemo(() => {
    if (!data) return null;

    const { monthFinalDemandKw, contractPowerKw } = data;
    const excessKw = Math.max(0, monthFinalDemandKw - contractPowerKw);
    const ratio =
      contractPowerKw > 0 ? (monthFinalDemandKw / contractPowerKw) * 100 : null;

    return { excessKw, ratio };
  }, [data]);

const isDualTerm = data?.tariffType === "dual";


  return (
    <DashboardShell>
      {/* Header + Tesis + geri */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Fatura Detay</h1>
          <p className="text-sm text-neutral-500">
            {data ? `${data.monthLabel} dönemine ait fatura hesabı` : "Geçen aya ait fatura detayları"}
          </p>

          {selectedSub && (
            <p className="mt-1 text-xs text-neutral-500">
              Seçili tesis:{" "}
              <span className="font-medium text-neutral-800">{selectedSubLabel}</span>
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end md:w-auto">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-neutral-600">Tesis:</span>

            <select
              value={selectedSub ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setSelectedSub(v);
                if (v != null) localStorage.setItem(LS_SUB_KEY, String(v));
              }}
              className="h-10 md:h-9 w-full sm:w-[420px] md:w-auto min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 md:px-2 text-[16px] md:text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#0A66FF]"
            >
              {subs.length === 0 && <option value="">Tesis bulunamadı</option>}
              {subs.map((s) => (
                <option key={s.subscriptionSerNo} value={s.subscriptionSerNo}>
                  {s.title ?? `Tesis ${s.subscriptionSerNo}`}
                </option>
              ))}
            </select>

            {subsLoading && (
              <span className="text-[11px] text-neutral-500">Yükleniyor…</span>
            )}

            <button
              onClick={() => navigate(-1)}
              className="h-10 md:h-9 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-[14px] md:text-xs text-neutral-700 hover:bg-neutral-50"
            >
              ← Panele dön
            </button>
          </div>
        </div>
      </div>

      {/* Errors */}
      {(subsErr || err) && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {subsErr && (
            <>
              Tesisler: {subsErr}
              <br />
            </>
          )}
          {err && err}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mb-4 text-sm text-neutral-500">
          Fatura detayları yükleniyor…
        </div>
      )}

      {/* No data fallback */}
      {!loading && !err && !data && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm text-sm text-neutral-600">
          Bu tesis için fatura hesabı üretilemedi. (subscription_settings / tarifeler / veriler kontrol edilmeli)
        </div>
      )}

      {!loading && data && (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500 mb-1">Toplam Tüketim (kWh)</p>
              <p className="text-xl font-semibold text-neutral-900">
                {fmtKwh(data.totalConsumptionKwh)}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500 mb-1">Enerji Birim Fiyatı</p>
        
              <p className="mt-1 text-xl font-semibold text-neutral-900">
                {fmtUnit(data.unitPriceEnergy)} TL/kWh
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500 mb-1">
                Fatura Toplamı (KDV Dahil, mahsup dahil)
              </p>
              <p className="mt-1 text-xl font-semibold text-neutral-900">
                {fmtMoney2(data.totalWithMahsup)} TL
              </p>
            </div>
          </div>

        
          {/* Demand (sadece çift terim) */}
          {isDualTerm && (
            <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-800 mb-2">Güç Bedeli</h2>

              <p className="text-sm text-neutral-600">
                Ay boyunca ölçülen maksimum güç:{" "}
                <span className="font-semibold">{data.monthFinalDemandKw.toFixed(3)} kW</span>
                {" • "}Sözleşme gücü:{" "}
                <span className="font-semibold">{data.contractPowerKw.toFixed(3)} kW</span>
                {demandInfo?.ratio != null && (
                  <>
                    {" • "}Kullanım oranı:{" "}
                    <span className="font-semibold">{demandInfo.ratio.toFixed(1)}%</span>
                  </>
                )}
              </p>

              {demandInfo && demandInfo.excessKw > 0 ? (
                <p className="mt-1 text-sm text-red-600">
                  Bu ay sözleşme gücü{" "}
                  <span className="font-semibold">{demandInfo.excessKw.toFixed(3)} kW</span>{" "}
                  aşılmıştır.
                </p>
              ) : (
                <p className="mt-1 text-sm text-emerald-600">Bu ay sözleşme gücü aşılmamıştır.</p>
              )}

              {!data.hasDemandData && (
                <p className="mt-1 text-xs text-neutral-500">
                  Not: Bu ay için maksimum çekilen verisi yoksa 0 varsayılır.
                </p>
              )}
            </div>
          )}


         
          {/* Tavsiye (sadece çift terim) */}
          {isDualTerm && (
            <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-800 mb-2">
                Tavsiye Güç Bedeli Limiti (Son 3 Ay)
              </h2>

              {data.lastThreeMonths.length === 0 ? (
                <p className="text-sm text-neutral-600">
                  Son 3 aya ait maksimum çekilen güç verisi bulunamadı.
                </p>
              ) : (
                <>
                  <p className="text-xs text-neutral-500 mb-2">
                    Son 3 faturalanmış ay için maksimum çekilen güç:
                  </p>

                  <div className="overflow-x-auto mb-3">
                    <table className="min-w-[260px] text-xs">
                      <thead>
                        <tr className="text-left text-[11px] text-neutral-500 border-b">
                          <th className="py-1 pr-3">Dönem</th>
                          <th className="py-1 pr-3 text-right">Maksimum Çekilen Güç (kW)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.lastThreeMonths.map((m, idx) => (
                          <tr key={idx} className="border-b border-neutral-100">
                            <td className="py-1 pr-3">
                              {String(m.periodMonth).padStart(2, "0")}.{m.periodYear}
                            </td>
                            <td className="py-1 pr-3 text-right">{m.maxDemandKw.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {data.recommendation.status === "already_optimal" && (
                    <p className="text-sm text-emerald-700">Mevcut sözleşme gücü tavsiye aralığına yakın.</p>
                  )}

                  {data.recommendation.status === "should_decrease" && (
                    <p className="text-sm text-amber-700">
                      Tavsiye güç bedeli limiti:{" "}
                      <span className="font-semibold">{data.recommendation.recommendedKw?.toFixed(3)} kW</span>{" "}
                      • Tasarruf: <span className="font-semibold">{fmtMoney2(data.recommendation.savingTl)} TL/ay</span>
                    </p>
                  )}

                  {data.recommendation.status === "should_increase" && (
                    <p className="text-sm text-red-700">Son 3 ay maksimum çekilen sözleşme gücüne eşit/üzeri.</p>
                  )}

                  {data.recommendation.status === "no_data" && (
                    <p className="text-sm text-neutral-600">Tavsiye için yeterli veri yok.</p>
                  )}
                </>
              )}
            </div>
          )}

          <AlternateTariffInvoiceSection
            uid={uid!}
            subscriptionSerno={selectedSub!}
            tariffType={data.tariffType}
            totalConsumptionKwh={data.totalConsumptionKwh}
            unitPriceEnergy={data.unitPriceEnergy}
            monthFinalDemandKw={data.monthFinalDemandKw}
            hasDemandData={data.hasDemandData}
            reactiveRiPercent={data.reactiveRiPercent}
            reactiveRcPercent={data.reactiveRcPercent}
            trafoDegeri={data.trafoDegeri}
            digerDegerler={data.digerDegerler}
            currentTotalWithMahsup={data.totalWithMahsup}
            hasYekdemMahsup={data.hasYekdemMahsup}
            yekdemMahsup={data.yekdemMahsup}
          />




          {/* Kalem kalem */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3">
              Fatura Kalemleri
            </h2>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500 border-b">
                    <th className="py-2 pr-4">Kalem</th>
                    <th className="py-2 pr-4">Açıklama</th>
                    <th className="py-2 pr-4 text-right">Tutar (TL)</th>
                  </tr>
                </thead>

                <tbody>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Enerji Bedeli</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {fmtUnit(data.unitPriceEnergy)} TL/kWh ×{" "}
                      {fmtKwh(data.totalConsumptionKwh)} kWh
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {fmtMoney2(data.breakdown.energyCharge)}
                    </td>
                  </tr>


                    {data.trafoDegeri > 0 && (
                          <tr className="border-b border-neutral-100">
                            <td className="py-2 pr-4">Trafo Kaybı</td>
                            <td className="py-2 pr-4 text-neutral-600">
                              {fmtUnit(data.unitPriceEnergy)} TL/kWh × {fmtKwh(data.trafoDegeri)} kWh
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {fmtMoney2(data.breakdown.trafoCharge)}
                            </td>
                          </tr>
                        )}


                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Dağıtım Bedeli</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {fmtUnit(data.unitPriceDistribution)} TL/kWh ×{" "}
                      {fmtKwh(data.totalConsumptionKwh)} kWh
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {fmtMoney2(data.breakdown.distributionCharge)}
                    </td>
                  </tr>

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">
                      BTV (%{(data.btvRate * 100).toFixed(2)})
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">
                      Enerji bedeli × BTV oranı
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {fmtMoney2(data.breakdown.btvCharge)}
                    </td>
                  </tr>

                  {isDualTerm && (
                    <>
                      <tr className="border-b border-neutral-100">
                        <td className="py-2 pr-4">Güç Bedeli (Limit içi)</td>
                        <td className="py-2 pr-4 text-neutral-600">Güç bedeli × Sözleşme Gücü</td>
                        <td className="py-2 pr-4 text-right">
                          {fmtMoney2(data.breakdown.powerBaseCharge)}
                        </td>
                      </tr>

                      <tr className="border-b border-neutral-100">
                        <td className="py-2 pr-4">Güç Bedeli Aşım</td>
                        <td className="py-2 pr-4 text-neutral-600">Aşan kısım × aşım birim fiyatı</td>
                        <td className="py-2 pr-4 text-right">
                          {fmtMoney2(data.breakdown.powerExcessCharge)}
                        </td>
                      </tr>
                    </>
                  )}


                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Reaktif Ceza Bedeli</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      Ri %{data.reactiveRiPercent.toFixed(1)} / Rc %
                      {data.reactiveRcPercent.toFixed(1)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {fmtMoney2(data.reactivePenaltyCharge)}
                    </td>
                  </tr>

                  <tr className="border-t border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">KDV Hariç Toplam</td>
                    <td className="py-2 pr-4 text-neutral-600">Ara toplam</td>
                    <td className="py-2 pr-4 text-right font-semibold">
                      {fmtMoney2(data.breakdown.subtotalBeforeVat)}
                    </td>
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">
                      KDV (%{(data.vatRate * 100).toFixed(2)})
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">
                      Ara toplam × KDV
                    </td>
                    <td className="py-2 pr-4 text-right font-semibold">
                      {fmtMoney2(data.breakdown.vatCharge)}
                    </td>
                  </tr>



                  <tr className="border-b border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">
                      Genel Toplam (KDV Dahil)
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">
                      Bu dönem (mahsup hariç)
                    </td>
                    <td className="py-2 pr-4 text-right font-semibold">
                      {fmtMoney2(data.breakdown.totalInvoice)} TL
                    </td>
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">
                      Önceki Dönem YEKDEM Mahsubu
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">
                      Tedarikçi Tahmin - Gerçekleşen YEKDEM
                    </td>
                    <td
                      className={
                        "py-2 pr-4 text-right font-semibold " +
                        (!data.hasYekdemMahsup
                          ? "text-neutral-900"
                          : data.yekdemMahsup > 0
                          ? "text-red-600"
                          : "text-emerald-600")
                      }
                    >
                      {!data.hasYekdemMahsup
                        ? "Önceki dönem için yekdem_final girilmemiş."
                        : `${data.yekdemMahsup > 0 ? "+" : "-"}${fmtMoney2(Math.abs(data.yekdemMahsup))} TL`}

 
                    </td>
                  </tr>

                  {data.digerDegerler !== 0 && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4 font-semibold">Diğer Bedeller</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        KDV dahil şekilde Diğer Bedeller
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        {data.digerDegerler > 0 ? "+" : "-"}
                        {fmtMoney2(Math.abs(data.digerDegerler))} TL
                      </td>
                    </tr>
                  )}


                  
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-neutral-900">
                      Genel Toplam (YEKDEM Mahsubu Dahil)
                    </td>
                    <td className="py-3 pr-4 text-neutral-600">Ödenecek toplam</td>
                    <td className="py-3 pr-4 text-right text-lg font-semibold text-neutral-900">
                      {fmtMoney2(data.totalWithMahsup)} TL
                    </td>
                  </tr>
                </tbody>  
              </table>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
