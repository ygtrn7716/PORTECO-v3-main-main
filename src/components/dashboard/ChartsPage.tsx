import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";


type SubOption = {
  subscriptionSerNo: number;
  meterSerial: string | null;
  nickname: string | null;
  kbk: number | null;
};

type RpcRow = {
  month: number;
  consumption_kwh: number | null;
  ptf_tl_kwh: number | null;
  yekdem_value_tl_kwh: number | null;
  yekdem_final_tl_kwh: number | null;
  invoice_total_tl: number | null;
  yekdem_mahsup_tl: number | null;
  ri_ratio_max: number | null;
  ri_ratio_end: number | null;
  rc_ratio_max: number | null;
  rc_ratio_end: number | null;
};

const LS_SUB_KEY = "eco_selected_sub";

const monthNamesShort = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];

const fmtMoney2 = (n: number | null | undefined) =>
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

const fmt1 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });

         const RED = "#ef4444";
        const BLUE = "#3b82f6";


function nOrNull(x: any): number | null {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;

}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold text-neutral-900">{title}</div>
        {subtitle && <div className="text-xs text-neutral-500 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

type Series = { dataKey: string; name: string; color?: string };

function Chart({
  mode,
  data,
  series,
  yFmt,
}: {
  mode: "line" | "bar";
  data: any[];
  series: Series[];
  yFmt?: (v: any) => string;
}) {
  const axisTick = { fontSize: 11 };
  const legendStyle = { fontSize: 12 };
  const tooltipStyle = { fontSize: 12 };

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        {mode === "bar" ? (
          <BarChart
            data={data}
            margin={{ top: 10, right: 16, left: 24, bottom: 0 }} // ✅ soldan pay
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="m" tick={axisTick} />
            <YAxis tick={axisTick} tickFormatter={yFmt} width={72} /> {/* ✅ y-etiket sığar */}
            <Tooltip
              labelFormatter={(label) => `Ay: ${label}`}
              contentStyle={tooltipStyle as any}
            />
            <Legend wrapperStyle={legendStyle as any} />
            {series.map((s) => (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey}
                name={s.name}
                fill={s.color}
                radius={[8, 8, 0, 0]}
              />
            ))}
          </BarChart>
        ) : (
          <LineChart
            data={data}
            margin={{ top: 10, right: 16, left: 24, bottom: 0 }} // ✅ soldan pay
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="m" tick={axisTick} />
            <YAxis tick={axisTick} tickFormatter={yFmt} width={72} /> {/* ✅ y-etiket sığar */}
            <Tooltip
              labelFormatter={(label) => `Ay: ${label}`}
              contentStyle={tooltipStyle as any}
            />
            <Legend wrapperStyle={legendStyle as any} />
            {series.map((s) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name}
                dot={false}
                connectNulls={false}
                stroke={s.color}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export default function ChartsPage() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const uid = authSession?.user?.id ?? null;

  const [chartType, setChartType] = useState<"bar" | "line">("bar"); // ✅ default sütun


  const [subs, setSubs] = useState<SubOption[]>([]);
  const [selectedSub, setSelectedSub] = useState<number | null>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LS_SUB_KEY) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });

  const [year, setYear] = useState<number>(() => new Date().getFullYear());

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rowsCurr, setRowsCurr] = useState<RpcRow[]>([]);
  const [rowsPrev, setRowsPrev] = useState<RpcRow[]>([]);

  const selectedSubObj = subs.find((s) => s.subscriptionSerNo === selectedSub) ?? null;

  const subLabel = (s: SubOption) => {
    const tesisNo = (s.meterSerial ?? `Tesis ${s.subscriptionSerNo}`).trim();
    const nick = (s.nickname ?? "").trim();
    return nick ? `${tesisNo} - ${nick}` : tesisNo;
  };

  // 0) tesis listesi (meter_serial + nickname + kbk)
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) return;

    let cancel = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("owner_subscriptions")
          .select(
            `
            subscription_serno,
            meter_serial,
            subscription_settings:subscription_settings (
              title,
              nickname,
              kbk
            )
          `
          )
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        if (error) throw error;

        const list: SubOption[] = (data ?? []).map((r: any) => {
          const ss = r.subscription_settings;
          const nick = (ss?.nickname ?? ss?.title ?? null) as string | null;
          const kbk = ss?.kbk != null ? Number(ss.kbk) : null;

          return {
            subscriptionSerNo: Number(r.subscription_serno),
            meterSerial: r.meter_serial ?? null,
            nickname: nick,
            kbk: Number.isFinite(kbk as any) ? kbk : null,
          };
        });

        setSubs(list);

        if (list.length > 0) {
          const ok = selectedSub != null && list.some((s) => s.subscriptionSerNo === selectedSub);
          const next = ok ? selectedSub! : list[0].subscriptionSerNo;
          setSelectedSub(next);
          localStorage.setItem(LS_SUB_KEY, String(next));
        } else {
          setSelectedSub(null);
          localStorage.removeItem(LS_SUB_KEY);
        }
      } catch (e: any) {
        if (!cancel) {
          setSubs([]);
          setSelectedSub(null);
        }
      }
    })();

    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, sessionLoading]);

  // 1) RPC: seçili yıl + önceki yıl
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [rCurr, rPrev] = await Promise.all([
          supabase.rpc("monthly_dashboard_series", {
            p_user_id: uid,
            p_subscription_serno: selectedSub,
            p_year: year,
            p_tz: "Europe/Istanbul",
          }),
          supabase.rpc("monthly_dashboard_series", {
            p_user_id: uid,
            p_subscription_serno: selectedSub,
            p_year: year - 1,
            p_tz: "Europe/Istanbul",
          }),
        ]);

        if (cancel) return;
        if (rCurr.error) throw rCurr.error;
        if (rPrev.error) throw rPrev.error;

        const norm = (data: any[]): RpcRow[] =>
          (data ?? []).map((x: any) => ({
            month: Number(x.month),
            consumption_kwh: nOrNull(x.consumption_kwh),
            ptf_tl_kwh: nOrNull(x.ptf_tl_kwh),
            yekdem_value_tl_kwh: nOrNull(x.yekdem_value_tl_kwh),
            yekdem_final_tl_kwh: nOrNull(x.yekdem_final_tl_kwh),
            invoice_total_tl: nOrNull(x.invoice_total_tl),
            yekdem_mahsup_tl: nOrNull(x.yekdem_mahsup_tl),
            ri_ratio_max: nOrNull(x.ri_ratio_max),
            ri_ratio_end: nOrNull(x.ri_ratio_end),
            rc_ratio_max: nOrNull(x.rc_ratio_max),
            rc_ratio_end: nOrNull(x.rc_ratio_end),
          }));

        setRowsCurr(norm(rCurr.data ?? []));
        setRowsPrev(norm(rPrev.data ?? []));
      } catch (e: any) {
        if (!cancel) {
          setErr(e?.message ?? "Grafik verisi alınamadı");
          setRowsCurr([]);
          setRowsPrev([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub, year]);

  // 2) Chart data: 12 ay birleştir (current + prev year)
  const chartData = useMemo(() => {
    const kbk = selectedSubObj?.kbk ?? null;

    const mapByMonth = (rows: RpcRow[]) => {
      const m = new Map<number, RpcRow>();
      for (const r of rows) m.set(r.month, r);
      return m;
    };

    const cMap = mapByMonth(rowsCurr);
    const pMap = mapByMonth(rowsPrev);

    const out = [];
    for (let m = 1; m <= 12; m++) {
      const c = cMap.get(m);
      const p = pMap.get(m);

      const cYek = c ? (c.yekdem_final_tl_kwh ?? c.yekdem_value_tl_kwh) : null;
      const pYek = p ? (p.yekdem_final_tl_kwh ?? p.yekdem_value_tl_kwh) : null;

      const cUnit =
        kbk != null && c?.ptf_tl_kwh != null && cYek != null ? (c.ptf_tl_kwh + cYek) * kbk : null;

      const pUnit =
        kbk != null && p?.ptf_tl_kwh != null && pYek != null ? (p.ptf_tl_kwh + pYek) * kbk : null;

      out.push({
        m: monthNamesShort[m - 1],

        // consumption
        consumption_curr: c?.consumption_kwh ?? null,
        consumption_prev: p?.consumption_kwh ?? null,

        // ptf
        ptf_curr: c?.ptf_tl_kwh ?? null,
        ptf_prev: p?.ptf_tl_kwh ?? null,

        // yekdem (2 seri)
        yek_value_curr: c?.yekdem_value_tl_kwh ?? null,
        yek_final_curr: c?.yekdem_final_tl_kwh ?? null,
        yek_value_prev: p?.yekdem_value_tl_kwh ?? null,
        yek_final_prev: p?.yekdem_final_tl_kwh ?? null,

        // unit price (frontend hesap)
        unit_curr: cUnit,
        unit_prev: pUnit,

        // invoice
        invoice_curr: c?.invoice_total_tl ?? null,
        invoice_prev: p?.invoice_total_tl ?? null,

        // mahsup
        mahsup_curr: c?.yekdem_mahsup_tl ?? null,
        mahsup_prev: p?.yekdem_mahsup_tl ?? null,

        // reactive inductive
        ri_max_curr: c?.ri_ratio_max ?? null,
        ri_end_curr: c?.ri_ratio_end ?? null,
        ri_max_prev: p?.ri_ratio_max ?? null,
        ri_end_prev: p?.ri_ratio_end ?? null,

        // reactive capacitive
        rc_max_curr: c?.rc_ratio_max ?? null,
        rc_end_curr: c?.rc_ratio_end ?? null,
        rc_max_prev: p?.rc_ratio_max ?? null,
        rc_end_prev: p?.rc_ratio_end ?? null,
      });
    }

    return out;
  }, [rowsCurr, rowsPrev, selectedSubObj?.kbk]);

  return (
    <DashboardShell>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Grafikler</h1>
            <p className="text-sm text-neutral-500">
            Tesis bazlı aylık trendler •{" "}
            {chartType === "bar" ? `${year}` : `${year} ve ${year - 1}`}
            </p>

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

            <button
              onClick={() => setYear((y) => y - 1)}
              className="h-10 md:h-9 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              ← {year - 1}
            </button>

            <div className="h-10 md:h-9 shrink-0 rounded-lg border border-neutral-200 bg-white px-3 text-xs text-neutral-700 grid place-items-center">
              {year}
            </div>

            <button
              onClick={() => setYear((y) => y + 1)}
              className="h-10 md:h-9 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              {year + 1} →
            </button>



            {/* ✅ Grafik tipi toggle */}
            <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => setChartType("bar")}
                className={[
                "h-10 md:h-9 rounded-lg border px-3 text-xs transition",
                chartType === "bar"
                    ? "border-neutral-300 bg-neutral-900 text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50",
                ].join(" ")}
            >
                Sütun
            </button>

            <button
                type="button"
                onClick={() => setChartType("line")}
                className={[
                "h-10 md:h-9 rounded-lg border px-3 text-xs transition",
                chartType === "line"
                    ? "border-neutral-300 bg-neutral-900 text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50",
                ].join(" ")}
            >
                Çizgi
            </button>
            </div>

            <button
              onClick={() => navigate("/dashboard")}
              className="h-10 md:h-9 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              ← Panele dön
            </button>
          </div>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}
      {loading && <div className="mb-4 text-sm text-neutral-500">Veriler yükleniyor…</div>}

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Section title="Toplam Tüketim (kWh)" subtitle="Aylık Toplam Tüketim Değeri">
            <Chart
            mode={chartType}
            data={chartData}
            yFmt={(v) => (v == null ? "" : Number(v).toLocaleString("tr-TR"))}
            series={
                chartType === "bar"
                ? [{ dataKey: "consumption_curr", name: `${year}`, color: BLUE }]
                : [
                    { dataKey: "consumption_curr", name: `${year}` },
                    { dataKey: "consumption_prev", name: `${year - 1}` },
                    ]
            }
            />

        </Section>

 
<Section title="PTF (TL/kWh)" subtitle="Aylık PTF Değeri">
  <Chart
    mode={chartType}
    data={chartData}
    yFmt={(v) => (v == null ? "" : fmt6(v))}
    series={
      chartType === "bar"
        ? [{ dataKey: "ptf_curr", name: `${year}` }]
        : [
            { dataKey: "ptf_curr", name: `${year}` },
            { dataKey: "ptf_prev", name: `${year - 1}` },
          ]
    }
  />
</Section>

       <Section title="Yekdem (TL/kWh)" subtitle="Aylık Yekdem Değeri">
            <Chart
            mode={chartType}
            data={chartData}
            yFmt={(v) => (v == null ? "" : fmt6(v))}
            series={
                chartType === "bar"
                ? [
                    { dataKey: "yek_value_curr", name: `${year} • Tahmini Yekdem`, color: BLUE },
                    { dataKey: "yek_final_curr", name: `${year} • Final Yekdem`, color: RED }, // ✅ kırmızı
                    ]
                : [
                    { dataKey: "yek_value_curr", name: `${year} • Tahmini Yekdem` },
                    { dataKey: "yek_final_curr", name: `${year} • Final Yekdem`, color: RED }, // ✅ kırmızı
                    { dataKey: "yek_value_prev", name: `${year - 1} • Tahmini Yekdem` },
                    { dataKey: "yek_final_prev", name: `${year - 1} • Final Yekdem`, color: RED }, // ✅ kırmızı
                    ]
            }
            />

        </Section>


            <Section title="Birim Fiyat (TL/kWh)" subtitle="Aylık Birim Fiyat (TL/kWh) Değeri">
            <div className="mb-2 text-xs text-neutral-500">
                KBK: {selectedSubObj?.kbk != null ? selectedSubObj.kbk : "—"}
            </div>

            <Chart
                mode={chartType}
                data={chartData}
                yFmt={(v) => (v == null ? "" : fmt6(v))}
                series={
                chartType === "bar"
                    ? [{ dataKey: "unit_curr", name: `${year}` }]
                    : [
                        { dataKey: "unit_curr", name: `${year}` },
                        { dataKey: "unit_prev", name: `${year - 1}` },
                    ]
                }
            />
            </Section>

            <Section title="Fatura (TL)" subtitle="Aylık Fatura Tutarı">
            <Chart
                mode={chartType}
                data={chartData}
                yFmt={(v) => (v == null ? "" : fmtMoney2(v))}
                series={
                chartType === "bar"
                    ? [{ dataKey: "invoice_curr", name: `${year}` }]
                    : [
                        { dataKey: "invoice_curr", name: `${year}` },
                        { dataKey: "invoice_prev", name: `${year - 1}` },
                    ]
                }
            />
            </Section>


            <Section title="YEKDEM Mahsup (TL)" subtitle="Aylık YEKDEM Mahsup (TL) Değeri">
            <Chart
                mode={chartType}
                data={chartData}
                yFmt={(v) => (v == null ? "" : fmtMoney2(v))}
                series={
                chartType === "bar"
                    ? [{ dataKey: "mahsup_curr", name: `${year}` }]
                    : [
                        { dataKey: "mahsup_curr", name: `${year}` },
                        { dataKey: "mahsup_prev", name: `${year - 1}` },
                    ]
                }
            />
            </Section>


        <Section title="Reaktif İndüktif (%)" subtitle="Ay içi max vs ay sonu kapanan değer">
            <Chart
            mode={chartType}
            data={chartData}
            yFmt={(v) => (v == null ? "" : fmt1(v))}
            series={
                chartType === "bar"
                ? [
                    { dataKey: "ri_max_curr", name: `${year} • Ay Maksimum`, color: RED }, // ✅ kırmızı
                    { dataKey: "ri_end_curr", name: `${year} • Ay Sonu`, color: BLUE },
                    ]
                : [
                    { dataKey: "ri_max_curr", name: `${year} • Ay Maksimum`, color: RED }, // ✅ kırmızı
                    { dataKey: "ri_end_curr", name: `${year} • Ay Sonu` },
                    { dataKey: "ri_max_prev", name: `${year - 1} • Ay Maksimum`, color: RED }, // ✅ kırmızı
                    { dataKey: "ri_end_prev", name: `${year - 1} • Ay Sonu` },
                    ]
            }
            />

        </Section>

            <Section title="Reaktif Kapasitif (%)" subtitle="Ay içi max vs ay sonu kapanan değer">
            <Chart
                mode={chartType}
                data={chartData}
                yFmt={(v) => (v == null ? "" : fmt1(v))}
                series={
                chartType === "bar"
                    ? [
                        { dataKey: "rc_max_curr", name: `${year} • Ay Maksimum`, color: RED },
                        { dataKey: "rc_end_curr", name: `${year} • Ay Sonu`, color: BLUE },
                    ]
                    : [
                        { dataKey: "rc_max_curr", name: `${year} • Ay Maksimum`, color: RED },
                        { dataKey: "rc_end_curr", name: `${year} • Ay Sonu` },
                        { dataKey: "rc_max_prev", name: `${year - 1} • Ay Maksimum`, color: RED },
                        { dataKey: "rc_end_prev", name: `${year - 1} • Ay Sonu` },
                    ]
                }
            />
            </Section>

      </div>
    </DashboardShell>
  );
}
