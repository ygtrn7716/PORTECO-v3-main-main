import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Users, Building2 } from "lucide-react";

const quickLinks = [
  { title: "User Integrations", to: "/dashboard/admin/user-integrations" },
  { title: "Subscription Settings", to: "/dashboard/admin/subscription-settings" },
  { title: "Subscription YEKDEM", to: "/dashboard/admin/subscription-yekdem" },
  { title: "Distribution Tariff", to: "/dashboard/admin/distribution-tariff" },
  { title: "Owner Subscriptions", to: "/dashboard/admin/owner-subscriptions" },
  { title: "Notification Channels", to: "/dashboard/admin/notification-channels" },
  { title: "User Phone Numbers", to: "/dashboard/admin/user-phone-numbers" },
  { title: "SMS Logs", to: "/dashboard/admin/sms-logs" },
  { title: "Reactive Alerts", to: "/dashboard/admin/reactive-alerts" },
  { title: "Notification Events", to: "/dashboard/admin/notification-events" },
  { title: "EPIAS PTF", to: "/dashboard/admin/epias-ptf" },
  { title: "Invoice Snapshots", to: "/dashboard/admin/invoice-snapshots" },
  { title: "Aylık Özet", to: "/dashboard/admin/monthly-overview" },
  { title: "İletişim Mesajları", to: "/dashboard/admin/contact-messages" },
];

export default function AdminHome() {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [subCount, setSubCount] = useState<number | null>(null);

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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  );
}
