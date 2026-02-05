//src/components/dashboard/PtfDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { downloadXlsx } from "@/components/utils/xlsx";

type SubscriptionOption = {
  subscriptionSerNo: number;
  meterSerial: string | null;
};

type Row = {
  ts: string; // ISO
  kwh: number;
  ptf_tl_mwh: number | null;
  tl: number | null; // kwh * ptf / 1000
};

const LS_SUB_KEY = "eco_selected_sub";

const fmtInt = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const fmt2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmt6 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });

// timestamp -> hourKey (timezone sapıtmasın diye epoch saat anahtarı)
const hourKey = (ts: string) =>
  Math.floor(new Date(ts).getTime() / 3600000) * 3600000;

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

export default function PtfDetail() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const uid = authSession?.user?.id ?? null;

  // default: geçen ay
  const base = useMemo(() => dayjsTR().subtract(1, "month"), []);
  const [year, setYear] = useState<number>(base.year());
  const [month, setMonth] = useState<number>(base.month() + 1); // 1-12

  // tesis
  const [subs, setSubs] = useState<SubscriptionOption[]>([]);
  const [selectedSub, setSelectedSub] = useState<number | null>(() => {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(LS_SUB_KEY) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState<string | null>(null);

  // data
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // export
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // özetler
  const summary = useMemo(() => {
    let totalKwh = 0;
    let coveredKwh = 0;
    let totalTl = 0;

    for (const r of rows) {
      totalKwh += r.kwh || 0;
      if (r.ptf_tl_mwh != null && r.tl != null) {
        coveredKwh += r.kwh || 0;
        totalTl += r.tl || 0;
      }
    }

    const monthlyPtf = coveredKwh > 0 ? totalTl / coveredKwh : null;
    const missingKwh = totalKwh - coveredKwh;

    return { totalKwh, coveredKwh, missingKwh, totalTl, monthlyPtf };
  }, [rows]);

  const monthLabel = useMemo(() => {
    const labels = [
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
    return `${labels[month - 1]} ${year}`;
  }, [month, year]);

  const selectedMeterSerial =
    subs.find((s) => s.subscriptionSerNo === selectedSub)?.meterSerial ?? null;

  const selectedSubLabel =
    selectedMeterSerial ??
    (selectedSub != null ? String(selectedSub) : "Tesis seçilmedi");

  // 0) tesisleri çek (LABEL = owner_subscriptions.meter_serial)
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

  // 1) seçili ay için satır satır hesap
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const start = dayjsTR().year(year).month(month - 1).startOf("month");
        const end = start.clone().add(1, "month");

        // consumption
        const cons = await supabase
          .from("consumption_hourly")
          .select("ts, cn")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .gte("ts", start.toDate().toISOString())
          .lt("ts", end.toDate().toISOString())
          .order("ts", { ascending: true });

        if (cancel) return;
        if (cons.error) throw cons.error;

        // ptf
        const ptf = await supabase
          .from("epias_ptf_hourly")
          .select("ts, ptf_tl_mwh")
          .gte("ts", start.toDate().toISOString())
          .lt("ts", end.toDate().toISOString());

        if (cancel) return;
        if (ptf.error) throw ptf.error;

        const ptfMap = new Map<number, number>();
        for (const r of (ptf.data ?? []) as any[]) {
          const ts = String(r.ts);
          const v = r.ptf_tl_mwh != null ? Number(r.ptf_tl_mwh) : NaN;
          if (Number.isFinite(v)) ptfMap.set(hourKey(ts), v);
        }

        const out: Row[] = [];
        for (const r of (cons.data ?? []) as any[]) {
          const ts = String(r.ts);
          const kwh = Number(r.cn) || 0;

          const p = ptfMap.get(hourKey(ts));
          const ptf_tl_mwh = p != null ? p : null;

          const tl = ptf_tl_mwh != null ? (kwh * ptf_tl_mwh) / 1000.0 : null;

          out.push({ ts, kwh, ptf_tl_mwh, tl });
        }

        setRows(out);
      } catch (e: any) {
        if (!cancel) {
          console.error("PTF detail error:", e);
          setErr(e?.message ?? "PTF detayı alınamadı");
          setRows([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub, year, month]);

  const canPrev = month > 1;
  const canNext = month < 12;

  async function handleExportXlsx() {
    if (!selectedSub) return;

    try {
      setExporting(true);
      setExportErr(null);

      const excelRows = rows.map((r) => {
        const d = dayjsTR(r.ts);
        return {
          Tarih: d.format("DD.MM.YYYY"),
          Saat: d.format("HH:00"),
          "Saatlik Tüketim (kWh)": Number(r.kwh) || 0,
          "EPİAŞ PTF (TL/MWh)":
            r.ptf_tl_mwh != null && Number.isFinite(Number(r.ptf_tl_mwh))
              ? Number(r.ptf_tl_mwh)
              : null,
          "kWh × PTF / 1000 (TL)":
            r.tl != null && Number.isFinite(Number(r.tl)) ? Number(r.tl) : null,
        };
      });

      const meter = safeName(selectedMeterSerial ?? String(selectedSub));
      const fileName = `ptf_${meter}_${year}_${pad2(month)}.xlsx`;

      downloadXlsx({
        rows: excelRows,
        fileName,
        sheetName: "PTF",
      });
    } catch (e: any) {
      console.error("PTF export xlsx error:", e);
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
          <h1 className="text-2xl font-semibold text-neutral-900">PTF Detayı</h1>
          <p className="text-sm text-neutral-500">
            {selectedSub ? `${monthLabel} • seçili tesis (${selectedSubLabel})` : "Tesis seçin"}
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
                  {s.meterSerial ?? String(s.subscriptionSerNo)}
                </option>
              ))}
            </select>

            {subsLoading && <span className="text-[11px] text-neutral-500">Yükleniyor…</span>}

            <button
              onClick={() => navigate("/dashboard")}
              className="h-10 md:h-9 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              ← Panele dön
            </button>
          </div>
        </div>
      </div>

      {(subsErr || err || exportErr) && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {subsErr && <>Tesisler: {subsErr}. </>}
          {err && <>PTF: {err}. </>}
          {exportErr && <>Excel: {exportErr}</>}
        </div>
      )}

      {/* Ay kontrol */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            disabled={!canPrev}
            onClick={() => canPrev && setMonth((m) => m - 1)}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50"
          >
            ← Önceki ay
          </button>

          <div className="h-9 rounded-full border border-neutral-200 bg-white px-4 text-xs text-neutral-700 grid place-items-center">
            {monthLabel}
          </div>

          <button
            disabled={!canNext}
            onClick={() => canNext && setMonth((m) => m + 1)}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50"
          >
            Sonraki ay →
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
          >
            ← {year - 1}
          </button>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
          >
            {year + 1} →
          </button>
        </div>
      </div>

      {/* Üst özet (formül) */}
      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-neutral-500 mb-2">Aylık Ortalama PTF </div>
        <div className="text-sm text-neutral-700">
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Toplam(kWh)</div>
            <div className="text-lg font-semibold text-neutral-900">{fmtInt(summary.totalKwh)}</div>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Kapsanan kWh</div>
            <div className="text-lg font-semibold text-neutral-900">{fmtInt(summary.coveredKwh)}</div>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Σ(TL)</div>
            <div className="text-lg font-semibold text-neutral-900">{fmt2(summary.totalTl)}</div>
          </div>

        </div>

        {summary.missingKwh > 0 && (
          <div className="mt-3 text-xs text-amber-700">
            Not: EPİAŞ PTF bulunamayan saatler var. Eksik kWh: {fmtInt(summary.missingKwh)}
          </div>
        )}
      </div>

      {/* Tablo */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-neutral-900">Saatlik PTF Hesabı</h2>
            {loading && <div className="text-xs text-neutral-500">Yükleniyor…</div>}
          </div>

          <button
            onClick={handleExportXlsx}
            disabled={exporting || rows.length === 0}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {exporting ? "Çıkartılıyor…" : "Excel’e Çıkar (.xlsx)"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left text-xs font-medium text-neutral-500">Gün</th>
                <th className="py-2 pr-4 text-left text-xs font-medium text-neutral-500">Saat</th>
                <th className="py-2 pr-4 text-right text-xs font-medium text-neutral-500">
                  Saatlik Tüketim (kWh)
                </th>
                <th className="py-2 pr-4 text-right text-xs font-medium text-neutral-500">
                  EPİAŞ Saatlik PTF (TL/MWh)
                </th>

              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-sm text-neutral-500">
                    Veri yok.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const d = dayjsTR(r.ts);
                  return (
                    <tr key={r.ts} className="border-b last:border-0">
                      <td className="py-2 pr-4">{d.format("DD.MM.YYYY")}</td>
                      <td className="py-2 pr-4">{d.format("HH:00")}</td>
                      <td className="py-2 pr-4 text-right">{fmtInt(r.kwh)}</td>
                      <td className="py-2 pr-4 text-right">{fmt2(r.ptf_tl_mwh)}</td>
                      
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
