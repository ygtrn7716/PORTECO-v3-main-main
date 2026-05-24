import { useEffect, useMemo, useRef, useState } from "react";
import { useTesisListForReports } from "./useTesisListForReports";
import { fetchConsumptionVsProduction } from "./fetchConsumptionVsProduction";
import { exportConsumptionVsProductionXlsx } from "./exportConsumptionVsProductionXlsx";
import type { ReportType, ReportTypeMeta, TesisOption } from "./types";

type Props = {
  uid: string | null;
  sessionLoading: boolean;
};

const REPORT_TYPES: ReportTypeMeta[] = [
  {
    id: "consumption_vs_production",
    title: "Tüketim ve Üretim Karşılaştırması",
    description: "Aylık tüketim ve GES üretiminizi yan yana karşılaştırın.",
    enabled: true,
  },
  {
    id: "ptf_analysis",
    title: "PTF Analizi",
    description: "Saatlik PTF değişimini ve tesis bazlı maliyet etkisini görün.",
    enabled: false,
  },
  {
    id: "invoice_comparison",
    title: "Fatura Karşılaştırması",
    description: "Tesisler arasında ve dönemler arasında fatura kalemleri.",
    enabled: false,
  },
  {
    id: "settlement_performance",
    title: "Mahsup Performansı",
    description: "YEKDEM mahsup ve net fayda dökümü.",
    enabled: false,
  },
];

const tesisLabel = (t: TesisOption): string => {
  const tesisNo = (t.meterSerial ?? `Tesis ${t.subscriptionSerNo}`).trim();
  const nick = (t.nickname ?? "").trim();
  return nick ? `${tesisNo} - ${nick}` : tesisNo;
};

export function ReportsSection({ uid, sessionLoading }: Props) {
  const { tesisler, loading: tesislerLoading, error: tesislerErr } =
    useTesisListForReports(uid, sessionLoading);

  const [reportType, setReportType] = useState<ReportType>(
    "consumption_vs_production",
  );
  const [selectedSernos, setSelectedSernos] = useState<number[]>([]);
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Tesis listesi yüklendiğinde default: hepsi seçili.
  useEffect(() => {
    if (tesisler.length === 0) {
      setSelectedSernos([]);
      return;
    }
    setSelectedSernos(tesisler.map((t) => t.subscriptionSerNo));
  }, [tesisler]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now + 5; y >= now - 5; y--) out.push(y);
    return out;
  }, []);

  const canExport =
    selectedSernos.length > 0 &&
    !exporting &&
    reportType === "consumption_vs_production";

  const summaryLine = `${selectedSernos.length} tesis seçildi · ${year} · 12 ay`;

  const handleExport = async () => {
    if (!uid || selectedSernos.length === 0 || exporting) return;
    setExporting(true);
    setExportErr(null);
    setProgress({ done: 0, total: selectedSernos.length });
    try {
      const sernoSet = new Set(selectedSernos);
      const selectedTesisler = tesisler.filter((t) =>
        sernoSet.has(t.subscriptionSerNo),
      );
      const result = await fetchConsumptionVsProduction({
        uid,
        selectedTesisler,
        year,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      exportConsumptionVsProductionXlsx(result);
    } catch (e: any) {
      console.error("Excel export error:", e);
      setExportErr(e?.message ?? "Excel oluşturulamadı.");
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Raporlar</h2>
          <p className="text-sm text-neutral-500">
            Seçili tesisler için Excel raporu indirin.
          </p>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {REPORT_TYPES.map((rt) => {
          const isActive = reportType === rt.id;
          const base =
            "relative rounded-xl border p-4 text-left transition";
          const cls = !rt.enabled
            ? `${base} cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60`
            : isActive
              ? `${base} border-neutral-900 bg-white shadow-sm`
              : `${base} border-neutral-200 bg-white hover:border-neutral-300`;
          return (
            <button
              key={rt.id}
              type="button"
              disabled={!rt.enabled}
              onClick={() => rt.enabled && setReportType(rt.id)}
              className={cls}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-900">
                  {rt.title}
                </div>
                {!rt.enabled ? (
                  <span className="shrink-0 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600">
                    Yakında
                  </span>
                ) : isActive ? (
                  <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white">
                    Seçili
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-snug text-neutral-500">
                {rt.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <TesisMultiSelect
            tesisler={tesisler}
            selectedSernos={selectedSernos}
            onChange={setSelectedSernos}
            loading={tesislerLoading}
          />
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#0A66FF] md:h-9"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <span className="text-xs text-neutral-500">{summaryLine}</span>
          <div className="flex items-center gap-2">
            {exporting && progress ? (
              <span className="text-xs text-neutral-500">
                {progress.done}/{progress.total} tesis yükleniyor…
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleExport}
              disabled={!canExport}
              className="h-10 rounded-lg border border-neutral-300 bg-neutral-900 px-4 text-xs text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 md:h-9"
            >
              Excel'e Aktar
            </button>
          </div>
        </div>
      </div>

      {tesislerErr ? (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Tesisler: {tesislerErr}
        </div>
      ) : null}

      {exportErr ? (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {exportErr}
        </div>
      ) : null}
    </section>
  );
}

function TesisMultiSelect({
  tesisler,
  selectedSernos,
  onChange,
  loading,
}: {
  tesisler: TesisOption[];
  selectedSernos: number[];
  onChange: (sernos: number[]) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const total = tesisler.length;
  const selectedCount = selectedSernos.length;

  const triggerLabel = (() => {
    if (loading) return "Yükleniyor…";
    if (total === 0) return "Tesis bulunamadı";
    if (selectedCount === 0) return "Tesis seçin";
    if (selectedCount === total) return `Tüm tesisler (${total})`;
    if (selectedCount === 1) {
      const t = tesisler.find(
        (x) => x.subscriptionSerNo === selectedSernos[0],
      );
      return t ? tesisLabel(t) : "1 tesis seçildi";
    }
    return `${selectedCount} tesis seçildi`;
  })();

  const toggleOne = (serno: number) => {
    if (selectedSernos.includes(serno)) {
      onChange(selectedSernos.filter((s) => s !== serno));
    } else {
      onChange([...selectedSernos, serno]);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading || total === 0}
        className="flex h-10 min-w-[260px] items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 md:h-9"
      >
        <span className="truncate">{triggerLabel}</span>
        <span className="shrink-0 text-neutral-400">▾</span>
      </button>

      {open && total > 0 ? (
        <div className="absolute z-20 mt-1 w-[320px] rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between border-b border-neutral-100 pb-2">
            <button
              type="button"
              onClick={() =>
                onChange(tesisler.map((t) => t.subscriptionSerNo))
              }
              className="text-xs text-[#0A66FF] hover:underline"
            >
              Tümünü seç
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-[#0A66FF] hover:underline"
            >
              Seçimi temizle
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {tesisler.map((t) => {
              const checked = selectedSernos.includes(t.subscriptionSerNo);
              return (
                <label
                  key={t.subscriptionSerNo}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(t.subscriptionSerNo)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-neutral-800">
                    {tesisLabel(t)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
