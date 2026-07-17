// src/components/admin/finance/ExpenseFormModal.tsx
// Gider ekle / düzenle.

import { useState } from "react";
import Modal from "@/components/admin/dataHealth/Modal";
import { supabase } from "@/lib/supabase";
import {
  monthLabelTR,
  CATEGORY_OPTIONS,
  EXPENSE_CATEGORY_META,
  type ExpenseCategory,
  type FinanceExpense,
  type MonthStr,
} from "@/lib/finance";
import { errMsg } from "./useFinanceData";
import {
  Field,
  ModalActions,
  ModalError,
  dateToInput,
  inputCls,
  inputToMonth,
  monthToInput,
  parseAmount,
} from "./formFields";

export default function ExpenseFormModal({
  expense,
  periodMonth,
  onClose,
  onSaved,
}: {
  /** Verilirse düzenleme, verilmezse ekleme. */
  expense?: FinanceExpense;
  periodMonth: MonthStr;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = expense != null;

  const [title, setTitle] = useState(expense?.title ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "diger");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [period, setPeriod] = useState(monthToInput(expense?.period_month ?? periodMonth));
  const [expenseDate, setExpenseDate] = useState(dateToInput(expense?.expense_date ?? null));
  const [note, setNote] = useState(expense?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);

    if (!title.trim()) return setMsg("Başlık zorunlu.");
    const amt = parseAmount(amount);
    if (amt == null || amt < 0) return setMsg("Tutar geçerli bir sayı olmalı (0 veya üzeri).");
    const p = inputToMonth(period);
    if (!p) return setMsg("Dönem seçin.");

    const payload = {
      period_month: p,
      title: title.trim(),
      category,
      amount: amt,
      expense_date: expenseDate || null,
      note: note.trim() || null,
    };

    setBusy(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from("finance_expenses")
          .update(payload)
          .eq("id", expense!.id);
        if (error) throw error;
        onSaved("Gider güncellendi.");
      } else {
        const { error } = await supabase.from("finance_expenses").insert(payload);
        if (error) throw error;
        onSaved("Gider eklendi.");
      }
    } catch (e) {
      setMsg(errMsg(e, "Gider kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isEdit ? "Gideri Düzenle" : "Gider Ekle"}
      subtitle={
        isEdit && expense?.template_id
          ? "Bu gider bir sabit gider şablonundan üretildi."
          : undefined
      }
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <ModalError msg={msg} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Başlık" required>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="örn. Supabase Pro"
            />
          </Field>
        </div>

        <Field label="Kategori" required>
          <select
            className={inputCls}
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tutar (₺)" required>
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputCls}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <Field label="Dönem" required hint={period ? monthLabelTR(`${period}-01`) : undefined}>
          <input
            type="month"
            className={inputCls}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </Field>

        <Field
          label="Gider tarihi"
          hint="Dönemden farklı olabilir (ör. yıllık domain yenileme)."
        >
          <input
            type="date"
            className={inputCls}
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Not">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>

      <ModalActions onCancel={onClose} onSave={save} busy={busy} />
    </Modal>
  );
}
