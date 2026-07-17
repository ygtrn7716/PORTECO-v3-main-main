// src/lib/dataHealth.ts
// Veri Sağlığı (Data Health) — ortak tipler, durum mantığı ve formatlayıcılar.
// CONSUMPTION için yazıldı; GES sekmesi eklenince aynı durum/format mantığı
// (HealthRow benzeri bir tip + computeStatus) yeniden kullanılabilir.

import { dayjsTR } from "@/lib/dayjs";

/** get_consumption_health RPC dönüş satırı */
export type ConsumptionHealthRow = {
  subscription_serno: number;
  user_id: string;
  title: string | null;
  /** owner_subscriptions.provider (sepas/kcetas/meram/tredas). null olmamalı ama defansif. */
  provider_key: string | null;
  /** data_health_providers.display_name — eşleşme yoksa null ("Eşleşmemiş") */
  display_name: string | null;
  /** 'aril' | 'gridbox' | null (yalnızca gruplama) */
  system_type: string | null;
  expected_period_hours: number | null;
  healthy_threshold_hours: number | null;
  warning_threshold_hours: number | null;
  last_ts: string | null;
  delay_hours: number | null;
  records_last_24h: number;
};

/** data_health_providers tablosu satırı (eşik editörü) */
export type DataHealthProvider = {
  id: string;
  provider_key: string;
  display_name: string;
  system_type: string | null;
  expected_period_hours: number;
  healthy_threshold_hours: number;
  warning_threshold_hours: number;
  created_at?: string;
  updated_at?: string;
};

export type HealthStatus =
  | "healthy"
  | "warning"
  | "problem"
  | "critical"
  | "nodata";

/** Eşleşmemiş tesisler için varsayılan eşikler (saat) */
export const DEFAULT_HEALTHY_HOURS = 24;
export const DEFAULT_WARNING_HOURS = 48;

export const STATUS_META: Record<
  HealthStatus,
  { label: string; emoji: string; dot: string; text: string; badgeBg: string }
> = {
  healthy: {
    label: "Sağlıklı",
    emoji: "🟢",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    badgeBg: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  warning: {
    label: "Dikkat",
    emoji: "🟡",
    dot: "bg-amber-400",
    text: "text-amber-700",
    badgeBg: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  problem: {
    label: "Sorunlu",
    emoji: "🔴",
    dot: "bg-red-500",
    text: "text-red-700",
    badgeBg: "bg-red-50 text-red-700 ring-1 ring-red-200",
  },
  critical: {
    label: "Kritik",
    emoji: "⚫",
    dot: "bg-neutral-800",
    text: "text-neutral-800",
    badgeBg: "bg-neutral-200 text-neutral-800 ring-1 ring-neutral-300",
  },
  nodata: {
    label: "Veri Yok",
    emoji: "⚪",
    dot: "bg-neutral-300",
    text: "text-neutral-500",
    badgeBg: "bg-neutral-50 text-neutral-500 ring-1 ring-neutral-200",
  },
};

/** Sıralama amaçlı önem derecesi (yüksek = daha kötü) */
export const STATUS_SEVERITY: Record<HealthStatus, number> = {
  nodata: 5,
  critical: 4,
  problem: 3,
  warning: 2,
  healthy: 1,
};

/** Bir tesisin eşleşmemiş (config satırı yok) olup olmadığı */
export function isUnmapped(row: ConsumptionHealthRow): boolean {
  return row.display_name == null;
}

/** Eşik değerleri — config yoksa varsayılanlara düşer */
export function effectiveThresholds(row: ConsumptionHealthRow): {
  healthy: number;
  warning: number;
  critical: number;
} {
  const healthy = row.healthy_threshold_hours ?? DEFAULT_HEALTHY_HOURS;
  const warning = row.warning_threshold_hours ?? DEFAULT_WARNING_HOURS;
  // Kritik: uyarı eşiğinin 3 katı (sağlayıcıya göre ölçeklenir)
  const critical = warning * 3;
  return { healthy, warning, critical };
}

/** Durum hesabı (istemci tarafı) */
export function computeStatus(row: ConsumptionHealthRow): HealthStatus {
  if (row.last_ts == null || row.delay_hours == null) return "nodata";
  const { healthy, warning, critical } = effectiveThresholds(row);
  const d = row.delay_hours;
  if (d >= critical) return "critical";
  if (d >= warning) return "problem";
  if (d >= healthy) return "warning";
  return "healthy";
}

/** Gecikmeyi insan-okur biçime çevir: "2 gün 4 saat", "8 saat", "35 dk" */
export function formatDelay(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  if (hours < 0) return "0 dk";
  const totalMinutes = Math.floor(hours * 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hrs = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days} gün ${hrs} saat`;
  if (hrs > 0) return `${hrs} saat`;
  return `${mins} dk`;
}

/** "DD.MM.YYYY HH:mm" (Europe/Istanbul) */
export function formatTsTR(ts: string | null): string {
  if (!ts) return "—";
  return dayjsTR(ts).format("DD.MM.YYYY HH:mm");
}

/** Beklenen periyot: "2 saat" / "24 saat" */
export function formatPeriod(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  return `${Number(hours).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} saat`;
}

/** Provider etiketi: display_name varsa onu, yoksa "Eşleşmemiş" */
export function providerLabel(row: ConsumptionHealthRow): string {
  if (row.display_name) return row.display_name;
  if (row.provider_key) return `${row.provider_key} · Eşleşmemiş`;
  return "Eşleşmemiş";
}
