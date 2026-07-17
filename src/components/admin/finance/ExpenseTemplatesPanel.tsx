// src/components/admin/finance/ExpenseTemplatesPanel.tsx
// Sabit gider şablonları CRUD paneli (Giderler sekmesinin alt bölümü).

import { Pencil, Plus, Trash2 } from "lucide-react";
import Badge from "./Badge";
import {
  fmtTry,
  EXPENSE_CATEGORY_META,
  type FinanceExpenseTemplate,
} from "@/lib/finance";

export default function ExpenseTemplatesPanel({
  templates,
  onAdd,
  onEdit,
  onDelete,
  onToggleActive,
  busy,
}: {
  templates: FinanceExpenseTemplate[];
  onAdd: () => void;
  onEdit: (t: FinanceExpenseTemplate) => void;
  onDelete: (t: FinanceExpenseTemplate) => void;
  onToggleActive: (t: FinanceExpenseTemplate) => void;
  busy: boolean;
}) {
  const aktifToplam = templates.filter((t) => t.active).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="rounded-2xl border bg-white">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Sabit Gider Şablonları</h2>
          <p className="text-xs text-neutral-500">
            Aktif şablonların aylık toplamı:{" "}
            <span className="font-medium tabular-nums">{fmtTry(aktifToplam, 2)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <Plus size={14} /> Şablon Ekle
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-neutral-500">
          Henüz sabit gider şablonu yok.
        </div>
      ) : (
        <ul>
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onToggleActive(t)}
                disabled={busy}
                title={t.active ? "Pasife al" : "Aktife al"}
                className="shrink-0 disabled:opacity-40"
              >
                <Badge
                  label={t.active ? "Aktif" : "Pasif"}
                  className={
                    t.active
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-300"
                  }
                />
              </button>

              <span
                className={`min-w-0 flex-1 truncate text-sm font-medium ${t.active ? "text-neutral-800" : "text-neutral-400"}`}
              >
                {t.title}
              </span>

              <Badge
                label={EXPENSE_CATEGORY_META[t.category].label}
                className="bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200"
              />

              <span
                className={`w-28 shrink-0 text-right text-sm font-semibold tabular-nums ${t.active ? "text-neutral-800" : "text-neutral-400"}`}
              >
                {fmtTry(t.amount, 2)}
              </span>

              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => onEdit(t)}
                  disabled={busy}
                  title="Düzenle"
                  className="rounded-lg border p-1.5 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(t)}
                  disabled={busy}
                  title="Sil"
                  className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
