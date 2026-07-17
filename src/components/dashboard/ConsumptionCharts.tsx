// src/components/dashboard/ConsumptionCharts.tsx
//
// /dashboard/consumption sayfası için tüketim karşılaştırma grafikleri kartı.
// Tek kart içinde segment switcher (Aylık / Günlük / Saatlik), 3'lü KPI şeridi,
// renk-kareli legend ve Recharts grafiği. Karşılaştırma ekseni hep "dönem"
// (geçen yıl / geçen ay / hafta sonu) — tesis değil.
//
// Çoklu tesis: tek tesis → o tesis; "Tümü" → görünür tüm tesislerin TOPLAMI
// (her ay/gün/saat bucket'ında tesisler toplanır).
import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { dayjsTR } from "@/lib/dayjs";
import { supabase } from "@/lib/supabase";
import { fetchAllConsumption } from "@/lib/paginatedFetch";
import SegmentedTabs from "@/components/dashboard/shared/SegmentedTabs";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ── Marka kiti (her iki modda okunur biçimde hardcode) ──
const BRAND = "#00AEEF"; // birincil seri (çekiş)
const COMPARE = "#B7C4CE"; // karşılaştırma serisi (soluk nötr)
const GRID = "#E5E7EB";
// Veriş serisi: marka mavisinden ayırt edilsin diye yeşil — ChartsPage.tsx'teki
// GES_GREEN/GES_GREEN_PREV ile aynı ton (grid'e satış = üretim rengiyle tutarlı).
const VERIS = "#22c55e";
const VERIS_COMPARE = "#86efac";

const monthNamesShort = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

const fmtKwh0 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const tipKwh = (v: any) =>
  v == null || !Number.isFinite(Number(v))
    ? "—"
    : `${Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} kWh`;

type Segment = "monthly" | "daily" | "hourly";
type Metric = "cn" | "gn"; // cn = Çekiş, gn = Veriş

type MonthlyResult = {
  points: { m: string; curr: number | null; prev: number | null }[];
  hasPrev: boolean;
};
type DailyResult = {
  points: { d: number; curr: number | null; prev: number | null }[];
};
type HourlyResult = {
  points: { h: string; weekday: number | null; weekend: number | null; all: number | null }[];
  dailyAvg: number;
};

type AnyResult = MonthlyResult | DailyResult | HourlyResult;

type Props = {
  uid: string | null;
  selectedSub: "ALL" | number;
  visibleSernos: number[];
  selectionLabel: string;
};

export default function ConsumptionCharts({
  uid,
  selectedSub,
  visibleSernos,
  selectionLabel,
}: Props) {
  const [segment, setSegment] = useState<Segment>("monthly");
  const [metric, setMetric] = useState<Metric>("cn");

  // Seçili tesis(ler)de hiç veriş (gn) verisi var mı — belirlenene kadar null
  // (tab flaşlamasın diye "veriş yok" ile "henüz kontrol edilmedi" ayrılır).
  const [hasVeris, setHasVeris] = useState<boolean | null>(null);

  const sernos = useMemo(
    () => (selectedSub === "ALL" ? visibleSernos : [selectedSub]),
    [selectedSub, visibleSernos]
  );

  // Seçim değişince cache geçersiz olsun diye anahtar (içerik bazlı).
  const selKey = useMemo(
    () =>
      selectedSub === "ALL"
        ? `ALL:${[...visibleSernos].sort((a, b) => a - b).join(",")}`
        : `S:${selectedSub}`,
    [selectedSub, visibleSernos]
  );

  // Veriş tab'ı yalnızca seçili tesis(ler)de gerçekten gn verisi varsa gösterilir.
  useEffect(() => {
    if (!uid || sernos.length === 0) {
      setHasVeris(false);
      return;
    }

    let cancel = false;
    setHasVeris(null);

    (async () => {
      const { data, error } = await supabase
        .from("consumption_hourly")
        .select("subscription_serno")
        .eq("user_id", uid)
        .in("subscription_serno", sernos)
        .gt("gn", 0)
        .limit(1);

      if (cancel) return;
      if (error) {
        console.warn("ConsumptionCharts hasVeris check error:", error);
        setHasVeris(false);
        return;
      }
      setHasVeris((data?.length ?? 0) > 0);
    })();

    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, selKey]);

  // Seçili tesiste veriş verisi kalmadıysa (ör. tesis değişti) "gn" sekiminde takılı kalma.
  useEffect(() => {
    if (hasVeris === false && metric === "gn") setMetric("cn");
  }, [hasVeris, metric]);

  // (metric:segment|selKey) bazında sonuç cache'i — segment/seçim/tab geçişlerinde tekrar çekim olmaz.
  const cacheRef = useRef<Map<string, AnyResult>>(new Map());

  const [monthlyData, setMonthlyData] = useState<MonthlyResult | null>(null);
  const [dailyData, setDailyData] = useState<DailyResult | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyResult | null>(null);
  const [loading, setLoading] = useState(false);

  function applyResult(seg: Segment, res: AnyResult) {
    if (seg === "monthly") setMonthlyData(res as MonthlyResult);
    else if (seg === "daily") setDailyData(res as DailyResult);
    else setHourlyData(res as HourlyResult);
  }

  // Aktif segmentin verisini ihtiyaç anında çek (cache'li).
  useEffect(() => {
    if (!uid || sernos.length === 0) {
      // veri kaynağı yok → boş sonuç göster
      applyResult(segment, emptyFor(segment));
      setLoading(false);
      return;
    }

    const cacheKey = `${metric}:${segment}|${selKey}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      applyResult(segment, cached);
      setLoading(false);
      return;
    }

    let cancel = false;
    setLoading(true);
    // Çekim başlarken eski segment verisini gizle (stale gösterme)
    applyResultNull(segment);

    (async () => {
      try {
        const res = await loadSegment(segment, metric, { uid, sernos });
        if (cancel) return;
        cacheRef.current.set(cacheKey, res);
        applyResult(segment, res);
      } catch (e) {
        console.error("ConsumptionCharts load error:", e);
        if (!cancel) applyResult(segment, emptyFor(segment));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, metric, selKey, uid]);

  function applyResultNull(seg: Segment) {
    if (seg === "monthly") setMonthlyData(null);
    else if (seg === "daily") setDailyData(null);
    else setHourlyData(null);
  }

  // ── KPI + legend + boş-durum (aktif segment + metrik göre) ──
  const view = useMemo(() => {
    const isVeris = metric === "gn";
    const primaryColor = isVeris ? VERIS : BRAND;
    const compareColor = isVeris ? VERIS_COMPARE : COMPARE;

    if (segment === "monthly") {
      const d = monthlyData;
      const points = d?.points ?? [];
      const currVals = points.map((p) => p.curr).filter((v): v is number => v != null);
      const total = currVals.reduce((s, v) => s + v, 0);
      const avg = currVals.length ? total / currVals.length : 0;
      let peakVal = 0;
      let peakLabel = "—";
      for (const p of points) {
        if (p.curr != null && p.curr > peakVal) {
          peakVal = p.curr;
          peakLabel = p.m;
        }
      }
      return {
        empty: !d || currVals.length === 0,
        primaryColor,
        compareColor,
        kpis: [
          { label: isVeris ? "Yıllık Toplam Veriş" : "Yıllık Toplam", value: `${fmtKwh0(total)} kWh` },
          { label: isVeris ? "Aylık Ortalama Veriş" : "Aylık Ortalama", value: `${fmtKwh0(avg)} kWh` },
          { label: isVeris ? "En Yüksek Ay (Veriş)" : "En Yüksek Ay", value: `${fmtKwh0(peakVal)} kWh`, sub: peakLabel },
        ],
        legend: d?.hasPrev
          ? [
              { color: primaryColor, label: `${dayjsTR().year()}` },
              { color: compareColor, label: `${dayjsTR().year() - 1}` },
            ]
          : [{ color: primaryColor, label: `${dayjsTR().year()}` }],
      };
    }

    if (segment === "daily") {
      const d = dailyData;
      const points = d?.points ?? [];
      const currVals = points.map((p) => p.curr).filter((v): v is number => v != null);
      const total = currVals.reduce((s, v) => s + v, 0);
      const avg = currVals.length ? total / currVals.length : 0;
      let peakVal = 0;
      let peakDay = 0;
      for (const p of points) {
        if (p.curr != null && p.curr > peakVal) {
          peakVal = p.curr;
          peakDay = p.d;
        }
      }
      const hasAny = points.some((p) => p.curr != null || p.prev != null);
      return {
        empty: !d || !hasAny,
        primaryColor,
        compareColor,
        kpis: [
          { label: isVeris ? "Bu Ay Toplam Veriş" : "Bu Ay Toplam", value: `${fmtKwh0(total)} kWh` },
          { label: isVeris ? "Günlük Ortalama Veriş" : "Günlük Ortalama", value: `${fmtKwh0(avg)} kWh` },
          { label: isVeris ? "En Yüksek Gün (Veriş)" : "En Yüksek Gün", value: `${fmtKwh0(peakVal)} kWh`, sub: peakDay ? `${peakDay}.` : "—" },
        ],
        legend: [
          { color: primaryColor, label: "Bu ay" },
          { color: compareColor, label: "Geçen ay" },
        ],
      };
    }

    // hourly
    const d = hourlyData;
    const points = d?.points ?? [];
    let peakVal = 0;
    let peakHour = "—";
    for (const p of points) {
      if (p.all != null && p.all > peakVal) {
        peakVal = p.all;
        peakHour = p.h;
      }
    }
    const hasAny = points.some((p) => p.weekday != null || p.weekend != null);
    return {
      empty: !d || !hasAny,
      primaryColor,
      compareColor,
      kpis: [
        { label: isVeris ? "Günlük Ortalama Veriş" : "Günlük Ortalama", value: `${fmtKwh0(d?.dailyAvg ?? 0)} kWh` },
        { label: isVeris ? "Pik Saat (Veriş)" : "Pik Saat", value: peakHour },
        { label: isVeris ? "Pik Veriş" : "Pik Tüketim", value: `${fmtKwh0(peakVal)} kWh` },
      ],
      legend: [
        { color: primaryColor, label: "Hafta içi" },
        { color: compareColor, label: "Hafta sonu" },
      ],
    };
  }, [segment, metric, monthlyData, dailyData, hourlyData]);

  const segments: { key: Segment; label: string }[] = [
    { key: "monthly", label: "Aylık" },
    { key: "daily", label: "Günlük" },
    { key: "hourly", label: "Saatlik" },
  ];

  return (
    <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      {/* Başlık + segment switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900">Tüketim Grafikleri</div>
          <div className="mt-0.5 truncate text-xs text-neutral-500">{selectionLabel}</div>
        </div>

        <div className="inline-flex shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 p-0.5">
          {segments.map((seg) => {
            const active = segment === seg.key;
            return (
              <button
                key={seg.key}
                type="button"
                onClick={() => setSegment(seg.key)}
                aria-pressed={active}
                className={
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition " +
                  (active
                    ? "bg-[#00AEEF] text-white shadow-sm"
                    : "bg-transparent text-neutral-500 hover:text-neutral-700")
                }
              >
                {seg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Çekiş / Veriş tab'ı — yalnızca seçili tesiste gerçekten veriş verisi varsa */}
      {hasVeris && (
        <div className="mt-3">
          <SegmentedTabs
            tabs={[
              { key: "cn" as const, label: "Çekiş Değerleri" },
              { key: "gn" as const, label: "Veriş Değerleri" },
            ]}
            value={metric}
            onChange={setMetric}
          />
        </div>
      )}

      {/* KPI şeridi */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {view.kpis.map((k, i) => (
          <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5">
            <div className="text-[11px] text-neutral-500">{k.label}</div>
            <div className="mt-0.5 text-base font-semibold text-neutral-900 truncate">
              {view.empty ? "—" : k.value}
            </div>
            {"sub" in k && k.sub && !view.empty && (
              <div className="text-[11px] text-neutral-400">{k.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-neutral-600">
        {view.legend.map((l, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      {/* Grafik */}
      <div className="mt-3 h-[300px] w-full">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-neutral-500">Yükleniyor…</div>
        ) : view.empty ? (
          <div className="grid h-full place-items-center text-sm text-neutral-500">
            Bu dönem için veri bulunamadı
          </div>
        ) : segment === "monthly" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData?.points ?? []} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="m" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={56}
                tickFormatter={(v) => fmtKwh0(v)}
              />
              <Tooltip
                formatter={(v: any, n: any) => [tipKwh(v), n]}
                labelFormatter={(l) => `Ay: ${l}`}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="curr" name={`${dayjsTR().year()}`} fill={view.primaryColor} radius={[8, 8, 0, 0]} />
              {monthlyData?.hasPrev && (
                <Bar
                  dataKey="prev"
                  name={`${dayjsTR().year() - 1}`}
                  fill={view.compareColor}
                  radius={[8, 8, 0, 0]}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        ) : segment === "daily" ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailyData?.points ?? []} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="d" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={56}
                tickFormatter={(v) => fmtKwh0(v)}
              />
              <Tooltip
                formatter={(v: any, n: any) => [tipKwh(v), n]}
                labelFormatter={(l) => `Gün: ${l}`}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="curr"
                name="Bu ay"
                stroke={view.primaryColor}
                fill={view.primaryColor}
                fillOpacity={0.15}
                connectNulls={false}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="prev"
                name="Geçen ay"
                stroke={view.compareColor}
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourlyData?.points ?? []} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="h" tick={{ fontSize: 11 }} interval={1} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={56}
                tickFormatter={(v) => fmtKwh0(v)}
              />
              <Tooltip
                formatter={(v: any, n: any) => [tipKwh(v), n]}
                labelFormatter={(l) => `Saat: ${l}`}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="weekday"
                name="Hafta içi"
                stroke={view.primaryColor}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="weekend"
                name="Hafta sonu"
                stroke={view.compareColor}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Veri yükleyiciler
// ────────────────────────────────────────────────────────────

function emptyFor(seg: Segment): AnyResult {
  if (seg === "monthly") return { points: [], hasPrev: false };
  if (seg === "daily") return { points: [] };
  return { points: [], dailyAvg: 0 };
}

async function loadSegment(
  seg: Segment,
  metric: Metric,
  ctx: { uid: string; sernos: number[] }
): Promise<AnyResult> {
  if (seg === "monthly") return loadMonthly(metric, ctx);
  if (seg === "daily") return loadDaily(metric, ctx);
  return loadHourly(metric, ctx);
}

// AYLIK (Çekiş) — monthly_dashboard_series RPC (tesis bazlı), bu yıl + geçen yıl ay ay toplanır.
// Veriş (gn) için bu RPC alan döndürmüyor → loadMonthlyGnFromHourly'e delege edilir.
async function loadMonthly(
  metric: Metric,
  ctx: { uid: string; sernos: number[] }
): Promise<MonthlyResult> {
  if (metric === "gn") return loadMonthlyGnFromHourly(ctx);

  const { uid, sernos } = ctx;
  const year = dayjsTR().year();

  const curr = new Array(13).fill(null) as (number | null)[];
  const prev = new Array(13).fill(null) as (number | null)[];

  const tasks: PromiseLike<void>[] = [];
  for (const sn of sernos) {
    tasks.push(
      supabase
        .rpc("monthly_dashboard_series", {
          p_user_id: uid,
          p_subscription_serno: sn,
          p_year: year,
          p_tz: "Europe/Istanbul",
        })
        .then((res) => {
          if (res.error) throw res.error;
          for (const row of (res.data ?? []) as any[]) {
            const mo = Number(row.month);
            const v = row.consumption_kwh;
            if (mo >= 1 && mo <= 12 && v != null && Number.isFinite(Number(v))) {
              curr[mo] = (curr[mo] ?? 0) + Number(v);
            }
          }
        })
    );
    tasks.push(
      supabase
        .rpc("monthly_dashboard_series", {
          p_user_id: uid,
          p_subscription_serno: sn,
          p_year: year - 1,
          p_tz: "Europe/Istanbul",
        })
        .then((res) => {
          if (res.error) throw res.error;
          for (const row of (res.data ?? []) as any[]) {
            const mo = Number(row.month);
            const v = row.consumption_kwh;
            if (mo >= 1 && mo <= 12 && v != null && Number.isFinite(Number(v))) {
              prev[mo] = (prev[mo] ?? 0) + Number(v);
            }
          }
        })
    );
  }
  // Tek bir tesis/yıl RPC'si hata verse bile diğerlerini toplamaya devam et
  // (allSettled). Tümü başarısızsa curr/prev null kalır → boş durum gösterilir.
  const settled = await Promise.allSettled(tasks);
  for (const s of settled) {
    if (s.status === "rejected") console.warn("loadMonthly: tesis/yıl atlandı", s.reason);
  }

  const points = [];
  for (let mo = 1; mo <= 12; mo++) {
    points.push({ m: monthNamesShort[mo - 1], curr: curr[mo], prev: prev[mo] });
  }
  // Geçen yıl serisi yalnız anlamlı veri varsa gösterilir.
  const hasPrev = points.some((p) => p.prev != null && p.prev > 0);

  return { points, hasPrev };
}

// AYLIK (Veriş) — consumption_daily DB'de yok (şema doğrulandı: launch DB'de tablo
// mevcut değil, yalnız consumption_hourly var), monthly_dashboard_series RPC'si de
// yalnız cn/consumption_kwh döndürüyor. Bu yüzden consumption_hourly.gn paginated
// çekilip ay bazında toplanır (bkz. ChartsPage.tsx "Toplam Veriş" — aynı desen).
async function loadMonthlyGnFromHourly(ctx: {
  uid: string;
  sernos: number[];
}): Promise<MonthlyResult> {
  const { uid, sernos } = ctx;
  const year = dayjsTR().year();

  const curr = new Array(13).fill(null) as (number | null)[];
  const prev = new Array(13).fill(null) as (number | null)[];

  const base = dayjsTR();
  const startIso = base.year(year - 1).startOf("year").toDate().toISOString();
  const endIso = base.year(year + 1).startOf("year").toDate().toISOString();

  for (const sn of sernos) {
    try {
      const { data, error } = await fetchAllConsumption({
        supabase,
        userId: uid,
        subscriptionSerno: sn,
        columns: "ts, gn",
        startIso,
        endIso,
        endInclusive: false,
      });
      if (error) throw error;
      for (const r of (data ?? []) as any[]) {
        if (r.gn == null) continue; // gn'siz satır ayı "veri var" saymasın
        const d = dayjsTR(r.ts);
        const y = d.year();
        const mo = d.month() + 1; // 1-12
        const v = Number(r.gn) || 0;
        if (y === year) curr[mo] = (curr[mo] ?? 0) + v;
        else if (y === year - 1) prev[mo] = (prev[mo] ?? 0) + v;
      }
    } catch (e) {
      console.warn("loadMonthlyGnFromHourly: tesis atlandı", sn, e);
    }
  }

  const points = [];
  for (let mo = 1; mo <= 12; mo++) {
    points.push({ m: monthNamesShort[mo - 1], curr: curr[mo], prev: prev[mo] });
  }
  const hasPrev = points.some((p) => p.prev != null && p.prev > 0);

  return { points, hasPrev };
}

// GÜNLÜK — bu ay (ay başı→bugün) + geçen ay (tam). consumption_daily, yoksa hourly fallback.
// metric parametrik: cn (çekiş, consumption_daily.kwh_in) / gn (veriş, kwh_out).
async function loadDaily(
  metric: Metric,
  ctx: { uid: string; sernos: number[] }
): Promise<DailyResult> {
  const { uid, sernos } = ctx;
  const thisStart = dayjsTR().startOf("month");
  const lastStart = thisStart.subtract(1, "month");
  const now = dayjsTR();

  const thisYm = thisStart.format("YYYY-MM");
  const lastYm = lastStart.format("YYYY-MM");

  const thisByDay = new Array(32).fill(null) as (number | null)[];
  const lastByDay = new Array(32).fill(null) as (number | null)[];

  const dailyColumn = metric === "cn" ? "kwh_in" : "kwh_out";

  // Tesis başına: önce consumption_daily (tarih aralığı küçük → tek sayfa yeterli),
  // o tesiste daily yoksa hourly fallback. Böylece daily/hourly karışık tesisler
  // doğru toplanır ve çoklu-tesis "Tümü"de 1000-satır kesintisi olmaz.
  for (const sn of sernos) {
    try {
      const dq = await supabase
        .from("consumption_daily")
        .select(`day, ${dailyColumn}`)
        .eq("user_id", uid)
        .eq("subscription_serno", sn)
        .gte("day", lastStart.format("YYYY-MM-DD"))
        .lte("day", now.format("YYYY-MM-DD"));

      if (!dq.error && dq.data && dq.data.length > 0) {
        for (const r of dq.data as any[]) {
          const dd = dayjs(r.day);
          const dayNum = dd.date();
          const ym = dd.format("YYYY-MM");
          const val = Number(r[dailyColumn]) || 0;
          if (ym === thisYm) thisByDay[dayNum] = (thisByDay[dayNum] ?? 0) + val;
          else if (ym === lastYm) lastByDay[dayNum] = (lastByDay[dayNum] ?? 0) + val;
        }
        continue;
      }

      // fallback: consumption_hourly → güne topla (bu serno, paginated)
      const h = await fetchAllConsumption({
        supabase,
        userId: uid,
        subscriptionSerno: sn,
        columns: `ts, ${metric}`,
        startIso: lastStart.toDate().toISOString(),
        endIso: now.toDate().toISOString(),
        endInclusive: true,
      });
      if (h.error) throw h.error;
      for (const r of (h.data ?? []) as any[]) {
        const d = dayjsTR(r.ts);
        const dayNum = d.date();
        const ym = d.format("YYYY-MM");
        const val = Number(r[metric]) || 0;
        if (ym === thisYm) thisByDay[dayNum] = (thisByDay[dayNum] ?? 0) + val;
        else if (ym === lastYm) lastByDay[dayNum] = (lastByDay[dayNum] ?? 0) + val;
      }
    } catch (e) {
      console.warn("loadDaily: tesis atlandı", sn, e);
    }
  }

  const points = [];
  for (let d = 1; d <= 31; d++) {
    points.push({ d, curr: thisByDay[d], prev: lastByDay[d] });
  }
  return { points };
}

// SAATLİK — son 8 hafta consumption_hourly; tesisler ts bazında toplanır,
// saat-içi (0–23) ortalama; hafta içi / hafta sonu ayrı. metric parametrik: cn / gn.
async function loadHourly(
  metric: Metric,
  ctx: { uid: string; sernos: number[] }
): Promise<HourlyResult> {
  const { uid, sernos } = ctx;
  // Pencere TAM günlere hizalanır (bugün hariç): aksi halde sınır günler kısmi
  // olur ve "Günlük Ortalama" KPI'ı sistematik düşük çıkar.
  const end = dayjsTR().startOf("day");
  const start = end.subtract(8, "week");

  // ts → tesisler toplamı (bir tesis hata verse atla, diğerlerini topla)
  const byTs = new Map<string, number>();
  for (const sn of sernos) {
    try {
      const h = await fetchAllConsumption({
        supabase,
        userId: uid,
        subscriptionSerno: sn,
        columns: `ts, ${metric}`,
        startIso: start.toDate().toISOString(),
        endIso: end.toDate().toISOString(),
        endInclusive: false, // [start, end) — yalnız tam günler
      });
      if (h.error) throw h.error;
      for (const r of (h.data ?? []) as any[]) {
        const k = String(r.ts);
        byTs.set(k, (byTs.get(k) ?? 0) + (Number(r[metric]) || 0));
      }
    } catch (e) {
      console.warn("loadHourly: tesis atlandı", sn, e);
    }
  }

  const wkSum = new Array(24).fill(0);
  const wkCnt = new Array(24).fill(0);
  const weSum = new Array(24).fill(0);
  const weCnt = new Array(24).fill(0);
  const dailyTot = new Map<string, number>();

  for (const [ts, v] of byTs) {
    const d = dayjsTR(ts);
    const hour = d.hour();
    const dow = d.day(); // 0=Paz .. 6=Cmt
    const isWeekend = dow === 0 || dow === 6;
    if (isWeekend) {
      weSum[hour] += v;
      weCnt[hour] += 1;
    } else {
      wkSum[hour] += v;
      wkCnt[hour] += 1;
    }
    const dk = d.format("YYYY-MM-DD");
    dailyTot.set(dk, (dailyTot.get(dk) ?? 0) + v);
  }

  const points = [];
  for (let h = 0; h < 24; h++) {
    const weekday = wkCnt[h] ? wkSum[h] / wkCnt[h] : null;
    const weekend = weCnt[h] ? weSum[h] / weCnt[h] : null;
    const allCnt = wkCnt[h] + weCnt[h];
    const all = allCnt ? (wkSum[h] + weSum[h]) / allCnt : null;
    points.push({ h: `${String(h).padStart(2, "0")}:00`, weekday, weekend, all });
  }

  // Günlük ortalama = penceredeki günlük toplamların ortalaması
  let dailyAvg = 0;
  if (dailyTot.size > 0) {
    let sum = 0;
    for (const v of dailyTot.values()) sum += v;
    dailyAvg = sum / dailyTot.size;
  }

  return { points, dailyAvg };
}
