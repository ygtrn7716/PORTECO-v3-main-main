// src/pages/AlertsPage.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import DashboardShell from "@/components/dashboard/DashboardShell";
import PhoneNumberManager from "@/components/dashboard/PhoneNumberManager";
import {
  Bell,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  Building2,
} from "lucide-react";

type AlertStateRow = {
  subscription_serno: number;
  kind: "ri" | "rc";
  period_ym: string;
  status: "ok" | "warn" | "limit";
  last_value_pct: number | null;
  last_sent_at: string | null;
};

type SmsLogRow = {
  id: string;
  subscription_serno: string | null;
  phone_number: string;
  message_type: string;
  message_body: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

type FacilityInfo = {
  subscription_serno: number;
  meter_serial: string | null;
  title: string | null;
};

const STATUS_CONFIG = {
  ok: {
    label: "Normal",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: ShieldCheck,
    iconColor: "text-emerald-500",
  },
  warn: {
    label: "Uyari",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
  },
  limit: {
    label: "Limit Asildi",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: ShieldAlert,
    iconColor: "text-red-500",
  },
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function periodLabel(ym: string) {
  const [y, m] = ym.split("-");
  const months = [
    "", "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran",
    "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik",
  ];
  return `${months[Number(m)] ?? m} ${y}`;
}

export default function AlertsPage() {
  const { session, loading: sessionLoading } = useSession();
  const uid = session?.user?.id ?? null;

  const [alerts, setAlerts] = useState<AlertStateRow[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLogRow[]>([]);
  const [facilities, setFacilities] = useState<FacilityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [smsLoading, setSmsLoading] = useState(true);

  // Fetch alert states and facilities
  useEffect(() => {
    if (sessionLoading || !uid) return;
    let cancel = false;

    (async () => {
      setLoading(true);
      try {
        // Fetch facilities
        const { data: facData } = await supabase
          .from("owner_subscriptions")
          .select("subscription_serno, meter_serial, title")
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        setFacilities((facData as FacilityInfo[]) ?? []);

        // Fetch alert states
        const { data: alertData } = await supabase
          .from("reactive_alert_state")
          .select("subscription_serno, kind, period_ym, status, last_value_pct, last_sent_at")
          .eq("user_id", uid)
          .order("period_ym", { ascending: false });

        if (cancel) return;
        setAlerts((alertData as AlertStateRow[]) ?? []);
      } catch (e) {
        console.error("AlertsPage load error:", e);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [uid, sessionLoading]);

  // Fetch SMS logs
  useEffect(() => {
    if (sessionLoading || !uid) return;
    let cancel = false;

    (async () => {
      setSmsLoading(true);
      try {
        const { data } = await supabase
          .from("sms_logs")
          .select("id, subscription_serno, phone_number, message_type, message_body, status, error_message, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(50);

        if (cancel) return;
        setSmsLogs((data as SmsLogRow[]) ?? []);
      } catch (e) {
        console.error("SMS logs load error:", e);
      } finally {
        if (!cancel) setSmsLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [uid, sessionLoading]);

  const facilityLabel = (serno: number) => {
    const f = facilities.find((x) => x.subscription_serno === serno);
    if (!f) return `Tesis #${serno}`;
    const serial = f.meter_serial ?? `#${serno}`;
    return f.title ? `${serial} - ${f.title}` : serial;
  };

  // Group alerts by facility
  const alertsByFacility = alerts.reduce<Record<number, AlertStateRow[]>>((acc, a) => {
    if (!acc[a.subscription_serno]) acc[a.subscription_serno] = [];
    acc[a.subscription_serno].push(a);
    return acc;
  }, {});

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
            <Bell className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Uyarilar</h1>
            <p className="text-sm text-neutral-500">
              Reaktif enerji uyari durumlari ve SMS gecmisi
            </p>
          </div>
        </div>

        {/* Reactive Alert Status Cards */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-[#0A66FF]" />
            <h2 className="text-base font-semibold text-neutral-900">Reaktif Uyari Durumlari</h2>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#0A66FF] border-t-transparent" />
              <p className="mt-2 text-sm text-neutral-500">Yukleniyor...</p>
            </div>
          ) : Object.keys(alertsByFacility).length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
              <ShieldCheck className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm text-neutral-600 font-medium">Aktif uyari bulunmuyor</p>
              <p className="text-xs text-neutral-400 mt-1">
                Tesisleriniz icin henuz bir reaktif uyari kaydedilmedi.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(alertsByFacility).map(([sernoStr, rows]) => {
                const serno = Number(sernoStr);
                // Get latest period alerts
                const latestPeriod = rows[0]?.period_ym;
                const latestAlerts = rows.filter((r) => r.period_ym === latestPeriod);

                const riAlert = latestAlerts.find((r) => r.kind === "ri");
                const rcAlert = latestAlerts.find((r) => r.kind === "rc");

                return (
                  <div
                    key={serno}
                    className="rounded-2xl border border-neutral-200/80 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300"
                  >
                    {/* Facility Header */}
                    <div className="px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-neutral-50 to-white">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-[#0A66FF]/10 flex items-center justify-center">
                          <Building2 className="h-4.5 w-4.5 text-[#0A66FF]" />
                        </div>
                        <div>
                          <div className="font-semibold text-neutral-900 text-sm">
                            {facilityLabel(serno)}
                          </div>
                          <div className="text-xs text-neutral-400">
                            {latestPeriod ? periodLabel(latestPeriod) : ""}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RI + RC Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100">
                      {[
                        { label: "Reaktif Induktif (RI)", alert: riAlert, limit: 20, warn: 18 },
                        { label: "Reaktif Kapasitif (RC)", alert: rcAlert, limit: 15, warn: 13 },
                      ].map(({ label, alert, limit }) => {
                        const status = alert?.status ?? "ok";
                        const cfg = STATUS_CONFIG[status];
                        const Icon = cfg.icon;
                        const pct = alert?.last_value_pct;

                        return (
                          <div key={label} className="p-5">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-medium text-neutral-700">{label}</span>
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.color} ${cfg.border} border`}
                              >
                                <Icon className={`h-3.5 w-3.5 ${cfg.iconColor}`} />
                                {cfg.label}
                              </span>
                            </div>

                            {pct != null && (
                              <div className="space-y-2">
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-bold text-neutral-900">
                                    {pct.toFixed(1)}
                                  </span>
                                  <span className="text-sm text-neutral-400">%</span>
                                </div>

                                {/* Progress bar */}
                                <div className="relative h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      status === "limit"
                                        ? "bg-gradient-to-r from-red-400 to-red-500"
                                        : status === "warn"
                                        ? "bg-gradient-to-r from-amber-400 to-amber-500"
                                        : "bg-gradient-to-r from-emerald-400 to-emerald-500"
                                    }`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                  />
                                  <div
                                    className="absolute top-0 h-full w-0.5 bg-neutral-600/50"
                                    style={{ left: `${limit}%` }}
                                  />
                                </div>

                                <div className="flex items-center justify-between text-xs text-neutral-400">
                                  <span>Limit: %{limit}</span>
                                  {alert?.last_sent_at && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {formatDate(alert.last_sent_at)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {pct == null && (
                              <p className="text-xs text-neutral-400">Veri bulunamadi</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SMS Log History */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-5 w-5 text-[#0A66FF]" />
            <h2 className="text-base font-semibold text-neutral-900">SMS Gecmisi</h2>
          </div>

          {smsLoading ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#0A66FF] border-t-transparent" />
              <p className="mt-2 text-sm text-neutral-500">Yukleniyor...</p>
            </div>
          ) : smsLogs.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
              <MessageSquare className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-600 font-medium">Henuz SMS gonderimi yok</p>
              <p className="text-xs text-neutral-400 mt-1">
                Reaktif uyarilar tetiklendiginde SMS gecmisiniz burada gorunecek.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200/80 bg-white overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50/80">
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Tarih
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Tur
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Telefon
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Mesaj
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Durum
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {smsLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-neutral-400" />
                            {formatDate(log.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                              log.message_type.includes("limit")
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {log.message_type === "reactive_warn"
                              ? "Uyari"
                              : log.message_type === "reactive_limit"
                              ? "Limit"
                              : log.message_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-neutral-600 whitespace-nowrap font-mono text-xs">
                          {log.phone_number}
                        </td>
                        <td className="px-4 py-3 text-neutral-600 max-w-xs">
                          <p className="truncate" title={log.message_body}>
                            {log.message_body}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              log.status === "sent"
                                ? "text-emerald-600"
                                : log.status === "failed"
                                ? "text-red-600"
                                : "text-neutral-500"
                            }`}
                          >
                            {log.status === "sent" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : log.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Clock className="h-3.5 w-3.5" />
                            )}
                            {log.status === "sent"
                              ? "Gonderildi"
                              : log.status === "failed"
                              ? "Basarisiz"
                              : "Bekliyor"}
                          </span>
                          {log.error_message && (
                            <p className="text-xs text-red-400 mt-0.5">{log.error_message}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Phone Number Management */}
        <PhoneNumberManager />
      </div>
    </DashboardShell>
  );
}
