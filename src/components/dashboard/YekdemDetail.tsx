// src/components/dashboard/YekdemDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { dayjsTR } from "@/lib/dayjs";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { downloadXlsx } from "@/components/utils/xlsx";

type YearRow = {
  month: number; // 1-12
  yekdem_value: number | null; // ay başı girilen
  yekdem_final: number | null; // ay sonu girilen
};

type SubscriptionOption = {
  subscriptionSerNo: number;
  meterSerial: string | null;
};

const MONTH_LABELS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

function fmtYekdem(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function safeName(s: string) {
  return (s ?? "tesis")
    .toString()
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
}

const LS_SUB_KEY = "eco_selected_sub";

export default function YekdemDetail() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const uid = authSession?.user?.id ?? null;

  // default: geçen ay
  const base = useMemo(() => dayjsTR().subtract(1, "month"), []);
  const [year, setYear] = useState<number>(base.year());
  const [selectedMonth, setSelectedMonth] = useState<number>(base.month() + 1); // 1–12

  const [rows, setRows] = useState<YearRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // tesisler (label = meter_serial)
  const [subs, setSubs] = useState<SubscriptionOption[]>([]);
  const [selectedSub, setSelectedSub] = useState<number | null>(() => {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(LS_SUB_KEY) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState<string | null>(null);

  // export
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // ─────────────────────────────
  // 0) Tesis listesini yükle (owner_subscriptions.meter_serial)
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
          .select("subscription_serno, meter_serial")
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        if (error) throw error;

        const list: SubscriptionOption[] = (data ?? []).map((r: any) => ({
          subscriptionSerNo: Number(r.subscription_serno),
          meterSerial: r.meter_serial ?? null,
        }));

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
          console.error("subscription list (YEKDEM) error:", e);
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

  const selectedSubLabel =
    selectedMeterSerial ??
    (selectedSub != null ? String(selectedSub) : "Tesis seçilmedi");

  // ─────────────────────────────
  // Bu yılın YEKDEM değerlerini çek (period_year/period_month)
  // ─────────────────────────────
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const { data, error } = await supabase
          .from("subscription_yekdem")
          .select("period_month, yekdem_value, yekdem_final")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .eq("period_year", year);

        if (cancel) return;
        if (error) throw error;

        const list = ((data ?? []) as any[]).map((r) => ({
          month: Number(r.period_month),
          yekdem_value: r.yekdem_value != null ? Number(r.yekdem_value) : null,
          yekdem_final: r.yekdem_final != null ? Number(r.yekdem_final) : null,
        }));

        list.sort((a, b) => a.month - b.month);
        setRows(list);
      } catch (e: any) {
        if (!cancel) {
          console.error("subscription_yekdem yearly error:", e);
          setErr(e?.message ?? "YEKDEM verileri alınamadı");
          setRows([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub, year]);

  // Seçili / önceki / sonraki ay satırları
  const currentRow = rows.find((r) => r.month === selectedMonth) || null;
  const prevRow =
    selectedMonth > 1
      ? rows.find((r) => r.month === selectedMonth - 1) || null
      : null;
  const nextRow =
    selectedMonth < 12
      ? rows.find((r) => r.month === selectedMonth + 1) || null
      : null;

  const canGoPrev = selectedMonth > 1;
  const canGoNext = selectedMonth < 12;

  function handlePrevMonth() {
    if (!canGoPrev) return;
    setSelectedMonth((m) => Math.max(1, m - 1));
  }

  function handleNextMonth() {
    if (!canGoNext) return;
    setSelectedMonth((m) => Math.min(12, m + 1));
  }

  async function handleExportXlsx() {
    if (!selectedSub) return;

    try {
      setExporting(true);
      setExportErr(null);

      const map = new Map<number, YearRow>();
      for (const r of rows) map.set(r.month, r);

      const excelRows = Array.from({ length: 12 }, (_, i) => i + 1).map(
        (m) => {
          const r = map.get(m);
          return {
            Yıl: year,
            Ay: MONTH_LABELS[m - 1],
            "period_month": m,
            "yekdem_value (TL/kWh)":
              r?.yekdem_value != null && Number.isFinite(Number(r.yekdem_value))
                ? Number(r.yekdem_value)
                : null,
            "yekdem_final (TL/kWh)":
              r?.yekdem_final != null && Number.isFinite(Number(r.yekdem_final))
                ? Number(r.yekdem_final)
                : null,
          };
        }
      );

      const meter = safeName(selectedMeterSerial ?? String(selectedSub));
      const fileName = `yekdem_${meter}_${year}.xlsx`;

      downloadXlsx({
        rows: excelRows,
        fileName,
        sheetName: "YEKDEM",
      });
    } catch (e: any) {
      console.error("YEKDEM export xlsx error:", e);
      setExportErr(e?.message ?? "Excel çıkartılamadı.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <DashboardShell>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            YEKDEM Detayı
          </h1>
          <p className="text-sm text-neutral-500">
            {selectedSub
              ? `${year} yılı • seçili tesis (${selectedSubLabel}) YEKDEM değerleri (TL/kWh)`
              : `${year} yılı için YEKDEM değerlerini görmek için tesis seçin`}
          </p>
          {selectedSub && (
            <p className="mt-1 text-xs text-neutral-500">
              Seçili tesis:{" "}
              <span className="font-medium text-neutral-800">
                {selectedSubLabel}
              </span>
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
                  {s.meterSerial ?? String(s.subscriptionSerNo)}
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

      {/* Hata / yükleniyor */}
      {(subsErr || err || exportErr) && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {subsErr && <>Tesisler: {subsErr}. </>}
          {err && <>YEKDEM: {err}. </>}
          {exportErr && <>Excel: {exportErr}</>}
        </div>
      )}
      {loading && (
        <div className="mb-4 text-sm text-neutral-500">
          YEKDEM verileri yükleniyor…
        </div>
      )}

      {/* Ay navigasyon + kartlar */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handlePrevMonth}
            disabled={!canGoPrev}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50"
          >
            ← Önceki ay
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              ← {year - 1}
            </button>

            <div className="h-9 rounded-full border border-neutral-200 bg-white px-4 text-xs text-neutral-700 grid place-items-center">
              {year}
            </div>

            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              {year + 1} →
            </button>
          </div>

          <button
            onClick={handleNextMonth}
            disabled={!canGoNext}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50"
          >
            Sonraki ay →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* önceki ay */}
          <div className="hidden sm:block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-neutral-500 mb-1">Önceki Ay</div>
            <div className="text-sm font-medium text-neutral-700">
              {prevRow ? MONTH_LABELS[prevRow.month - 1] : "—"}
            </div>
            <div className="mt-2 text-lg font-semibold text-neutral-900">
              {fmtYekdem(prevRow?.yekdem_value)}{" "}
              <span className="text-xs font-normal text-neutral-500">
                TL/kWh (yekdem_value)
              </span>
            </div>
            <div className="mt-2 text-lg font-semibold text-neutral-900">
              {fmtYekdem(prevRow?.yekdem_final)}{" "}
              <span className="text-xs font-normal text-neutral-500">
                TL/kWh (yekdem_final)
              </span>
            </div>
          </div>

          {/* seçili ay */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-neutral-500 mb-1">
              Seçili Ayın YEKDEM Değerleri
            </div>
            <div className="text-sm font-medium text-neutral-700">
              {MONTH_LABELS[selectedMonth - 1]} {year}
            </div>

            <div className="mt-3 rounded-xl border border-neutral-200 p-4">
              <div className="text-xs text-neutral-500">
                yekdem_value (ay başı)
              </div>
              <div className="text-2xl font-semibold text-neutral-900">
                {fmtYekdem(currentRow?.yekdem_value)}{" "}
                <span className="text-sm font-normal text-neutral-500">
                  TL/kWh
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-neutral-200 p-4">
              <div className="text-xs text-neutral-500">
                yekdem_final (ay sonu)
              </div>
              <div className="text-2xl font-semibold text-neutral-900">
                {fmtYekdem(currentRow?.yekdem_final)}{" "}
                <span className="text-sm font-normal text-neutral-500">
                  TL/kWh
                </span>
              </div>
            </div>
          </div>

          {/* sonraki ay */}
          <div className="hidden sm:block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs text-neutral-500 mb-1">Sonraki Ay</div>
            <div className="text-sm font-medium text-neutral-700">
              {nextRow ? MONTH_LABELS[nextRow.month - 1] : "—"}
            </div>
            <div className="mt-2 text-lg font-semibold text-neutral-900">
              {fmtYekdem(nextRow?.yekdem_value)}{" "}
              <span className="text-xs font-normal text-neutral-500">
                TL/kWh (yekdem_value)
              </span>
            </div>
            <div className="mt-2 text-lg font-semibold text-neutral-900">
              {fmtYekdem(nextRow?.yekdem_final)}{" "}
              <span className="text-xs font-normal text-neutral-500">
                TL/kWh (yekdem_final)
              </span>
            </div>
          </div>
        </div>

        {/* Mobil prev/next küçük özet */}
        <div className="grid grid-cols-2 gap-5 sm:hidden">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-neutral-500 mb-1">Önceki</div>
            <div className="text-sm font-medium text-neutral-700">
              {prevRow ? MONTH_LABELS[prevRow.month - 1] : "—"}
            </div>
            <div className="mt-2 text-sm text-neutral-500">yekdem_value</div>
            <div className="text-lg font-semibold text-neutral-900">
              {fmtYekdem(prevRow?.yekdem_value)}
              <span className="text-sm font-normal text-neutral-500">
                {" "}
                TL/kWh
              </span>
            </div>
            <div className="mt-2 text-sm text-neutral-500">yekdem_final</div>
            <div className="text-lg font-semibold text-neutral-900">
              {fmtYekdem(prevRow?.yekdem_final)}
              <span className="text-sm font-normal text-neutral-500">
                {" "}
                TL/kWh
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-neutral-500 mb-1">Sonraki</div>
            <div className="text-sm font-medium text-neutral-700">
              {nextRow ? MONTH_LABELS[nextRow.month - 1] : "—"}
            </div>
            <div className="mt-2 text-sm text-neutral-500">yekdem_value</div>
            <div className="text-lg font-semibold text-neutral-900">
              {fmtYekdem(nextRow?.yekdem_value)}
              <span className="text-sm font-normal text-neutral-500">
                {" "}
                TL/kWh
              </span>
            </div>
            <div className="mt-2 text-sm text-neutral-500">yekdem_final</div>
            <div className="text-lg font-semibold text-neutral-900">
              {fmtYekdem(nextRow?.yekdem_final)}
              <span className="text-sm font-normal text-neutral-500">
                {" "}
                TL/kWh
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Yıl tablosu */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">
            {year} Yılı YEKDEM Tablosu
          </h2>

          <button
            onClick={handleExportXlsx}
            disabled={exporting || !selectedSub}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {exporting ? "Çıkartılıyor…" : "Excel’e Çıkar (.xlsx)"}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="text-sm text-neutral-500">
            Bu yıl için seçili tesisin YEKDEM değeri bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 text-left text-xs font-medium text-neutral-500">
                    Ay
                  </th>
                  <th className="py-2 pr-4 text-left text-xs font-medium text-neutral-500">
                    yekdem_value (TL/kWh)
                  </th>
                  <th className="py-2 pr-0 text-left text-xs font-medium text-neutral-500">
                    yekdem_final (TL/kWh)
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.month}
                    onClick={() => setSelectedMonth(r.month)}
                    className={[
                      "border-b last:border-0 cursor-pointer",
                      r.month === selectedMonth
                        ? "bg-[#0A66FF]/5"
                        : "hover:bg-neutral-50",
                    ].join(" ")}
                  >
                    <td className="py-2 pr-4">{MONTH_LABELS[r.month - 1]}</td>
                    <td className="py-2 pr-4">{fmtYekdem(r.yekdem_value)}</td>
                    <td className="py-2 pr-0">{fmtYekdem(r.yekdem_final)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedSub && (
          <div className="mt-3 text-[11px] text-neutral-500">
            Dosya adı: yekdem_{safeName(selectedMeterSerial ?? String(selectedSub))}_{year}.xlsx
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
