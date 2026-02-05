// src/components/dashboard/ConsumptionDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardShell from "@/components/dashboard/DashboardShell";
import EnergyTable from "@/components/dashboard/EnergyTable";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { exportConsumptionHourlyXlsx } from "@/components/utils/exportConsumptionXlsx";
import { computeMonthInvoiceToDate } from "@/components/utils/calculateInvoiceToDate";

import { ChevronDown } from "lucide-react";

type SubscriptionOption = {
  subscriptionSerNo: number;
  meterSerial: string | null;
  nickname: string | null;
};

const fmtTl0 = (n: number) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString("tr-TR", {
        style: "currency",
        currency: "TRY",
        maximumFractionDigits: 0,
      })
    : "—";

const fmtKwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const fmtDT = (iso: string) => dayjsTR(iso).format("DD.MM.YYYY HH:mm");

const LS_SUB_KEY = "eco_selected_sub";

const fmtMoney2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtUnit6 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });



export default function ConsumptionDetail() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const uid = authSession?.user?.id ?? null;

  // Tesis state'leri
  const [subs, setSubs] = useState<SubscriptionOption[]>([]);
  const [selectedSub, setSelectedSub] = useState<number | null>(() => {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(LS_SUB_KEY) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState<string | null>(null);

  // Özet kart state'leri
  const [prevMonthKwh, setPrevMonthKwh] = useState<number | null>(null);
  const [prevLoading, setPrevLoading] = useState(false);
  const [prevErr, setPrevErr] = useState<string | null>(null);
  const [prevMonthRangeText, setPrevMonthRangeText] = useState<string>("");

  const [currMonthKwh, setCurrMonthKwh] = useState<number | null>(null);
  const [currLoading, setCurrLoading] = useState(false);
  const [currErr, setCurrErr] = useState<string | null>(null);

  // Bu ay kutusu için tarih aralığı (yazı)
  const currStart = dayjsTR().startOf("month");
  const now = dayjsTR();

  // Export
  const [exportRange, setExportRange] = useState<"curr" | "prev">("curr");
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // ✅ Ay içi fatura (PTF cutoff) state
  const [invoiceToDate, setInvoiceToDate] =
    useState<Awaited<ReturnType<typeof computeMonthInvoiceToDate>>>(null);
  const [invoiceToDateLoading, setInvoiceToDateLoading] = useState(false);


  const [estimateOpen, setEstimateOpen] = useState(false);
  // ─────────────────────────────
  // 0) Tesis listesini yükle
  // ─────────────────────────────
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) return;

    let cancel = false;

    (async () => {
      try {
        setSubsLoading(true);
        setSubsErr(null);

        const { data, error } = await supabase
          .from("owner_subscriptions")
          .select(
            `
            subscription_serno,
            meter_serial,
            subscription_settings:subscription_settings (
              title,
              nickname
            )
          `
          )
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        if (error) throw error;

        const list: SubscriptionOption[] = (data ?? []).map((r: any) => {
          // relationship bazen array dönebilir; normalize edelim
          const ss = Array.isArray(r.subscription_settings)
            ? r.subscription_settings?.[0]
            : r.subscription_settings;

          const nick = (ss?.nickname ?? ss?.title ?? null) as string | null;

          return {
            subscriptionSerNo: Number(r.subscription_serno),
            meterSerial: r.meter_serial ?? null,
            nickname: nick,
          };
        });

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
          console.error("subscription list (consumption) error:", e);
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

  const selectedMeterSerial =
    subs.find((s) => s.subscriptionSerNo === selectedSub)?.meterSerial ?? null;

  const subLabel = (s: SubscriptionOption) => {
    const tesisNo = s.meterSerial ?? `Tesis ${s.subscriptionSerNo}`;
    const nick = (s.nickname ?? "").trim();
    return nick ? `${tesisNo} - ${nick}` : tesisNo;
  };

  const selectedSubObj =
    subs.find((s) => s.subscriptionSerNo === selectedSub) ?? null;
  const selectedSubLabel = selectedSubObj
    ? subLabel(selectedSubObj)
    : "Tesis seçilmedi";

  // ─────────────────────────────────────────────
  // 1) Geçen ay toplam tüketim (kWh)
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setPrevLoading(true);
        setPrevErr(null);

        const start = dayjsTR().subtract(1, "month").startOf("month");
        const endCurrentMonth = dayjsTR().startOf("month");

        const endForText = start
          .clone()
          .endOf("month")
          .hour(23)
          .minute(0)
          .second(0)
          .millisecond(0);

        setPrevMonthRangeText(
          `${start.format("DD.MM.YYYY HH:mm")} – ${endForText.format(
            "DD.MM.YYYY HH:mm"
          )} (TR)`
        );

        const daily = await supabase
          .from("consumption_daily")
          .select("day, kwh_in")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .gte("day", start.format("YYYY-MM-DD"))
          .lt("day", endCurrentMonth.format("YYYY-MM-DD"));

        if (!cancel && !daily.error && daily.data?.length) {
          const sum = daily.data.reduce(
            (s: number, r: any) => s + (Number(r.kwh_in) || 0),
            0
          );
          setPrevMonthKwh(sum);
          return;
        }

        const hourly = await supabase
          .from("consumption_hourly")
          .select("ts, cn")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .gte("ts", start.toDate().toISOString())
          .lt("ts", endCurrentMonth.toDate().toISOString());

        if (cancel) return;
        if (hourly.error) throw hourly.error;

        const sum = (hourly.data ?? []).reduce(
          (s: number, r: any) => s + (Number(r.cn) || 0),
          0
        );
        setPrevMonthKwh(sum);
      } catch (e: any) {
        if (!cancel) {
          console.error("prev month kWh (detail) error:", e);
          setPrevErr(e?.message ?? "Geçen ay tüketimi getirilemedi");
          setPrevMonthKwh(null);
        }
      } finally {
        if (!cancel) setPrevLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub]);

  // ─────────────────────────────────────────────
  // 2) Bu ay (şu ana kadar) toplam tüketim (kWh)
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setCurrLoading(true);
        setCurrErr(null);

        const start = dayjsTR().startOf("month");
        const nowLocal = dayjsTR();

        const daily = await supabase
          .from("consumption_daily")
          .select("day, kwh_in")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .gte("day", start.format("YYYY-MM-DD"))
          .lte("day", nowLocal.format("YYYY-MM-DD"));

        if (!cancel && !daily.error && daily.data?.length) {
          const sum = daily.data.reduce(
            (s: number, r: any) => s + (Number(r.kwh_in) || 0),
            0
          );
          setCurrMonthKwh(sum);
          return;
        }

        const hourly = await supabase
          .from("consumption_hourly")
          .select("ts, cn")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .gte("ts", start.toDate().toISOString())
          .lte("ts", nowLocal.toDate().toISOString());

        if (cancel) return;
        if (hourly.error) throw hourly.error;

        const sum = (hourly.data ?? []).reduce(
          (s: number, r: any) => s + (Number(r.cn) || 0),
          0
        );
        setCurrMonthKwh(sum);
      } catch (e: any) {
        if (!cancel) {
          console.error("curr month kWh (detail) error:", e);
          setCurrErr(e?.message ?? "Bu ay tüketimi alınamadı");
          setCurrMonthKwh(null);
        }
      } finally {
        if (!cancel) setCurrLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub]);

  // ─────────────────────────────────────────────
  // 3) Bu ay (PTF tablosundaki en son saate göre) fatura (TL)
  // ─────────────────────────────────────────────
useEffect(() => {
  if (sessionLoading) return;

  if (!uid || !selectedSub) {
    setInvoiceToDate(null);
    return;
  }

  let cancel = false;

  (async () => {
    try {
      setInvoiceToDateLoading(true);

      const m = dayjsTR(); // ✅ ekle

      const res = await computeMonthInvoiceToDate({
        supabase,
        uid,
        subscriptionSerNo: selectedSub,
        year: m.year(),
        month: m.month() + 1,
        requirePrevMonthMahsup: false, // istersen true yaparız
      });

      if (!cancel) setInvoiceToDate(res);
    } catch (e: any) {
      console.error("invoiceToDate error:", e);
      if (!cancel) setInvoiceToDate(null);
    } finally {
      if (!cancel) setInvoiceToDateLoading(false);
    }
  })();

  return () => {
    cancel = true;
  };
}, [uid, sessionLoading, selectedSub]);


  const exportLabel = useMemo(() => {
    if (exportRange === "prev") {
      const m = dayjsTR().subtract(1, "month");
      return `gecen_ay_${m.format("YYYY_MM")}`;
    }
    return `bu_ay_${dayjsTR().format("YYYY_MM")}`;
  }, [exportRange]);

  async function handleExportXlsx() {
    if (!uid || !selectedSub) return;

    try {
      setExporting(true);
      setExportErr(null);

      const from =
        exportRange === "prev"
          ? dayjsTR().subtract(1, "month").startOf("month")
          : dayjsTR().startOf("month");

      const toExclusive =
        exportRange === "prev"
          ? dayjsTR().startOf("month")
          : dayjsTR().add(1, "minute");

      await exportConsumptionHourlyXlsx({
        userId: uid,
        subscriptionSerno: selectedSub,
        rangeLabel: exportLabel,
        fromIso: from.toDate().toISOString(),
        toExclusiveIso: toExclusive.toDate().toISOString(),
        meterSerialLabel: selectedMeterSerial ?? String(selectedSub),
      });
    } catch (e: any) {
      console.error("export xlsx error:", e);
      setExportErr(e?.message ?? "Excel çıkartılamadı.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <DashboardShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            Tüketim Detayı
          </h1>

          {selectedSub && (
            <p className="mt-1 text-xs text-neutral-500 flex items-center gap-2">
              Seçili tesis:{" "}
              <button
                type="button"
                onClick={() => navigate("/dashboard/profile")}
                className="inline-flex items-center justify-center rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-50"
                title="Tesis adını (nickname) düzenle"
                aria-label="Tesis adını (nickname) düzenle"
              >
                <span className="font-medium text-neutral-800">
                  {selectedSubLabel}
                </span>
              </button>
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
                  {subLabel(s)}
                </option>
              ))}
            </select>

            {subsLoading && (
              <span className="text-[11px] text-neutral-500">Yükleniyor…</span>
            )}

            <button
              onClick={() => navigate("/dashboard")}
              className="h-10 md:h-9 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              ← Panele dön
            </button>
          </div>
        </div>
      </div>

      {(subsErr || prevErr || currErr || exportErr) && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {subsErr && <>Tesisler: {subsErr}. </>}
          {prevErr && <>Geçen ay: {prevErr}. </>}
          {currErr && <>Bu ay: {currErr}. </>}
          {exportErr && <>Excel: {exportErr}</>}
        </div>
      )}

      {/* Özet kartlar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6 transition-all duration-300">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-neutral-500">Geçen Ay Tüketimi (kWh)</div>
          <div className="mt-1 text-2xl font-semibold text-neutral-900">
            {prevLoading ? "…" : fmtKwh(prevMonthKwh)}
          </div>
          <p className="mt-1 text-xs text-neutral-500">{prevMonthRangeText}</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-neutral-500">Bu Ay (şu ana kadar) (kWh)</div>
          <div className="mt-1 text-2xl font-semibold text-neutral-900">
            {currLoading ? "…" : fmtKwh(currMonthKwh)}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {currStart.format("DD.MM.YYYY HH:mm")} – {now.format("DD.MM.YYYY HH:mm")} (TR)
          </p>
        </div>
      </div>




{/* Bu ay (PTF'e göre) fatura kalemleri (şu ana kadar) */}
{(invoiceToDateLoading || invoiceToDate) && (
  <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-neutral-900">Ay İçi Tahmini Fatura</div>
        {invoiceToDate && (
          <p className="mt-1 text-xs text-neutral-500">
            {invoiceToDate.rangeStart} – {invoiceToDate.rangeEnd} (TR)
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-xs text-neutral-500">Genel Toplam (YEKDEM Mahsubu Dahil)</div>
          <div className="mt-1 text-2xl font-semibold text-neutral-900">
            {invoiceToDateLoading ? "…" : fmtMoney2(invoiceToDate?.totalWithMahsup)} TL
          </div>
        </div>

        <button
          type="button"
          onClick={() => setEstimateOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50"
          aria-expanded={estimateOpen}
        >
          Detay
          <ChevronDown
            className={
              "h-4 w-4 transition-transform duration-200 " +
              (estimateOpen ? "rotate-180" : "")
            }
          />
        </button>
      </div>
    </div>

    {/* ✅ Animasyonlu açılır kapanır alan */}
    <div
      className={
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out " +
        (estimateOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")
      }
    >
      <div className="overflow-hidden">
        {invoiceToDate && (
          <>
            <div className="mt-4 overflow-x-auto">
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
                      {fmtUnit6(invoiceToDate.unitPriceEnergy)} TL/kWh ×{" "}
                      {fmtKwh(invoiceToDate.totalConsumptionKwh)} kWh
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {fmtMoney2(invoiceToDate.breakdown.energyCharge)}
                    </td>
                  </tr>

                  {invoiceToDate.trafoDegeri > 0 && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4">Trafo Kaybı</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {fmtUnit6(invoiceToDate.unitPriceEnergy)} TL/kWh ×{" "}
                        {fmtKwh(invoiceToDate.trafoDegeri)} kWh
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {fmtMoney2(invoiceToDate.breakdown.trafoCharge)}
                      </td>
                    </tr>
                  )}

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Dağıtım Bedeli</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {fmtUnit6(invoiceToDate.unitPriceDistribution)} TL/kWh ×{" "}
                      {fmtKwh(invoiceToDate.totalConsumptionKwh)} kWh
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {fmtMoney2(invoiceToDate.breakdown.distributionCharge)}
                    </td>
                  </tr>

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">
                      BTV (%{(invoiceToDate.btvRate * 100).toFixed(2)})
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">
                      Enerji bedeli × BTV oranı
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {fmtMoney2(invoiceToDate.breakdown.btvCharge)}
                    </td>
                  </tr>

                  {invoiceToDate.tariffType === "dual" && (
                    <>
                      <tr className="border-b border-neutral-100">
                        <td className="py-2 pr-4">Güç Bedeli (Limit içi)</td>
                        <td className="py-2 pr-4 text-neutral-600">
                          Güç bedeli × Sözleşme Gücü
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {fmtMoney2(invoiceToDate.breakdown.powerBaseCharge)}
                        </td>
                      </tr>

                      <tr className="border-b border-neutral-100">
                        <td className="py-2 pr-4">Güç Bedeli Aşım</td>
                        <td className="py-2 pr-4 text-neutral-600">
                          Aşan kısım × aşım birim fiyatı
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {fmtMoney2(invoiceToDate.breakdown.powerExcessCharge)}
                        </td>
                      </tr>
                    </>
                  )}

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Reaktif Ceza Bedeli</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      Ri %{invoiceToDate.reactiveRiPercent.toFixed(1)} / Rc %
                      {invoiceToDate.reactiveRcPercent.toFixed(1)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {fmtMoney2(invoiceToDate.reactivePenaltyCharge)}
                    </td>
                  </tr>

                  <tr className="border-t border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">KDV Hariç Toplam</td>
                    <td className="py-2 pr-4 text-neutral-600">Ara toplam</td>
                    <td className="py-2 pr-4 text-right font-semibold">
                      {fmtMoney2(invoiceToDate.breakdown.subtotalBeforeVat)}
                    </td>
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">
                      KDV (%{(invoiceToDate.vatRate * 100).toFixed(2)})
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">Ara toplam × KDV</td>
                    <td className="py-2 pr-4 text-right font-semibold">
                      {fmtMoney2(invoiceToDate.breakdown.vatCharge)}
                    </td>
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">Genel Toplam (KDV Dahil)</td>
                    <td className="py-2 pr-4 text-neutral-600">Bu dönem (mahsup hariç)</td>
                    <td className="py-2 pr-4 text-right font-semibold">
                      {fmtMoney2(invoiceToDate.breakdown.totalInvoice)} TL
                    </td>
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">Önceki Dönem YEKDEM Mahsubu</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      Tedarikçi Tahmin - Gerçekleşen YEKDEM
                    </td>
                    <td
                      className={
                        "py-2 pr-4 text-right font-semibold " +
                        (!invoiceToDate.hasYekdemMahsup
                          ? "text-neutral-900"
                          : invoiceToDate.yekdemMahsup > 0
                          ? "text-red-600"
                          : "text-emerald-600")
                      }
                    >
                      {!invoiceToDate.hasYekdemMahsup
                        ? "Önceki dönem için yekdem_final girilmemiş."
                        : `${invoiceToDate.yekdemMahsup > 0 ? "+" : "-"}${fmtMoney2(
                            Math.abs(invoiceToDate.yekdemMahsup)
                          )} TL`}
                    </td>
                  </tr>

                  {invoiceToDate.digerDegerler !== 0 && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4 font-semibold">Diğer Bedeller</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        KDV dahil şekilde Diğer Bedeller
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        {invoiceToDate.digerDegerler > 0 ? "+" : "-"}
                        {fmtMoney2(Math.abs(invoiceToDate.digerDegerler))} TL
                      </td>
                    </tr>
                  )}

                  <tr>
                    <td className="py-3 pr-4 font-semibold text-neutral-900">
                      Genel Toplam (YEKDEM Mahsubu Dahil)
                    </td>
                    <td className="py-3 pr-4 text-neutral-600">Ödenecek toplam</td>
                    <td className="py-3 pr-4 text-right text-lg font-semibold text-neutral-900">
                      {fmtMoney2(invoiceToDate.totalWithMahsup)} TL
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {invoiceToDate.skippedKwh > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Not: PTF olmayan saatler olduğu için {fmtKwh(invoiceToDate.skippedKwh)} kWh hesaba dahil edilmedi.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  </div>
)}


    
      {/* Saatlik tüketim tablosu */}
      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-neutral-900">Saatlik Tüketim</div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={exportRange}
              onChange={(e) => setExportRange(e.target.value as any)}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#0A66FF]"
            >
              <option value="curr">Bu ayı Excel’e çıkar</option>
              <option value="prev">Geçen ayı Excel’e çıkar</option>
            </select>

            <button
              onClick={handleExportXlsx}
              disabled={!uid || !selectedSub || exporting}
              className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {exporting ? "Çıkartılıyor…" : "Excel’e Çıkar (.xlsx)"}
            </button>
          </div>
        </div>

        <EnergyTable />
      </div>
    </DashboardShell>
  );
}
