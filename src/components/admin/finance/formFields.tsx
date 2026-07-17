// src/components/admin/finance/formFields.tsx
// Modallarda tekrar eden form parçaları. Projede <form> kullanılmaz — her şey onClick.

import type { MonthStr, DateStr } from "@/lib/finance";

export const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200";

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint != null && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

export function ModalError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
      {msg}
    </div>
  );
}

export function ModalActions({
  onCancel,
  onSave,
  busy,
  saveLabel = "Kaydet",
}: {
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-neutral-200 pt-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        Vazgeç
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {busy ? "Kaydediliyor…" : saveLabel}
      </button>
    </div>
  );
}

/* --- Ay <-> <input type="month"> dönüşümü ---------------------------------
   <input type="month"> "YYYY-MM" verir/alır. Saf string işlemi kullanıyoruz:
   Date/dayjs'e uğramadığı için TZ kayması imkânsız (bkz. finance.ts başlığı). */

export function monthToInput(m: MonthStr | null): string {
  return m ? m.slice(0, 7) : "";
}

export function inputToMonth(v: string): MonthStr | null {
  return v ? `${v}-01` : null;
}

export function dateToInput(d: DateStr | null): string {
  return d ?? "";
}

/**
 * <input type="number"> .value'su tarayıcı tarafından nokta-ondalık normalize edilir;
 * kullanıcı "1.500,50" yazsa bile buraya geçerli bir sayı ya da "" gelir.
 * Yine de Number.isFinite ile son bir kez süzüyoruz (Tuzak #6).
 */
export function parseAmount(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
