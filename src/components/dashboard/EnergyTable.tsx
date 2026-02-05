// src/components/dashboard/EnergyTable.tsx
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "@/lib/supabase";

type HourRow = {
  ts: string;
  subscription_serno: number;
  cn: number | null;
  gn: number | null;
  ri: number | null;
  rc: number | null;
};

type SubRow = { subscription_serno: number; title: string | null };

export default function EnergyTable() {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [selectedSub, setSelectedSub] = useState<"ALL" | number>("ALL");

  const [from, setFrom] = useState<string>(() =>
    dayjs().subtract(7, "day").format("YYYY-MM-DD")
  );
  const [to, setTo] = useState<string>(() =>
    dayjs().format("YYYY-MM-DD")
  );

  const [rows, setRows] = useState<HourRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pageSize = 1000;
  const [page, setPage] = useState(0);
  const canLoadMore = useMemo(() => rows.length === (page + 1) * pageSize, [rows, page]);

  // Sadece kendi tesisatları (RLS zaten filtreliyor)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("owner_subscriptions")
        .select("subscription_serno, title")
        .order("subscription_serno", { ascending: true });

      if (!error) setSubs(data || []);
    })();
  }, []);

  async function fetchRows(reset = true) {
    setLoading(true); setErr(null);

    let q = supabase
      .from("consumption_hourly")
      .select("ts, subscription_serno, cn, gn, ri, rc")
      .gte("ts", dayjs(from).startOf("day").toISOString())
      .lte("ts", dayjs(to).endOf("day").toISOString())
      .order("ts", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (selectedSub !== "ALL") q = q.eq("subscription_serno", selectedSub);

    const { data, error } = await q;

    if (error) {
      setErr(error.message);
      setRows(reset ? [] : rows);
    } else {
      setRows(reset ? (data || []) : [...rows, ...(data || [])]);
    }
    setLoading(false);
  }

  // İlk yükleme & filtre değişimi
  useEffect(() => {
    setPage(0);
    fetchRows(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, selectedSub]);

  // Sayfalama: page değişince fetch
  useEffect(() => {
    if (page === 0) return;
    fetchRows(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function downloadCsv() {
    const header = ["Tarih-Saat", "Tesisat", "CN(kWh)", "GN(kWh)", "RI(kvarh)", "RC(kvarh)"];
    const body = rows.map(r => [
      dayjs(r.ts).format("YYYY-MM-DD HH:mm"),
      r.subscription_serno,
      (r.cn ?? 0),
      (r.gn ?? 0),
      (r.ri ?? 0),
      (r.rc ?? 0),
    ]);
    const csv = [header, ...body].map(a => a.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hourly_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="w-full">
      {/* Filtreler */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="flex flex-col">
          <label className="text-xs text-neutral-500 mb-1">Tesisat</label>
          <select
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2"
            value={selectedSub === "ALL" ? "ALL" : String(selectedSub)}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedSub(v === "ALL" ? "ALL" : Number(v));
            }}
          >
            <option value="ALL">Tümü</option>
            {subs.map((s) => (
              <option key={s.subscription_serno} value={s.subscription_serno}>
                {s.subscription_serno} {s.title ? `— ${s.title}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-neutral-500 mb-1">Başlangıç</label>
          <input
            type="date"
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-neutral-500 mb-1">Bitiş</label>
          <input
            type="date"
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <div className="flex items-end gap-2">
          <button
            className="rounded-xl border px-3 py-2 text-sm"
            onClick={() => setPage(p => p + 1)}
            disabled={!canLoadMore || loading}
            title="Daha fazla getir"
          >
            Daha Fazla
          </button>
          <button
            className="rounded-xl border px-3 py-2 text-sm"
            onClick={downloadCsv}
            disabled={rows.length === 0}
            title="CSV indir"
          >
            CSV
          </button>
        </div>
      </div>

      {/* Tablo */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        {err && <div className="text-red-600 text-sm mb-2">Hata: {err}</div>}
        {loading && <div className="text-sm text-neutral-500 mb-2">Yükleniyor…</div>}

        {rows.length === 0 ? (
          <div className="text-sm text-neutral-500">Kayıt bulunamadı.</div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Tarih-Saat</th>
                  <th className="py-2 pr-4">Tesisat</th>
                  <th className="py-2 pr-4">CN (kWh)</th>
                  <th className="py-2 pr-4">GN (kWh)</th>
                  <th className="py-2 pr-4">RI (kvarh)</th>
                  <th className="py-2 pr-0">RC (kvarh)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.subscription_serno}-${r.ts}-${i}`} className="border-b last:border-0">
                    <td className="py-2 pr-4">{dayjs(r.ts).format("YYYY-MM-DD HH:mm")}</td>
                    <td className="py-2 pr-4">{r.subscription_serno}</td>
                    <td className="py-2 pr-4">{(r.cn ?? 0).toFixed(3)}</td>
                    <td className="py-2 pr-4">{(r.gn ?? 0).toFixed(3)}</td>
                    <td className="py-2 pr-4">{(r.ri ?? 0).toFixed(3)}</td>
                    <td className="py-2 pr-0">{(r.rc ?? 0).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
