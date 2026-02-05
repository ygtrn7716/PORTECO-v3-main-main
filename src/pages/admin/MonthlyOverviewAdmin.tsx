import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = [
  "Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
  "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık",
];

type Snapshot = {
  user_id: string;
  subscription_serno: number;
  period_year: number;
  period_month: number;
  invoice_type: string;
  total_consumption_kwh: number;
  total_invoice: number;
  total_with_mahsup: number;
  has_yekdem_mahsup: boolean;
  yekdem_mahsup: number;
  energy_cost?: number;
  distribution_cost?: number;
  btv_cost?: number;
  power_cost?: number;
  reactive_penalty?: number;
  kdv_cost?: number;
};

export default function MonthlyOverviewAdmin() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [filterUser, setFilterUser] = useState("");
  const [filterSerno, setFilterSerno] = useState("");

  const [data, setData] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [users, setUsers] = useState<{ user_id: string; email: string | null }[]>([]);

  useEffect(() => {
    let m = true;
    (async () => {
      const { data: ud } = await supabase
        .from("user_integrations")
        .select("user_id,aril_user")
        .order("aril_user", { ascending: true })
        .limit(5000);
      if (!m) return;
      setUsers(
        ((ud as any[]) ?? []).map((r: any) => ({
          user_id: r.user_id,
          email: r.aril_user,
        }))
      );
    })();
    return () => { m = false; };
  }, []);

  useEffect(() => {
    let m = true;
    setLoading(true);
    setErr(null);

    (async () => {
      let qb = supabase
        .from("invoice_snapshots")
        .select("*")
        .eq("period_year", year)
        .eq("period_month", month);

      if (filterUser) qb = qb.eq("user_id", filterUser);
      if (filterSerno) qb = qb.eq("subscription_serno", Number(filterSerno));

      const { data: rows, error } = await qb;
      if (!m) return;
      if (error) {
        setErr(error.message);
        setData([]);
      } else {
        setData((rows as Snapshot[]) ?? []);
      }
      setLoading(false);
    })();

    return () => { m = false; };
  }, [year, month, filterUser, filterSerno]);

  // Özet hesaplama
  const summary = useMemo(() => {
    const uniqueUsers = new Set(data.map((r) => r.user_id));
    const uniqueSubs = new Set(data.map((r) => `${r.user_id}|${r.subscription_serno}`));
    const totalKwh = data.reduce((s, r) => s + (Number(r.total_consumption_kwh) || 0), 0);
    const totalInvoice = data.reduce((s, r) => s + (Number(r.total_invoice) || 0), 0);
    const avgPrice = totalKwh > 0 ? totalInvoice / totalKwh : 0;
    return { userCount: uniqueUsers.size, subCount: uniqueSubs.size, totalKwh, totalInvoice, avgPrice };
  }, [data]);

  // Grafik verileri (top 10)
  const chartConsumption = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((r) => {
      const key = String(r.subscription_serno);
      map.set(key, (map.get(key) ?? 0) + (Number(r.total_consumption_kwh) || 0));
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([serno, kwh]) => ({ serno, kwh: Math.round(kwh) }));
  }, [data]);

  const chartInvoice = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((r) => {
      const key = String(r.subscription_serno);
      map.set(key, (map.get(key) ?? 0) + (Number(r.total_invoice) || 0));
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([serno, total]) => ({ serno, total: Math.round(total) }));
  }, [data]);

  function userLabel(uid: string) {
    const u = users.find((u) => u.user_id === uid);
    return u?.email ?? uid.slice(0, 8);
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Aylık Özet</h1>

      {/* Filtreler */}
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {/* Yıl */}
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs text-neutral-500 mb-1">Yıl</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setYear((y) => y - 1)} className="rounded-lg border px-2 py-1">
              <ChevronLeft size={16} />
            </button>
            <span className="flex-1 text-center font-medium">{year}</span>
            <button onClick={() => setYear((y) => y + 1)} className="rounded-lg border px-2 py-1">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Ay */}
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs text-neutral-500 mb-1">Ay</div>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1} - {m}
              </option>
            ))}
          </select>
        </div>

        {/* Kullanıcı */}
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs text-neutral-500 mb-1">Kullanıcı</div>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <option value="">Hepsi</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.email ?? u.user_id}
              </option>
            ))}
          </select>
        </div>

        {/* Serno */}
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs text-neutral-500 mb-1">Tesis SerNo</div>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="örn: 516588"
            value={filterSerno}
            onChange={(e) => setFilterSerno(e.target.value.replace(/[^\d]/g, ""))}
          />
        </div>
      </div>

      {err && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Özet Kartları */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Kullanıcı / Tesis</div>
          <div className="text-xl font-semibold mt-1">
            {summary.userCount} / {summary.subCount}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Toplam Tüketim</div>
          <div className="text-xl font-semibold mt-1">
            {summary.totalKwh.toLocaleString("tr-TR")} kWh
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Toplam Fatura</div>
          <div className="text-xl font-semibold mt-1">
            {summary.totalInvoice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Ort. Birim Fiyat</div>
          <div className="text-xl font-semibold mt-1">
            {summary.avgPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} TL/kWh
          </div>
        </div>
      </div>

      {/* Detay Tablosu */}
      <div className="overflow-auto rounded-2xl border bg-white mb-6">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="text-left font-medium px-3 py-2 border-b">Kullanıcı</th>
              <th className="text-left font-medium px-3 py-2 border-b">Serno</th>
              <th className="text-left font-medium px-3 py-2 border-b">Tip</th>
              <th className="text-right font-medium px-3 py-2 border-b">Tüketim (kWh)</th>
              <th className="text-right font-medium px-3 py-2 border-b">Enerji</th>
              <th className="text-right font-medium px-3 py-2 border-b">Dağıtım</th>
              <th className="text-right font-medium px-3 py-2 border-b">BTV</th>
              <th className="text-right font-medium px-3 py-2 border-b">Güç</th>
              <th className="text-right font-medium px-3 py-2 border-b">Reaktif Ceza</th>
              <th className="text-right font-medium px-3 py-2 border-b">KDV</th>
              <th className="text-right font-medium px-3 py-2 border-b">Toplam Fatura</th>
              <th className="text-right font-medium px-3 py-2 border-b">YEKDEM Mahsup</th>
              <th className="text-right font-medium px-3 py-2 border-b">Genel Toplam</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-neutral-500" colSpan={13}>
                  Yükleniyor…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-neutral-500" colSpan={13}>
                  Bu dönem için veri bulunamadı.
                </td>
              </tr>
            ) : (
              data.map((r, i) => (
                <tr key={i} className="border-b last:border-b-0 hover:bg-neutral-50/50">
                  <td className="px-3 py-2">{userLabel(r.user_id)}</td>
                  <td className="px-3 py-2">{r.subscription_serno}</td>
                  <td className="px-3 py-2">{r.invoice_type ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.total_consumption_kwh)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.energy_cost)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.distribution_cost)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.btv_cost)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.power_cost)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.reactive_penalty)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.kdv_cost)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(r.total_invoice)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.yekdem_mahsup)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmt(r.total_with_mahsup)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Grafikler */}
      {data.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="text-sm font-medium mb-3">Tüketim (Top 10 Tesis)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartConsumption}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="serno" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="kwh" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="text-sm font-medium mb-3">Fatura Tutarı (Top 10 Tesis)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartInvoice}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="serno" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(v: number | undefined | null): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
