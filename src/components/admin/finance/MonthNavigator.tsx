// src/components/admin/finance/MonthNavigator.tsx
// Ortak ay navigatörü: ‹ Temmuz 2026 › + "Bugüne dön".
// Değer DAİMA MonthStr ("YYYY-MM-01") string'i — dayjs nesnesi tutulmaz (bkz. finance.ts başlığı).

import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { addMonths, currentMonthTR, monthLabelTR, type MonthStr } from "@/lib/finance";

export default function MonthNavigator({
  value,
  onChange,
}: {
  value: MonthStr;
  onChange: (m: MonthStr) => void;
}) {
  const isCurrent = value === currentMonthTR();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(addMonths(value, -1))}
        className="rounded-lg border p-1.5 text-neutral-600 hover:bg-neutral-50"
        aria-label="Önceki ay"
      >
        <ChevronLeft size={16} />
      </button>

      <div className="flex min-w-[10rem] items-center justify-center gap-1.5 text-sm font-semibold text-neutral-900">
        <CalendarDays size={14} className="text-neutral-400" />
        {monthLabelTR(value)}
      </div>

      <button
        type="button"
        onClick={() => onChange(addMonths(value, 1))}
        className="rounded-lg border p-1.5 text-neutral-600 hover:bg-neutral-50"
        aria-label="Sonraki ay"
      >
        <ChevronRight size={16} />
      </button>

      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonthTR())}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Bugüne dön
        </button>
      )}
    </div>
  );
}
