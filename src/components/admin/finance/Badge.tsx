// src/components/admin/finance/Badge.tsx
// Rozet primitifi. Renk mantığı burada DEĞİL — className daima finance.ts'teki *_META
// map'lerinden gelir (STATUS_META, PAYMENT_STATUS_META, DEMO_URGENCY_META).

export default function Badge({
  label,
  className,
  title,
}: {
  label: React.ReactNode;
  className: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {label}
    </span>
  );
}
