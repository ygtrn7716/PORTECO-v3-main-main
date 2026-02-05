// src/components/dashboard/ReactiveSection.tsx
import { useEffect, useMemo, useState } from "react";
import { dayjsTR } from "@/lib/dayjs";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";

type Props = {
  subscriptionSerNo: number | null;
};

const REACTIVE_LIMIT_RI = 20; // %
const REACTIVE_LIMIT_RC = 15; // %

const fmt0 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function percent(n: number) {
  return Number.isFinite(n) ? n : 0;
}

function Bar({
  valuePct,
  limitPct,
}: {
  valuePct: number; // 0-100
  limitPct: number; // 0-100
}) {
  const v = clamp(valuePct, 0, 100);
  const limit = clamp(limitPct, 0, 100);

  return (
    <div className="relative h-4 w-full rounded-full bg-neutral-100 overflow-hidden">
      <div
        className={"h-full " + (v > limit ? "bg-red-500" : "bg-emerald-500")}
        style={{ width: `${v}%` }}
      />
      {/* limit marker */}
      <div
        className="absolute top-0 h-full w-[2px] bg-neutral-500/70"
        style={{ left: `${limit}%` }}
        title={`Limit: %${limit.toFixed(0)}`}
      />
    </div>
  );
}

function ReactiveCard({
  title,
  subtitle,
  activeKwh,
  reactiveTotal,
  ratioPct,
  limitPct,
}: {
  title: string;
  subtitle: string;
  activeKwh: number;
  reactiveTotal: number;
  ratioPct: number;
  limitPct: number;
}) {
  const over = ratioPct > limitPct;

  return (
    <div className="h-full rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
          <p className="text-sm text-neutral-500">{subtitle}</p>
        </div>

        <div
          className={
            "shrink-0 rounded-xl border px-2 py-1 text-xs font-medium " +
            (over
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700")
          }
        >
          {over ? "Limit Aşıldı" : "Limit İçinde"}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-3xl font-semibold text-neutral-900">
            {percent(ratioPct).toFixed(1)} %
          </div>
          <div className="mt-1 text-sm text-neutral-500">
            Reaktif toplam: {fmt0(reactiveTotal)} kvarh • Aktif toplam:{" "}
            {fmt0(activeKwh)} kWh
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
          <span>0%</span>
          <span>100%</span>
        </div>

        <Bar valuePct={percent(ratioPct)} limitPct={limitPct} />

        <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
          <span>Limit: {limitPct}%</span>
          <span>Şu an: {percent(ratioPct).toFixed(1)}%</span>
        </div>

        <div
          className={
            "mt-3 text-sm " + (over ? "text-red-700" : "text-emerald-700")
          }
        >
          {over
            ? "Limit aşıldığı için reaktif ceza riski vardır."
            : "Limit içinde, aktif ceza bulunmamaktadır."}
        </div>
      </div>
    </div>
  );
}

export default function ReactiveSection({ subscriptionSerNo }: Props) {
  const { session: authSession, loading: sessionLoading } = useSession();
  const uid = authSession?.user?.id ?? null;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [activeKwh, setActiveKwh] = useState(0);
  const [totalRi, setTotalRi] = useState(0);
  const [totalRc, setTotalRc] = useState(0);

  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !subscriptionSerNo) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // ✅ "Bu ayki toplam" mantığı (ayın başından şimdiye)
        const start = dayjsTR().startOf("month");
        const end = dayjsTR().add(1, "hour"); // ufak pay

        const res = await supabase
          .from("consumption_hourly")
          .select("cn, ri, rc")
          .eq("user_id", uid)
          .eq("subscription_serno", subscriptionSerNo) // ✅ tesis filtresi
          .gte("ts", start.toDate().toISOString())
          .lt("ts", end.toDate().toISOString());

        if (cancel) return;
        if (res.error) throw res.error;

        let cn = 0;
        let ri = 0;
        let rc = 0;

        for (const r of (res.data ?? []) as any[]) {
          cn += Number(r.cn) || 0;
          ri += Number(r.ri) || 0;
          rc += Number(r.rc) || 0;
        }

        setActiveKwh(cn);
        setTotalRi(ri);
        setTotalRc(rc);
      } catch (e: any) {
        if (!cancel) {
          console.error("ReactiveSection error:", e);
          setErr(e?.message ?? "Reaktif veriler getirilemedi");
          setActiveKwh(0);
          setTotalRi(0);
          setTotalRc(0);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, subscriptionSerNo]);

  const riPct = useMemo(() => {
    if (!activeKwh) return 0;
    return (totalRi / activeKwh) * 100;
  }, [totalRi, activeKwh]);

  const rcPct = useMemo(() => {
    if (!activeKwh) return 0;
    return (totalRc / activeKwh) * 100;
  }, [totalRc, activeKwh]);

  if (!subscriptionSerNo) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-neutral-600">Tesis seçilmedi.</div>
      </div>
    );
  }

return (
  <div className="flex flex-col gap-5">
    {err && (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {err}
      </div>
    )}

    {loading && (
      <div className="text-sm text-neutral-500">Reaktif veriler yükleniyor…</div>
    )}

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <ReactiveCard
        title="Reaktif İndüktif"
        subtitle="Bu ayki toplam reaktif / aktif oranı"
        activeKwh={activeKwh}
        reactiveTotal={totalRi}
        ratioPct={riPct}
        limitPct={REACTIVE_LIMIT_RI}
      />

      <ReactiveCard
        title="Reaktif Kapasitif"
        subtitle="Bu ayki toplam reaktif / aktif oranı"
        activeKwh={activeKwh}
        reactiveTotal={totalRc}
        ratioPct={rcPct}
        limitPct={REACTIVE_LIMIT_RC}
      />
    </div>
  </div>
);

}
