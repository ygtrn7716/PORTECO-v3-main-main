// src/components/admin/finance/TemplateFormModal.tsx
// Sabit gider şablonu ekle / düzenle.

import { useState } from "react";
import Modal from "@/components/admin/dataHealth/Modal";
import { supabase } from "@/lib/supabase";
import {
  CATEGORY_OPTIONS,
  EXPENSE_CATEGORY_META,
  type ExpenseCategory,
  type FinanceExpenseTemplate,
} from "@/lib/finance";
import { errMsg } from "./useFinanceData";
import { Field, ModalActions, ModalError, inputCls, parseAmount } from "./formFields";

export default function TemplateFormModal({
  template,
  onClose,
  onSaved,
}: {
  template?: FinanceExpenseTemplate;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = template != null;

  const [title, setTitle] = useState(template?.title ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(template?.category ?? "diger");
  const [amount, setAmount] = useState(template ? String(template.amount) : "");
  const [active, setActive] = useState(template?.active ?? true);
  const [note, setNote] = useState(template?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    if (!title.trim()) return setMsg("Başlık zorunlu.");
    const amt = parseAmount(amount);
    if (amt == null || amt < 0) return setMsg("Tutar geçerli bir sayı olmalı (0 veya üzeri).");

    const payload = {
      title: title.trim(),
      category,
      amount: amt,
      active,
      note: note.trim() || null,
    };

    setBusy(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from("finance_expense_templates")
          .update(payload)
          .eq("id", template!.id);
        if (error) throw error;
        onSaved("Şablon güncellendi.");
      } else {
        const { error } = await supabase.from("finance_expense_templates").insert(payload);
        if (error) throw error;
        onSaved("Şablon eklendi.");
      }
    } catch (e) {
      setMsg(errMsg(e, "Şablon kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isEdit ? "Şablonu Düzenle" : "Sabit Gider Şablonu Ekle"}
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
              placeholder="örn. Sunucu kirası"
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

        <div className="sm:col-span-2">
          <Field label="Not">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Aktif — “Sabit giderleri bu aya uygula” bu şablonu da ekler
          </label>
        </div>
      </div>

      <ModalActions onCancel={onClose} onSave={save} busy={busy} />
    </Modal>
  );
}
