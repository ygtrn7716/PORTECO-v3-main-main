// src/components/admin/finance/KpiCard.tsx
// Özet sekmesinin KPI kartı.

type Tone = "neutral" | "good" | "warn" | "bad";

const TONE_CLS: Record<Tone, string> = {
  neutral: "text-neutral-900",
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-red-700",
};

export default function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${TONE_CLS[tone]}`}>{value}</div>
      {sub != null && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}
