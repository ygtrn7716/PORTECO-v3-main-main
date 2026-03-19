// src/components/dashboard/GesHourlyView.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { downloadXlsx } from "@/components/utils/xlsx";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

/* ─── Türkçe gün / ay adları ──────────────────────── */
const DAY_NAMES = [
  "Pazar", "Pazartesi", "Salı", "Çarşamba",
  "Perşembe", "Cuma", "Cumartesi",
];
const MONTH_NAMES_LONG = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/* ─── Tipler ──────────────────────────────────────── */
type HourlyRow = {
  ts: string;
  energy_kwh: number;
  avg_power_w: number;
  sample_count: number;
};

type ChartBar = {
  hour: string;
  kwh: number;
};

interface GesHourlyViewProps {
  activePlantIds: string[];
  selectedDay: string;            // "YYYY-MM-DD"
  onDayChange: (day: string) => void;
  onBackToDaily: () => void;
}

/* ─── Yardımcılar ─────────────────────────────────── */
const fmtKwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 1 });

const fmtW = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Math.round(Number(n)).toLocaleString("tr-TR");

const formatDayLabel = (dateStr: string) => {
  const d = dayjsTR(dateStr);
  const dayName = DAY_NAMES[d.day()];
  const monthName = MONTH_NAMES_LONG[d.month()];
  return `${d.date()} ${monthName} ${d.year()}, ${dayName}`;
};

/** Satır arka plan sınıfı — üretim seviyesine göre */
const rowBg = (kwh: number) => {
  if (kwh === 0) return "bg-neutral-50 text-neutral-400";
  if (kwh < 1) return "bg-emerald-50/40";
  if (kwh > 3) return "bg-emerald-50";
  return "";
};

/* ─── Bileşen ─────────────────────────────────────── */
export default function GesHourlyView({
  activePlantIds,
  selectedDay,
  onDayChange,
  onBackToDaily,
}: GesHourlyViewProps) {
  const [hourlyData, setHourlyData] = useState<HourlyRow[]>([]);
  const [loading, setLoading] = useState(false);

  const today = dayjsTR().format("YYYY-MM-DD");
  const isToday = selectedDay >= today;

  /* ─── Veri çekme ──────────────────────────────── */
  useEffect(() => {
    if (!activePlantIds.length) {
      setHourlyData([]);
      return;
    }
    let cancel = false;

    (async () => {
      setLoading(true);

      const dayStart = dayjsTR(selectedDay).startOf("day").toISOString();
      const dayEnd = dayjsTR(selectedDay).endOf("day").toISOString();

      const { data, error } = await supabase
        .from("ges_production_hourly")
        .select("ts, energy_kwh, avg_power_w, sample_count")
        .in("ges_plant_id", activePlantIds)
        .gte("ts", dayStart)
        .lte("ts", dayEnd)
        .order("ts");

      if (cancel) return;

      if (error) {
        setHourlyData([]);
        setLoading(false);
        return;
      }

      // Birden fazla plant seçiliyse saat bazında grupla
      const byHour: Record<string, { kwh: number; powerXcount: number; count: number }> = {};

      for (const row of data ?? []) {
        const hourKey = dayjsTR(row.ts).format("HH:00");
        const prev = byHour[hourKey] ?? { kwh: 0, powerXcount: 0, count: 0 };
        const sc = Number(row.sample_count) || 0;
        prev.kwh += Number(row.energy_kwh) || 0;
        prev.powerXcount += (Number(row.avg_power_w) || 0) * sc;
        prev.count += sc;
        byHour[hourKey] = prev;
      }

      const rows: HourlyRow[] = Object.entries(byHour)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([hour, v]) => ({
          ts: hour,
          energy_kwh: v.kwh,
          avg_power_w: v.count > 0 ? v.powerXcount / v.count : 0,
          sample_count: v.count,
        }));

      setHourlyData(rows);
      setLoading(false);
    })();

    return () => { cancel = true; };
  }, [activePlantIds, selectedDay]);

  /* ─── Grafik verisi ───────────────────────────── */
  const chartData: ChartBar[] = hourlyData.map((r) => ({
    hour: r.ts,
    kwh: Math.round(r.energy_kwh * 100) / 100,
  }));

  /* ─── Toplamlar ───────────────────────────────── */
  const totalKwh = hourlyData.reduce((s, r) => s + (Number(r.energy_kwh) || 0), 0);
  const totalSamples = hourlyData.reduce((s, r) => s + (Number(r.sample_count) || 0), 0);

  /* ─── XLSX export ─────────────────────────────── */
  const handleExport = () => {
    if (!hourlyData.length) return;
    const rows = hourlyData.map((r) => ({
      Saat: r.ts,
      "Üretim (kWh)": Number(r.energy_kwh) || 0,
      "Ort. Güç (W)": Math.round(Number(r.avg_power_w) || 0),
      "Ölçüm Sayısı": Number(r.sample_count) || 0,
    }));
    downloadXlsx({
      rows,
      fileName: `ges_saatlik_${selectedDay}.xlsx`,
      sheetName: "Saatlik Üretim",
    });
  };

  /* ─── Gün navigasyonu ─────────────────────────── */
  const handlePrev = () => onDayChange(dayjsTR(selectedDay).subtract(1, "day").format("YYYY-MM-DD"));
  const handleNext = () => {
    if (isToday) return;
    onDayChange(dayjsTR(selectedDay).add(1, "day").format("YYYY-MM-DD"));
  };

  /* ─── Render ──────────────────────────────────── */
  return (
    <div>
      {/* Üst bar: gün navigator + aksiyonlar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            ◀
          </button>

          <span className="text-sm font-semibold text-neutral-900 min-w-[200px] text-center">
            {formatDayLabel(selectedDay)}
          </span>

          <button
            type="button"
            onClick={handleNext}
            disabled={isToday}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ▶
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={!hourlyData.length}
            className="h-8 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            XLSX İndir
          </button>

          <button
            type="button"
            onClick={onBackToDaily}
            className="h-8 rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            ← Günlüğe Dön
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500 py-12 text-center">Yükleniyor…</p>
      ) : hourlyData.length > 0 ? (
        <>
          {/* Mini bar chart */}
          <div className="mb-5">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number | undefined) => [
                    `${(value ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kWh`,
                    "Üretim",
                  ]}
                />
                <Bar dataKey="kwh" fill="#22c55e" radius={[3, 3, 0, 0]} name="Üretim (kWh)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Saatlik tablo */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500">Saat</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-neutral-500">Üretim (kWh)</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-neutral-500">Ort. Güç (W)</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-neutral-500">Ölçüm Sayısı</th>
                </tr>
              </thead>
              <tbody>
                {hourlyData.map((row) => (
                  <tr
                    key={row.ts}
                    className={`border-b border-neutral-100 ${rowBg(Number(row.energy_kwh))}`}
                  >
                    <td className="py-2 px-3 font-medium">{row.ts}</td>
                    <td className="py-2 px-3 text-right font-medium text-neutral-900">
                      {fmtKwh(row.energy_kwh)}
                    </td>
                    <td className="py-2 px-3 text-right text-neutral-700">
                      {fmtW(row.avg_power_w)}
                    </td>
                    <td className="py-2 px-3 text-right text-neutral-600">
                      {row.sample_count}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-200">
                  <td className="py-2 px-3 font-semibold text-neutral-700">Toplam</td>
                  <td className="py-2 px-3 text-right font-semibold text-emerald-700">
                    {fmtKwh(totalKwh)}
                  </td>
                  <td className="py-2 px-3 text-right text-neutral-400">—</td>
                  <td className="py-2 px-3 text-right text-neutral-600 font-medium">
                    {totalSamples}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <p className="text-sm text-neutral-400 text-center py-12">
          Seçili gün için saatlik üretim verisi bulunamadı.
        </p>
      )}
    </div>
  );
}
