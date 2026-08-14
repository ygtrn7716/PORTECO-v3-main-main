// src/components/dashboard/ConsumptionDetail.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardShell from "@/components/dashboard/DashboardShell";
import EnergyTable from "@/components/dashboard/EnergyTable";
import ConsumptionCharts from "@/components/dashboard/ConsumptionCharts";
import ManualUploadPanel from "@/components/dashboard/manualUpload/ManualUploadPanel";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { computeMonthInvoiceToDate } from "@/components/utils/calculateInvoiceToDate";
import GesUretimSatisiCard from "@/components/dashboard/shared/GesUretimSatisiCard";
import { calculateGesUretimSatisi } from "@/lib/ges/gesUretimSatisi";

import { ChevronDown } from "lucide-react";
import { fetchAllConsumption } from "@/lib/paginatedFetch";
import { resolveSelectedSub } from "@/lib/subscriptionVisibility";

type SubscriptionOption = {
  subscriptionSerNo: number;
  meterSerial: string | null;
  nickname: string | null;
  dataSource: string | null; // 'api' | 'manual'
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
// Consumption sayfasına özel seçim (numara veya "ALL"). LS_SUB_KEY'i bozmaz → diğer
// sayfalar (Charts, Dashboard) "ALL"'dan etkilenmez.
const LS_CONS_KEY = "eco_sel_consumption";

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



// Bir tarih aralığındaki toplam tüketimi (kWh) çeker. Önce consumption_daily,
// yoksa consumption_hourly fallback. sernos tek tesis veya "Tümü" (çoklu) olabilir.
async function fetchRangeKwh(params: {
  uid: string;
  sernos: number[];
  dailyGte: string; // YYYY-MM-DD
  dailyLt?: string; // exclusive
  dailyLte?: string; // inclusive
  hourlyStartIso: string;
  hourlyEndIso: string;
  hourlyEndInclusive?: boolean;
}): Promise<number> {
  const {
    uid,
    sernos,
    dailyGte,
    dailyLt,
    dailyLte,
    hourlyStartIso,
    hourlyEndIso,
    hourlyEndInclusive,
  } = params;

  if (sernos.length === 0) return 0;

  // Tesis başına: önce consumption_daily (tarih aralığı küçük → tek sayfa yeterli),
  // o tesiste daily yoksa hourly fallback. Böylece daily/hourly karışık tesisler
  // doğru toplanır ve çoklu-tesis "Tümü"de 1000-satır kesintisi olmaz.
  let total = 0;
  for (const sn of sernos) {
    let dq = supabase
      .from("consumption_daily")
      .select("kwh_in")
      .eq("user_id", uid)
      .eq("subscription_serno", sn)
      .gte("day", dailyGte);
    if (dailyLt) dq = dq.lt("day", dailyLt);
    if (dailyLte) dq = dq.lte("day", dailyLte);

    const daily = await dq;
    if (!daily.error && daily.data && daily.data.length > 0) {
      total += daily.data.reduce((s: number, r: any) => s + (Number(r.kwh_in) || 0), 0);
      continue;
    }

    // fallback: saatlik (bu serno, paginated)
    const h = await fetchAllConsumption({
      supabase,
      userId: uid,
      subscriptionSerno: sn,
      columns: "ts, cn",
      startIso: hourlyStartIso,
      endIso: hourlyEndIso,
      endInclusive: hourlyEndInclusive ?? false,
    });
    if (h.error) throw h.error;
    total += (h.data ?? []).reduce((s: number, r: any) => s + (Number(r.cn) || 0), 0);
  }
  return total;
}

export default function ConsumptionDetail() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const uid = authSession?.user?.id ?? null;

  // Tesis state'leri
  const [subs, setSubs] = useState<SubscriptionOption[]>([]);
  // "ALL" = Tümü (görünür tüm tesisler toplamı), bu sayfaya özel.
  const [selectedSub, setSelectedSub] = useState<"ALL" | number | null>(() => {
    if (typeof window === "undefined") return null;
    const rawC = localStorage.getItem(LS_CONS_KEY);
    if (rawC === "ALL") return "ALL";
    const raw = localStorage.getItem(LS_SUB_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState<string | null>(null);

  // Manuel veri girişine açık TÜM tesisler (is_hidden dahil) — Excel'deki
  // abone no doğrulaması gizli tesisleri de tanımalı; subs listesi is_hidden
  // filtreli olduğu için buradan türetilmez, sorgudan ham olarak alınır.
  const [manualSernos, setManualSernos] = useState<number[]>([]);

  // Manuel yükleme/silme sonrası sayfadaki verileri tazelemek için sayaç.
  // Effect dep'lerine girer; ConsumptionCharts ve EnergyTable key ile remount edilir.
  const [dataVersion, setDataVersion] = useState(0);

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

  // ✅ Ay içi fatura (PTF cutoff) state
  const [invoiceToDate, setInvoiceToDate] =
    useState<Awaited<ReturnType<typeof computeMonthInvoiceToDate>>>(null);
  const [invoiceToDateLoading, setInvoiceToDateLoading] = useState(false);


  const [estimateOpen, setEstimateOpen] = useState(false);

  // Admin tarafından faturadan çıkarılan kalemler (fatura kalem override'ları) —
  // tahmin panelinde de satırları hiç render edilmez.
  const estimateExcludedItems = new Set<string>(
    invoiceToDate?.breakdown.appliedOverrides?.excludedItems ?? []
  );
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
            data_source,
            subscription_settings:subscription_settings (
              title,
              nickname,
              is_hidden
            )
          `
          )
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        if (error) throw error;

        const list: SubscriptionOption[] = (data ?? [])
          .filter((r: any) => {
            const ss = Array.isArray(r.subscription_settings)
              ? r.subscription_settings?.[0]
              : r.subscription_settings;
            return !(ss?.is_hidden);
          })
          .map((r: any) => {
            const ss = Array.isArray(r.subscription_settings)
              ? r.subscription_settings?.[0]
              : r.subscription_settings;

            const nick = (ss?.nickname ?? ss?.title ?? null) as string | null;

            return {
              subscriptionSerNo: Number(r.subscription_serno),
              meterSerial: r.meter_serial ?? null,
              nickname: nick,
              dataSource: (r.data_source ?? null) as string | null,
            };
          });

        setSubs(list);

        // is_hidden filtresinden ÖNCEKİ ham veriden: gizli manuel tesislerin
        // satırları da Excel doğrulamasında tanınsın.
        setManualSernos(
          (data ?? [])
            .filter((r: any) => r.data_source === "manual")
            .map((r: any) => Number(r.subscription_serno))
            .filter((n: number) => Number.isFinite(n)),
        );

        // "Tümü" seçiliyse koru; aksi halde görünür listeden geçerli tek tesisi çöz.
        if (selectedSub === "ALL") {
          // koru (en az 1 görünür tesis varsa anlamlı)
        } else {
          const next = resolveSelectedSub(
            list.map((s) => s.subscriptionSerNo),
            typeof selectedSub === "number" ? selectedSub : null,
          );
          setSelectedSub(next);
        }
      } catch (e: any) {
        if (!cancel) {
          console.error("subscription list (consumption) error:", e);
          setSubsErr(e?.message ?? "Tesisler yüklenemedi");
          setSubs([]);
          setManualSernos([]);
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

  const subLabel = (s: SubscriptionOption) => {
    const tesisNo = s.meterSerial ?? `Tesis ${s.subscriptionSerNo}`;
    const nick = (s.nickname ?? "").trim();
    return nick ? `${tesisNo} - ${nick}` : tesisNo;
  };

  // Görünür tesis serno listesi ("Tümü" toplamı + grafikler için)
  const visibleSernos = subs.map((s) => s.subscriptionSerNo);

  // Seçili tekil tesis manuel mi?
  const selectedManualSub =
    selectedSub !== "ALL" && selectedSub != null
      ? subs.find(
          (s) => s.subscriptionSerNo === selectedSub && s.dataSource === "manual",
        ) ?? null
      : null;

  // Silme modalı seçicisi + "Tümü" modu görünürlüğü için görünür manuel
  // tesisler (etiketli). "Tümü" görünür tesisleri kapsadığından panelin
  // "Tümü" koşulu da bu listeye bakar.
  const manualFacilities = subs
    .filter((s) => s.dataSource === "manual")
    .map((s) => ({ serno: s.subscriptionSerNo, label: subLabel(s) }));

  // Panel görünürlüğü: tekil manuel tesis seçili VEYA "Tümü" seçili ve en az
  // bir manuel tesis var. API tesisi tekil seçiliyken görünmez.
  const showManualPanel =
    selectedManualSub != null ||
    (selectedSub === "ALL" && manualFacilities.length > 0);

  // Seçimi state + localStorage'a yazan tek giriş (ana seçici ↔ saatlik tablo paylaşır).
  const handleSelectSub = (v: "ALL" | number) => {
    setSelectedSub(v);
    if (v === "ALL") {
      localStorage.setItem(LS_CONS_KEY, "ALL");
    } else {
      localStorage.setItem(LS_SUB_KEY, String(v));
      localStorage.setItem(LS_CONS_KEY, String(v));
    }
  };

  // Grafik kartında gösterilecek seçim etiketi
  const selectionLabel =
    selectedSub === "ALL"
      ? `Tümü (${visibleSernos.length} tesis)`
      : (() => {
          const s = subs.find((x) => x.subscriptionSerNo === selectedSub);
          return s ? subLabel(s) : "Tesis seçilmedi";
        })();


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

        const sernos = selectedSub === "ALL" ? visibleSernos : [selectedSub as number];

        const sum = await fetchRangeKwh({
          uid,
          sernos,
          dailyGte: start.format("YYYY-MM-DD"),
          dailyLt: endCurrentMonth.format("YYYY-MM-DD"),
          hourlyStartIso: start.toDate().toISOString(),
          hourlyEndIso: endCurrentMonth.toDate().toISOString(),
        });

        if (cancel) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, sessionLoading, selectedSub, subs, dataVersion]);

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

        const sernos = selectedSub === "ALL" ? visibleSernos : [selectedSub as number];

        const sum = await fetchRangeKwh({
          uid,
          sernos,
          dailyGte: start.format("YYYY-MM-DD"),
          dailyLte: nowLocal.format("YYYY-MM-DD"),
          hourlyStartIso: start.toDate().toISOString(),
          hourlyEndIso: nowLocal.toDate().toISOString(),
          hourlyEndInclusive: true,
        });

        if (cancel) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, sessionLoading, selectedSub, subs, dataVersion]);

  // ─────────────────────────────────────────────
  // 3) Bu ay (PTF tablosundaki en son saate göre) fatura (TL)
  // ─────────────────────────────────────────────
useEffect(() => {
  if (sessionLoading) return;

  // "Tümü" seçiliyken fatura tek tesis gerektirdiği için hesaplanmaz (panel gizli).
  if (!uid || !selectedSub || selectedSub === "ALL") {
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
        excludeGesMahsup: true,        // GES/veriş mahsubu bu panelde uygulanmaz
        projectToMonthEnd: true,       // tüketim ay sonuna projekte edilir
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
}, [uid, sessionLoading, selectedSub, dataVersion]);



  return (
    <DashboardShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            Tüketim Detayı
          </h1>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end md:w-auto">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-neutral-600">Tesis:</span>
            <select
              value={selectedSub == null ? "" : String(selectedSub)}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                handleSelectSub(val === "ALL" ? "ALL" : Number(val));
              }}
              className="h-10 md:h-9 w-full sm:w-[420px] md:w-auto min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 md:px-2 text-[16px] md:text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#0A66FF]"
            >
              {subs.length === 0 && <option value="">Tesis bulunamadı</option>}
              {subs.length > 0 && <option value="ALL">Tümü</option>}
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

      {(subsErr || prevErr || currErr) && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {subsErr && <>Tesisler: {subsErr}. </>}
          {prevErr && <>Geçen ay: {prevErr}. </>}
          {currErr && <>Bu ay: {currErr}. </>}
        </div>
      )}

      {/* Manuel tesis yükleme paneli — tekil manuel tesis seçiliyken veya
          "Tümü" seçiliyken (en az bir manuel tesis varsa) */}
      {uid && showManualPanel && (
        <ManualUploadPanel
          uid={uid}
          selectedSerno={selectedManualSub ? selectedManualSub.subscriptionSerNo : null}
          facilityLabel={selectedManualSub ? subLabel(selectedManualSub) : null}
          manualSernos={manualSernos}
          manualFacilities={manualFacilities}
          onDataChanged={() => setDataVersion((v) => v + 1)}
        />
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




{/* Bu ay (PTF'e göre) fatura kalemleri (şu ana kadar) — "Tümü"de gizli */}
{selectedSub !== "ALL" && (invoiceToDateLoading || invoiceToDate) && (
  <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-neutral-900">
          Tahmini Ay İçi Fatura
          {(invoiceToDate?.totalProductionKwh ?? 0) > 0
            ? " (GES Mahsubu Dahil Değildir)"
            : ""}
        </div>
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
                  {!estimateExcludedItems.has("enerji") && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4">Enerji Bedeli</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {fmtUnit6(invoiceToDate.unitPriceEnergy)} TL/kWh ×{" "}
                        <span className="font-medium text-amber-600">
                          {fmtKwh(invoiceToDate.projectedConsumptionKwh)} kWh
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {fmtMoney2(invoiceToDate.breakdown.energyCharge)}
                      </td>
                    </tr>
                  )}

                  {invoiceToDate.trafoDegeri > 0 && !estimateExcludedItems.has("trafo") && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4">Trafo Kaybı</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {fmtUnit6(invoiceToDate.unitPriceEnergy)} TL/kWh ×{" "}
                        <span className="font-medium text-amber-600">
                          {fmtKwh(invoiceToDate.projectedTrafoKwh)} kWh
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {fmtMoney2(invoiceToDate.breakdown.trafoCharge)}
                      </td>
                    </tr>
                  )}

                  {!estimateExcludedItems.has("dagitim") && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4">Dağıtım Bedeli</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {fmtUnit6(invoiceToDate.breakdown.effectiveDistributionUnitPrice)} TL/kWh ×{" "}
                        <span className="font-medium text-amber-600">
                          {fmtKwh(invoiceToDate.breakdown.distributionChargeKwh)} kWh
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {fmtMoney2(invoiceToDate.breakdown.distributionCharge)}
                      </td>
                    </tr>
                  )}

                  {!estimateExcludedItems.has("btv") && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4">
                        BTV (%{(invoiceToDate.btvRate * 100).toFixed(2)})
                      </td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {invoiceToDate.invoiceMethodId === 5
                          ? "(Enerji bedeli + YEK bedeli) × BTV oranı"
                          : "Enerji bedeli × BTV oranı"}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {fmtMoney2(invoiceToDate.breakdown.btvCharge)}
                      </td>
                    </tr>
                  )}

                  {invoiceToDate.tariffType === "dual" && !estimateExcludedItems.has("guc") && (
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

                  {!estimateExcludedItems.has("reaktif") && (
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
                  )}

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
                        ? invoiceToDate.yekdemMissing === "value"
                          ? "Önceki dönem için yekdem_value girilmemiş."
                          : invoiceToDate.yekdemMissing === "final"
                          ? "Önceki dönem için yekdem_final girilmemiş."
                          : "Önceki dönem YEKDEM verileri girilmemiş."
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

            {/* GES Üretim Satışı — fazla üretim satışı, faturaya dahil DEĞİL */}
            {invoiceToDate.breakdown.verisFazlaKwh > 0 && (
              <GesUretimSatisiCard
                result={calculateGesUretimSatisi({
                  satisKwh: invoiceToDate.breakdown.verisFazlaKwh,
                  onYil: invoiceToDate.onYil,
                  usdKur: invoiceToDate.monthlyUsdKur,
                  perakendeEnerjiBedeli: invoiceToDate.perakendeEnerjiBedeli,
                  dagitimBedeli: invoiceToDate.dagitimUreticiBedeli,
                })}
                lisansliSatis={invoiceToDate.lisansliSatis}
              />
            )}
          </>
        )}
      </div>
    </div>
  </div>
)}



      {/* Tüketim grafikleri (fatura kartı ile saatlik tablo arasında) */}
      {selectedSub != null && (
        <ConsumptionCharts
          key={`charts-${dataVersion}`}
          uid={uid}
          selectedSub={selectedSub}
          visibleSernos={visibleSernos}
          selectionLabel={selectionLabel}
        />
      )}

      {/* Saatlik tüketim tablosu — seçim çözülmeden render etme (null→"ALL"
          coercion'ı ile ana seçicinin uyumsuz görünmesini engeller) */}
      {selectedSub != null && (
        <div className="w-full rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold text-neutral-900">Saatlik Tüketim</div>
          </div>

          <EnergyTable
            key={`table-${dataVersion}`}
            selectedSub={selectedSub}
            onSelectedSubChange={handleSelectSub}
          />
        </div>
      )}
    </DashboardShell>
  );
}
