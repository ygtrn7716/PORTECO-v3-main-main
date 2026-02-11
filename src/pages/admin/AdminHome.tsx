import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Users, Building2, ArrowDownWideNarrow } from "lucide-react";

const quickLinks = [
  { title: "Arıl Hesap Bilgileri", to: "/dashboard/admin/user-integrations" },
  { title: "Tesis Tarifeleri", to: "/dashboard/admin/subscription-settings" },
  { title: "Tesis Aylık YEKDEM", to: "/dashboard/admin/subscription-yekdem" },
  { title: "Tarife Fiyatlandırmaları", to: "/dashboard/admin/distribution-tariff" },
  { title: "Tesis Katsayıları", to: "/dashboard/admin/owner-subscriptions" },
  { title: "Bildirim Kanalları", to: "/dashboard/admin/notification-channels" },
  { title: "Kullanıcı Telefonları", to: "/dashboard/admin/user-phone-numbers" },
  { title: "SMS Kayıtları", to: "/dashboard/admin/sms-logs" },
  { title: "Reaktif Uyarı Durumları", to: "/dashboard/admin/reactive-alerts" },
  { title: "Bildirim Olayları", to: "/dashboard/admin/notification-events" },
  { title: "EPIAS PTF", to: "/dashboard/admin/epias-ptf" },
  { title: "Kaydedilen Faturalar", to: "/dashboard/admin/invoice-snapshots" },
  { title: "Aylık Özet", to: "/dashboard/admin/monthly-overview" },
  { title: "İletişim Mesajları", to: "/dashboard/admin/contact-messages" },
];

type ReactiveRow = {
  id: number;
  subscription_serno: number;
  title: string;
  cn_total: number;
  ri_total: number;
  rc_total: number;
  ri_pct: number;
  rc_pct: number;
};

export default function AdminHome() {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [subCount, setSubCount] = useState<number | null>(null);
  const [reactiveData, setReactiveData] = useState<ReactiveRow[]>([]);
  const [reactiveLoading, setReactiveLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"ri" | "rc">("ri");

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { count: uc } = await supabase
        .from("user_integrations")
        .select("*", { count: "exact", head: true });

      const { count: sc } = await supabase
        .from("subscription_settings")
        .select("*", { count: "exact", head: true });

      if (!mounted) return;
      setUserCount(uc ?? 0);
      setSubCount(sc ?? 0);
    })();

    return () => { mounted = false; };
  }, []);

  // Reaktif verileri çek
  useEffect(() => {
    let mounted = true;
    setReactiveLoading(true);

    (async () => {
      // 1. Tüm tesisleri çek
      const { data: subs } = await supabase
        .from("subscription_settings")
        .select("user_id, subscription_serno, title")
        .order("subscription_serno", { ascending: true });

      if (!mounted || !subs) {
        setReactiveLoading(false);
        return;
      }

      // 2. Bu ayın başlangıç ve bitiş tarihlerini hesapla
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const startISO = monthStart.toISOString();
      const endISO = monthEnd.toISOString();

      // 3. Bu ayın tüm consumption_hourly verilerini çek (cn, ri, rc)
      const { data: consumption } = await supabase
        .from("consumption_hourly")
        .select("subscription_serno, cn, ri, rc")
        .gte("ts", startISO)
        .lt("ts", endISO);

      if (!mounted) return;

      // 4. subscription_serno bazında grupla ve topla
      const cnMap = new Map<number, number>();
      const riMap = new Map<number, number>();
      const rcMap = new Map<number, number>();

      (consumption ?? []).forEach((row: any) => {
        const serno = Number(row.subscription_serno);
        cnMap.set(serno, (cnMap.get(serno) ?? 0) + (Number(row.cn) || 0));
        riMap.set(serno, (riMap.get(serno) ?? 0) + (Number(row.ri) || 0));
        rcMap.set(serno, (rcMap.get(serno) ?? 0) + (Number(row.rc) || 0));
      });

      // 5. Tesislerle birleştir ve yüzde hesapla
      const rows: ReactiveRow[] = subs.map((sub: any, idx: number) => {
        const cn = cnMap.get(sub.subscription_serno) ?? 0;
        const ri = riMap.get(sub.subscription_serno) ?? 0;
        const rc = rcMap.get(sub.subscription_serno) ?? 0;
        return {
          id: idx + 1,
          subscription_serno: sub.subscription_serno,
          title: sub.title ?? `Tesis ${sub.subscription_serno}`,
          cn_total: cn,
          ri_total: ri,
          rc_total: rc,
          ri_pct: cn > 0 ? (ri / cn) * 100 : 0,
          rc_pct: cn > 0 ? (rc / cn) * 100 : 0,
        };
      });

      setReactiveData(rows);
      setReactiveLoading(false);
    })();

    return () => { mounted = false; };
  }, []);

  // Sıralanmış veri (yüzdeye göre)
  const sortedReactive = useMemo(() => {
    return [...reactiveData].sort((a, b) => {
      if (sortBy === "ri") return b.ri_pct - a.ri_pct;
      return b.rc_pct - a.rc_pct;
    });
  }, [reactiveData, sortBy]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Admin Panel</h1>

      {/* Özet Kartları */}
      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        <div className="rounded-2xl border bg-white p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
            <Users size={24} className="text-blue-600" />
          </div>
          <div>
            <div className="text-sm text-neutral-500">Toplam Kullanıcı</div>
            <div className="text-2xl font-semibold">{userCount ?? "—"}</div>
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-green-50 flex items-center justify-center">
            <Building2 size={24} className="text-green-600" />
          </div>
          <div>
            <div className="text-sm text-neutral-500">Toplam Tesis</div>
            <div className="text-2xl font-semibold">{subCount ?? "—"}</div>
          </div>
        </div>
      </div>

      {/* Hızlı Erişim */}
      <h2 className="text-lg font-medium mb-3">Hızlı Erişim</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {quickLinks.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className="rounded-2xl border bg-white p-4 hover:shadow-sm transition"
          >
            <div className="font-medium">{it.title}</div>
            <div className="text-sm text-neutral-500 mt-1">{it.to.replace("/dashboard/admin/", "")}</div>
          </Link>
        ))}
      </div>

      {/* Reaktif Değerleri */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-medium">Reaktif Değerleri (Bu Ay)</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy("ri")}
              className={[
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition",
                sortBy === "ri"
                  ? "bg-orange-500 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
              ].join(" ")}
            >
              <ArrowDownWideNarrow size={16} />
              İndüktife Göre
            </button>
            <button
              onClick={() => setSortBy("rc")}
              className={[
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition",
                sortBy === "rc"
                  ? "bg-purple-500 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
              ].join(" ")}
            >
              <ArrowDownWideNarrow size={16} />
              Kapasitife Göre
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left font-medium px-4 py-3 border-b">#</th>
                <th className="text-left font-medium px-4 py-3 border-b">SerNo</th>
                <th className="text-left font-medium px-4 py-3 border-b">Tesis Adı</th>
                <th className="text-right font-medium px-4 py-3 border-b">R. İndüktif (%)</th>
                <th className="text-right font-medium px-4 py-3 border-b">R. Kapasitif (%)</th>
              </tr>
            </thead>
            <tbody>
              {reactiveLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    Yükleniyor…
                  </td>
                </tr>
              ) : sortedReactive.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    Bu ay için reaktif verisi bulunamadı.
                  </td>
                </tr>
              ) : (
                sortedReactive.map((row, idx) => (
                  <tr key={row.subscription_serno} className="border-b last:border-b-0 hover:bg-neutral-50/50">
                    <td className="px-4 py-3 text-neutral-500">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono">{row.subscription_serno}</td>
                    <td className="px-4 py-3">{row.title}</td>
                    <td className={[
                      "px-4 py-3 text-right font-medium",
                      row.ri_pct >= 20 ? "text-red-600" : row.ri_pct >= 18 ? "text-orange-500" : "text-orange-600",
                    ].join(" ")}>
                      %{row.ri_pct.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={[
                      "px-4 py-3 text-right font-medium",
                      row.rc_pct >= 15 ? "text-red-600" : row.rc_pct >= 13 ? "text-purple-500" : "text-purple-600",
                    ].join(" ")}>
                      %{row.rc_pct.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
