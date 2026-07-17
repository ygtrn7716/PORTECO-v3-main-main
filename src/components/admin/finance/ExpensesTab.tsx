// src/components/admin/finance/ExpensesTab.tsx
// Giderler sekmesi: seçili ayın giderleri + sabit gider şablonları paneli.

import { CopyPlus, Pencil, Plus, Trash2 } from "lucide-react";
import Badge from "./Badge";
import ExpenseTemplatesPanel from "./ExpenseTemplatesPanel";
import {
  fmtTry,
  formatDateTR,
  monthLabelTR,
  EXPENSE_CATEGORY_META,
  type FinanceExpense,
  type FinanceExpenseTemplate,
  type MonthStr,
} from "@/lib/finance";

export default function ExpensesTab({
  monthExpenses,
  templates,
  anchorMonth,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  onApplyTemplates,
  onAddTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onToggleTemplateActive,
  busy,
}: {
  monthExpenses: FinanceExpense[];
  templates: FinanceExpenseTemplate[];
  anchorMonth: MonthStr;
  onAddExpense: () => void;
  onEditExpense: (e: FinanceExpense) => void;
  onDeleteExpense: (e: FinanceExpense) => void;
  onApplyTemplates: () => void;
  onAddTemplate: () => void;
  onEditTemplate: (t: FinanceExpenseTemplate) => void;
  onDeleteTemplate: (t: FinanceExpenseTemplate) => void;
  onToggleTemplateActive: (t: FinanceExpenseTemplate) => void;
  busy: boolean;
}) {
  const toplam = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const aktifSablon = templates.filter((t) => t.active).length;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              {monthLabelTR(anchorMonth)} Giderleri
            </h2>
            <p className="text-xs text-neutral-500">
              {monthExpenses.length} kayıt · Toplam:{" "}
              <span className="font-semibold tabular-nums text-neutral-700">
                {fmtTry(toplam, 2)}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onApplyTemplates}
              disabled={busy || aktifSablon === 0}
              title={
                aktifSablon === 0
                  ? "Aktif sabit gider şablonu yok"
                  : `${aktifSablon} aktif şablon bu aya eklenir (zaten eklenmişler atlanır)`
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              <CopyPlus size={14} /> Sabit giderleri bu aya uygula
            </button>
            <button
              type="button"
              onClick={onAddExpense}
              className="inline-flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              <Plus size={15} /> Gider Ekle
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="border-b px-4 py-3 text-left font-medium">Başlık</th>
                <th className="border-b px-4 py-3 text-left font-medium">Kategori</th>
                <th className="border-b px-4 py-3 text-right font-medium">Tutar</th>
                <th className="border-b px-4 py-3 text-left font-medium">Tarih</th>
                <th className="border-b px-4 py-3 text-left font-medium">Not</th>
                <th className="border-b px-4 py-3 text-right font-medium">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {monthExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                    {monthLabelTR(anchorMonth)} için gider kaydı yok.
                  </td>
                </tr>
              ) : (
                monthExpenses.map((e) => (
                  <tr key={e.id} className="border-b last:border-b-0 hover:bg-neutral-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-neutral-800">{e.title}</span>
                        {e.template_id && (
                          <Badge
                            label="sabit"
                            title="Sabit gider şablonundan üretildi"
                            className="bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={EXPENSE_CATEGORY_META[e.category].label}
                        className="bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {fmtTry(e.amount, 2)}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{formatDateTR(e.expense_date)}</td>
                    <td className="px-4 py-3 text-neutral-500">
                      <span className="line-clamp-1">{e.note ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEditExpense(e)}
                          disabled={busy}
                          title="Düzenle"
                          className="rounded-lg border p-1.5 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteExpense(e)}
                          disabled={busy}
                          title="Sil"
                          className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ExpenseTemplatesPanel
        templates={templates}
        onAdd={onAddTemplate}
        onEdit={onEditTemplate}
        onDelete={onDeleteTemplate}
        onToggleActive={onToggleTemplateActive}
        busy={busy}
      />
    </div>
  );
}
