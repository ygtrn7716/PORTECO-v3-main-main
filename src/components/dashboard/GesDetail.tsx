// src/components/dashboard/GesDetail.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { downloadXlsx } from "@/components/utils/xlsx";
import EnergySoldCard from "@/components/dashboard/EnergySoldCard";
import { HelpCircle } from "lucide-react";
import GesHourlyView from "@/components/dashboard/GesHourlyView";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

type GesPlant = {
  id: string;
  plant_name: string | null;
  nickname: string | null;
  peak_power_kw: number | null;
  linked_serno: number | null;
};

type Snapshot = {
  current_power_w: number;
  today_energy_kwh: number;
  total_energy_kwh: number;
  peak_power_kw: number;
  efficiency_pct: number;
  status: string;
};

type DailyRow = {
  date: string;
  energy_kwh: number;
};

type MonthlyBar = {
  label: string;
  month: number;
  kwh: number;
};

type ViewMode = "daily" | "hourly";

const LS_GES_PLANT_KEY = "eco_selected_ges_plant";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const MONTH_SHORT = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

const fmtKwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export default function GesDetail() {
  const { session, loading: sessionLoading } = useSession();
  const uid = session?.user?.id ?? null;

  // Plants
  const [plants, setPlants] = useState<GesPlant[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(LS_GES_PLANT_KEY);
  });

  // Snapshot (anlık veriler)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  // Bu ay toplam üretim
  const [monthTotal, setMonthTotal] = useState<number | null>(null);

  // Geçen ay toplam üretim
  const [prevMonthTotal, setPrevMonthTotal] = useState<number | null>(null);

  // Aylık grafik
  const [chartYear, setChartYear] = useState(dayjsTR().year());
  const [monthlyData, setMonthlyData] = useState<MonthlyBar[]>([]);

  // Günlük tablo
  const [tableYear, setTableYear] = useState(dayjsTR().year());
  const [tableMonth, setTableMonth] = useState(dayjsTR().month() + 1);
  const [dailyData, setDailyData] = useState<DailyRow[]>([]);

  // Grafik sekmesi
  const [chartTab, setChartTab] = useState<'production' | 'sold'>('production');

  // Günlük grafik (tablo state'inden bağımsız)
  const [dailyChartYear, setDailyChartYear] = useState(dayjsTR().year());
  const [dailyChartMonth, setDailyChartMonth] = useState(dayjsTR().month() + 1);
  const [dailyChartData, setDailyChartData] = useState<DailyRow[]>([]);

  // Satış hakkı
  const [maxSatisKwh, setMaxSatisKwh] = useState<number | null>(null);
  const [yearlyTotal, setYearlyTotal] = useState<number | null>(null);
  const [satisTooltipOpen, setSatisTooltipOpen] = useState(false);

  // Görünüm modu (günlük / saatlik)
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [selectedDay, setSelectedDay] = useState<string>(dayjsTR().format("YYYY-MM-DD"));

  // Loading / Error
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Aktif plant id'leri (seçili veya tümü)
  const activePlantIds = selectedPlantId === null || selectedPlantId === "all"
    ? plants.map((p) => p.id)
    : [selectedPlantId];

  // 1) GES plant'leri yükle
  useEffect(() => {
    if (sessionLoading || !uid) return;
    let cancel = false;

    (async () => {
      const { data, error } = await supabase
        .from("ges_plants")
        .select("id, plant_name, nickname, peak_power_kw, linked_serno")
        .eq("user_id", uid)
        .eq("is_active", true)
        .order("plant_name");

      if (cancel) return;
      if (error) {
        setErr(error.message);
        return;
      }

      setPlants(data ?? []);

      // Seçili plant'i doğrula
      const ids = (data ?? []).map((p: GesPlant) => p.id);
      if (selectedPlantId && selectedPlantId !== "all" && !ids.includes(selectedPlantId)) {
        setSelectedPlantId("all");
        localStorage.removeItem(LS_GES_PLANT_KEY);
      }
    })();

    return () => { cancel = true; };
  }, [uid, sessionLoading]);

  // 2) Snapshot verileri
  useEffect(() => {
    if (!plants.length || !activePlantIds.length) {
      setSnapshot(null);
      return;
    }
    let cancel = false;

    (async () => {
      const { data, error } = await supabase
        .from("ges_snapshot")
        .select("current_power_w, today_energy_kwh, total_energy_kwh, peak_power_kw, efficiency_pct, status")
        .in("ges_plant_id", activePlantIds);

      if (cancel) return;
      if (error) return;

      if (!data || data.length === 0) {
        setSnapshot(null);
        return;
      }

      // Tüm plant'lerin toplamı
      const agg: Snapshot = {
        current_power_w: data.reduce((s, r) => s + (Number(r.current_power_w) || 0), 0),
        today_energy_kwh: data.reduce((s, r) => s + (Number(r.today_energy_kwh) || 0), 0),
        total_energy_kwh: data.reduce((s, r) => s + (Number(r.total_energy_kwh) || 0), 0),
        peak_power_kw: data.reduce((s, r) => s + (Number(r.peak_power_kw) || 0), 0),
        efficiency_pct: data.length > 0
          ? data.reduce((s, r) => s + (Number(r.efficiency_pct) || 0), 0) / data.length
          : 0,
        status: data.every((r) => r.status === "normal") ? "normal" : data.some((r) => r.status === "fault") ? "fault" : "offline",
      };
      setSnapshot(agg);
    })();

    return () => { cancel = true; };
  }, [plants, selectedPlantId]);

  // 3) Bu ay toplam üretim
  useEffect(() => {
    if (!plants.length || !activePlantIds.length) {
      setMonthTotal(null);
      return;
    }
    let cancel = false;

    (async () => {
      const startOfMonth = dayjsTR().startOf("month").format("YYYY-MM-DD");
      const endOfMonth = dayjsTR().endOf("month").format("YYYY-MM-DD");

      const { data, error } = await supabase
        .from("ges_production_daily")
        .select("energy_kwh")
        .in("ges_plant_id", activePlantIds)
        .gte("date", startOfMonth)
        .lte("date", endOfMonth);

      if (cancel) return;
      if (error) return;

      const total = (data || []).reduce((s, r) => s + (Number(r.energy_kwh) || 0), 0);
      setMonthTotal(total);
    })();

    return () => { cancel = true; };
  }, [plants, selectedPlantId]);

  // 3b) Geçen ay toplam üretim
  useEffect(() => {
    if (!plants.length || !activePlantIds.length) {
      setPrevMonthTotal(null);
      return;
    }
    let cancel = false;

    (async () => {
      const prevMonth = dayjsTR().subtract(1, "month");
      const startOfPrevMonth = prevMonth.startOf("month").format("YYYY-MM-DD");
      const endOfPrevMonth = prevMonth.endOf("month").format("YYYY-MM-DD");

      const { data, error } = await supabase
        .from("ges_production_daily")
        .select("energy_kwh")
        .in("ges_plant_id", activePlantIds)
        .gte("date", startOfPrevMonth)
        .lte("date", endOfPrevMonth);

      if (cancel) return;
      if (error) return;

      const total = (data || []).reduce((s, r) => s + (Number(r.energy_kwh) || 0), 0);
      setPrevMonthTotal(total);
    })();

    return () => { cancel = true; };
  }, [plants, selectedPlantId]);

  // 4) Aylık grafik verisi
  useEffect(() => {
    if (!plants.length || !activePlantIds.length) {
      setMonthlyData([]);
      return;
    }
    let cancel = false;

    (async () => {
      const startDate = `${chartYear}-01-01`;
      const endDate = `${chartYear}-12-31`;

      const { data, error } = await supabase
        .from("ges_production_daily")
        .select("date, energy_kwh")
        .in("ges_plant_id", activePlantIds)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date");

      if (cancel) return;
      if (error) return;

      // Ay bazında grupla
      const byMonth: Record<number, number> = {};
      for (const row of data ?? []) {
        const m = new Date(row.date).getMonth(); // 0-11
        byMonth[m] = (byMonth[m] || 0) + (Number(row.energy_kwh) || 0);
      }

      const bars: MonthlyBar[] = [];
      for (let i = 0; i < 12; i++) {
        bars.push({
          label: MONTH_SHORT[i],
          month: i + 1,
          kwh: Math.round((byMonth[i] || 0) * 10) / 10,
        });
      }
      setMonthlyData(bars);
    })();

    return () => { cancel = true; };
  }, [plants, selectedPlantId, chartYear]);

  // 5) Günlük tablo verisi
  useEffect(() => {
    if (!plants.length || !activePlantIds.length) {
      setDailyData([]);
      return;
    }
    let cancel = false;

    (async () => {
      setLoading(true);
      const daysInMonth = dayjsTR().year(tableYear).month(tableMonth - 1).daysInMonth();
      const startDate = `${tableYear}-${String(tableMonth).padStart(2, "0")}-01`;
      const endDate = `${tableYear}-${String(tableMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("ges_production_daily")
        .select("date, energy_kwh")
        .in("ges_plant_id", activePlantIds)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date");

      if (cancel) return;

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      // Aynı tarihleri topla (birden fazla plant seçili olabilir)
      const byDate: Record<string, number> = {};
      for (const row of data ?? []) {
        byDate[row.date] = (byDate[row.date] || 0) + (Number(row.energy_kwh) || 0);
      }

      const rows: DailyRow[] = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, kwh]) => ({ date, energy_kwh: kwh }));

      setDailyData(rows);
      setLoading(false);
    })();

    return () => { cancel = true; };
  }, [plants, selectedPlantId, tableYear, tableMonth]);

  // 5b) Günlük grafik verisi (grafik sekmesi için — tablodan bağımsız)
  useEffect(() => {
    if (!plants.length || !activePlantIds.length) {
      setDailyChartData([]);
      return;
    }
    let cancel = false;

    (async () => {
      const daysInMonth = dayjsTR()
        .year(dailyChartYear)
        .month(dailyChartMonth - 1)
        .daysInMonth();
      const startDate = `${dailyChartYear}-${String(dailyChartMonth).padStart(2, "0")}-01`;
      const endDate = `${dailyChartYear}-${String(dailyChartMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("ges_production_daily")
        .select("date, energy_kwh")
        .in("ges_plant_id", activePlantIds)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date");

      if (cancel) return;
      if (error) return;

      const byDate: Record<string, number> = {};
      for (const row of data ?? []) {
        byDate[row.date] = (byDate[row.date] || 0) + (Number(row.energy_kwh) || 0);
      }

      const rows: DailyRow[] = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, kwh]) => ({ date, energy_kwh: kwh }));

      setDailyChartData(rows);
    })();

    return () => { cancel = true; };
  }, [plants, selectedPlantId, dailyChartYear, dailyChartMonth]);

  // 6) Satış hakkı limiti
  useEffect(() => {
    if (!uid || !plants.length || !activePlantIds.length) {
      setMaxSatisKwh(null);
      return;
    }
    const linkedSernos = plants
      .filter((p) => activePlantIds.includes(p.id) && p.linked_serno != null)
      .map((p) => p.linked_serno!);

    if (!linkedSernos.length) {
      setMaxSatisKwh(null);
      return;
    }
    let cancel = false;

    (async () => {
      const { data, error } = await supabase
        .from("ges_satis_hakki")
        .select("max_satis_kwh")
        .eq("user_id", uid)
        .in("subscription_serno", linkedSernos);

      if (cancel) return;
      if (error || !data?.length) {
        setMaxSatisKwh(null);
        return;
      }

      const total = data.reduce((s, r) => s + (Number(r.max_satis_kwh) || 0), 0);
      setMaxSatisKwh(total > 0 ? total : null);
    })();

    return () => { cancel = true; };
  }, [plants, selectedPlantId, uid]);

  // 7) Yıllık toplam üretim (year-to-date)
  useEffect(() => {
    if (!plants.length || !activePlantIds.length) {
      setYearlyTotal(null);
      return;
    }
    let cancel = false;

    (async () => {
      const startDate = `${dayjsTR().year()}-01-01`;
      const endDate = dayjsTR().format("YYYY-MM-DD");

      const { data, error } = await supabase
        .from("ges_production_daily")
        .select("energy_kwh")
        .in("ges_plant_id", activePlantIds)
        .gte("date", startDate)
        .lte("date", endDate);

      if (cancel) return;
      if (error) return;

      const total = (data || []).reduce((s, r) => s + (Number(r.energy_kwh) || 0), 0);
      setYearlyTotal(total);
    })();

    return () => { cancel = true; };
  }, [plants, selectedPlantId]);

  // XLSX export
  const handleExport = () => {
    if (!dailyData.length) return;
    const rows = dailyData.map((r) => ({
      Tarih: dayjsTR(r.date).format("DD.MM.YYYY"),
      "Üretim (kWh)": Number(r.energy_kwh) || 0,
    }));
    const monthLabel = MONTH_NAMES[tableMonth - 1];
    downloadXlsx({
      rows,
      fileName: `ges_uretim_${tableYear}_${monthLabel}.xlsx`,
      sheetName: "GES Üretim",
    });
  };

  // Plant seçici değişikliği
  const handlePlantChange = (val: string) => {
    setSelectedPlantId(val === "all" ? "all" : val);
    setViewMode("daily");
    if (val === "all") {
      localStorage.removeItem(LS_GES_PLANT_KEY);
    } else {
      localStorage.setItem(LS_GES_PLANT_KEY, val);
    }
  };

  const plantLabel = (p: GesPlant) => {
    const name = (p.nickname ?? p.plant_name ?? "").trim();
    return name || `Tesis ${p.id.slice(0, 8)}`;
  };

  const currentYear = dayjsTR().year();

  // Günlük grafik barları
  const dailyChartBars = dailyChartData.map((r) => ({
    day: new Date(r.date).getDate(),
    kwh: Math.round(r.energy_kwh * 10) / 10,
  }));

  const navigate = useNavigate();

  // ─── RENDER ───────────────────────────────────────────
  return (
    <DashboardShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            GES Üretim Detayları
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Güneş enerji santrallerinizin üretim verileri
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end md:w-auto">
          <div className="flex items-center gap-2 min-w-0">
            {plants.length > 0 && (
              <>
                <span className="text-xs text-neutral-600">Tesis:</span>
                <select
                  value={selectedPlantId === "all" || !selectedPlantId ? "all" : selectedPlantId}
                  onChange={(e) => handlePlantChange(e.target.value)}
                  className="h-10 md:h-9 w-full sm:w-[280px] md:w-auto min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 md:px-2 text-[16px] md:text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#0A66FF]"
                >
                  <option value="all">Tüm GES Tesisleri</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>{plantLabel(p)}</option>
                  ))}
                </select>
              </>
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
      {/* Hata */}
      {err && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Boş durum */}
      {!sessionLoading && plants.length === 0 && !err && (
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-8 text-center">
          <p className="text-neutral-500 text-sm">
            Henüz bir GES tesisi bulunamadı. Profil sayfanızdan GES hesabınızı ekleyebilirsiniz.
          </p>
        </div>
      )}

      {plants.length > 0 && (
        <>
          {/* A) Özet Kartları */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            <SummaryCard
              title="Bu Ay Toplam Üretim"
              value={fmtKwh(monthTotal)}
              unit="kWh"
            />
            <SummaryCard
              title="Geçen Ay Üretim"
              value={fmtKwh(prevMonthTotal)}
              unit="kWh"
            />
            <SummaryCard
              title="Bugünkü Üretim"
              value={fmtKwh(snapshot?.today_energy_kwh ?? null)}
              unit="kWh"
            />
            <SummaryCard
              title="Anlık Güç"
              value={fmtKwh(snapshot ? snapshot.current_power_w / 1000 : null)}
              unit="kW"
            />
            <SummaryCard
              title="Toplam Ömür Boyu Üretim"
              value={fmtKwh(snapshot?.total_energy_kwh ?? null)}
              unit="kWh"
            />
          </div>

          {/* B) Üretim Grafiği / Satılan Üretim — sekmeli */}
          <div className="mb-8">
            {/* Tab Toggle */}
            <div className="mb-4">
              <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setChartTab('production')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    chartTab === 'production'
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  Üretim Grafiği
                </button>
                <button
                  type="button"
                  onClick={() => setChartTab('sold')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    chartTab === 'sold'
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  Satılan Üretim
                </button>
              </div>
            </div>

            {/* Üretim Grafiği Tab İçeriği */}
            {chartTab === 'production' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {/* SOL: Aylık Üretim Grafiği */}
                <section className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-neutral-900">Aylık Üretim Grafiği</h2>
                    <select
                      value={chartYear}
                      onChange={(e) => setChartYear(Number(e.target.value))}
                      className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-800"
                    >
                      <option value={currentYear}>{currentYear}</option>
                      <option value={currentYear - 1}>{currentYear - 1}</option>
                    </select>
                  </div>

                  {monthlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value: number | undefined) => [
                            `${(value ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kWh`,
                            "Üretim",
                          ]}
                        />
                        <Bar dataKey="kwh" fill="#22c55e" radius={[4, 4, 0, 0]} name="Üretim (kWh)" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-neutral-400 text-center py-12">
                      {chartYear} yılı için üretim verisi bulunamadı.
                    </p>
                  )}
                </section>

                {/* SAĞ: Günlük Üretim Grafiği */}
                <section className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-neutral-900">Günlük Üretim Grafiği</h2>
                    <div className="flex items-center gap-2">
                      <select
                        value={dailyChartMonth}
                        onChange={(e) => setDailyChartMonth(Number(e.target.value))}
                        className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-800"
                      >
                        {MONTH_NAMES.map((name, i) => (
                          <option key={i} value={i + 1}>{name}</option>
                        ))}
                      </select>
                      <select
                        value={dailyChartYear}
                        onChange={(e) => setDailyChartYear(Number(e.target.value))}
                        className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-800"
                      >
                        <option value={currentYear}>{currentYear}</option>
                        <option value={currentYear - 1}>{currentYear - 1}</option>
                      </select>
                    </div>
                  </div>

                  {!plants.length || !activePlantIds.length ? (
                    <p className="text-sm text-neutral-400 text-center py-12">
                      Lütfen bir tesis seçin
                    </p>
                  ) : dailyChartBars.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dailyChartBars}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value: number | undefined) => [
                            `${(value ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kWh`,
                            "Üretim",
                          ]}
                        />
                        <Bar dataKey="kwh" fill="#22c55e" radius={[4, 4, 0, 0]} name="Üretim (kWh)" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-neutral-400 text-center py-12">
                      {MONTH_NAMES[dailyChartMonth - 1]} {dailyChartYear} için üretim verisi bulunamadı.
                    </p>
                  )}
                </section>
              </div>
            )}

            {/* Satılan Üretim Tab İçeriği */}
            {chartTab === 'sold' && (
              <>
                {/* Yıllık Satış Hakkı Banner */}
                {maxSatisKwh != null && yearlyTotal != null && (() => {
                  const pct = maxSatisKwh > 0 ? (yearlyTotal / maxSatisKwh) * 100 : 0;
                  const barColor = pct <= 70 ? "bg-emerald-500" : pct <= 90 ? "bg-amber-500" : "bg-red-500";
                  return (
                    <section className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm p-5 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5">
                          <span>⚡</span> Yıllık Satış Hakkı Kullanımı
                        </h3>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setSatisTooltipOpen((v) => !v)}
                            className="text-neutral-400 hover:text-neutral-600 transition-colors"
                          >
                            <HelpCircle size={16} />
                          </button>
                          {satisTooltipOpen && (
                            <div className="absolute right-0 top-8 z-10 w-72 rounded-xl border border-neutral-200 bg-white shadow-lg p-4 text-xs text-neutral-600 leading-relaxed">
                              Yıllık GES satış hakkı, ilgili mevzuat kapsamında belirlenen
                              maksimum şebekeye veriş miktarıdır. Limit aşımında ek
                              yaptırımlar uygulanabilir. Limitinizi güncellemek için
                              yöneticinizle iletişime geçin.
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-neutral-600 mb-3">
                        Kullanılan:{" "}
                        <span className="font-semibold text-neutral-900">
                          {fmtKwh(yearlyTotal)} kWh
                        </span>
                        {"  /  "}
                        Limit:{" "}
                        <span className="font-semibold text-neutral-900">
                          {fmtKwh(maxSatisKwh)} kWh
                        </span>
                      </p>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2.5 rounded-full bg-neutral-100">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-neutral-700 w-14 text-right">
                          %{pct.toFixed(1)}
                        </span>
                      </div>
                    </section>
                  );
                })()}

                <section className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm p-6">
                  <EnergySoldCard />
                </section>
              </>
            )}
          </div>

          {/* C) Üretim Verileri — Günlük / Saatlik Toggle */}
          <section className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm p-6 mb-8">
            {/* Başlık + Toggle + Kontroller */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-neutral-900">Üretim Verileri</h2>

                {/* Segmented toggle */}
                <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setViewMode("daily")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === "daily"
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    Günlük
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("hourly")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === "hourly"
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    Saatlik
                  </button>
                </div>
              </div>

              {/* Günlük mod kontrolleri */}
              {viewMode === "daily" && (
                <div className="flex items-center gap-2">
                  <select
                    value={tableMonth}
                    onChange={(e) => setTableMonth(Number(e.target.value))}
                    className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-800"
                  >
                    {MONTH_NAMES.map((name, i) => (
                      <option key={i} value={i + 1}>{name}</option>
                    ))}
                  </select>

                  <select
                    value={tableYear}
                    onChange={(e) => setTableYear(Number(e.target.value))}
                    className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs text-neutral-800"
                  >
                    <option value={currentYear}>{currentYear}</option>
                    <option value={currentYear - 1}>{currentYear - 1}</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={!dailyData.length}
                    className="h-8 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    XLSX İndir
                  </button>
                </div>
              )}
            </div>

            {/* Günlük görünüm */}
            {viewMode === "daily" && (
              <>
                {loading ? (
                  <p className="text-sm text-neutral-500 py-6 text-center">Yükleniyor…</p>
                ) : dailyData.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200">
                          <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500">Tarih</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-neutral-500">Üretim (kWh)</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {dailyData.map((row) => (
                          <tr
                            key={row.date}
                            className="border-b border-neutral-100 hover:bg-neutral-50/60 cursor-pointer group"
                            onClick={() => {
                              setSelectedDay(row.date);
                              setViewMode("hourly");
                            }}
                          >
                            <td className="py-2 px-3 text-neutral-700">
                              {dayjsTR(row.date).format("DD.MM.YYYY")}
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-neutral-900">
                              {fmtKwh(row.energy_kwh)}
                            </td>
                            <td className="py-2 px-1 text-neutral-400 group-hover:text-neutral-600 text-xs">
                              ›
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-neutral-200">
                          <td className="py-2 px-3 font-semibold text-neutral-700">Toplam</td>
                          <td className="py-2 px-3 text-right font-semibold text-emerald-700">
                            {fmtKwh(dailyData.reduce((s, r) => s + (Number(r.energy_kwh) || 0), 0))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400 text-center py-6">
                    Seçili dönem için üretim verisi bulunamadı.
                  </p>
                )}
              </>
            )}

            {/* Saatlik görünüm */}
            {viewMode === "hourly" && (
              <GesHourlyView
                activePlantIds={activePlantIds}
                selectedDay={selectedDay}
                onDayChange={setSelectedDay}
                onBackToDaily={() => setViewMode("daily")}
              />
            )}
          </section>
        </>
      )}
    </DashboardShell>
  );
}

// ─── Özet Kart Bileşeni ──────────────────────────────
function SummaryCard({ title, value, unit }: { title: string; value: string; unit: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm">
      <p className="text-xs text-neutral-500 mb-1">{title}</p>
      <p className="text-2xl font-semibold text-neutral-900">
        {value} <span className="text-sm font-normal text-neutral-500">{unit}</span>
      </p>
    </div>
  );
}
