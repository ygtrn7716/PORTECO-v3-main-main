// src/components/admin/finance/PaymentFormModal.tsx
// Ödeme kaydet. Aynı döneme birden fazla satır girilebilir = kısmi ödeme.

import { useState } from "react";
import Modal from "@/components/admin/dataHealth/Modal";
import { supabase } from "@/lib/supabase";
import {
  fmtTry,
  monthLabelTR,
  todayTR,
  METHOD_OPTIONS,
  PAYMENT_METHOD_META,
  type FinanceAccount,
  type MonthStr,
  type PaymentMethod,
} from "@/lib/finance";
import { errMsg } from "./useFinanceData";
import {
  Field,
  ModalActions,
  ModalError,
  inputCls,
  inputToMonth,
  monthToInput,
  parseAmount,
} from "./formFields";

export default function PaymentFormModal({
  account,
  periodMonth,
  defaultAmount,
  onClose,
  onSaved,
}: {
  account: FinanceAccount;
  periodMonth: MonthStr;
  /** Kalan bakiye; yoksa aylık ücret. */
  defaultAmount: number;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [period, setPeriod] = useState(monthToInput(periodMonth));
  const [amount, setAmount] = useState(String(defaultAmount || account.monthly_fee || ""));
  const [paidAt, setPaidAt] = useState(todayTR());
  const [method, setMethod] = useState<PaymentMethod>("havale");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);

    const p = inputToMonth(period);
    if (!p) return setMsg("Dönem seçin.");

    // DB'de check (amount > 0) var; burada anlamlı mesaj veriyoruz.
    const amt = parseAmount(amount);
    if (amt == null || amt <= 0) return setMsg("Tutar 0'dan büyük olmalı.");
    if (!paidAt) return setMsg("Ödeme tarihi zorunlu.");

    setBusy(true);
    try {
      const { error } = await supabase.from("finance_payments").insert({
        account_id: account.id,
        period_month: p,
        amount: amt,
        paid_at: paidAt,
        method,
        note: note.trim() || null,
      });
      if (error) throw error;
      onSaved(`${fmtTry(amt, 2)} tahsilat kaydedildi.`);
    } catch (e) {
      setMsg(errMsg(e, "Ödeme kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Ödeme Kaydet"
      subtitle={`${account.display_name} — aylık ücret ${fmtTry(account.monthly_fee, 2)}`}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <ModalError msg={msg} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Dönem"
          required
          hint={period ? monthLabelTR(`${period}-01`) : undefined}
        >
          <input
            type="month"
            className={inputCls}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </Field>

        <Field label="Tutar (₺)" required>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className={inputCls}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <Field label="Ödeme tarihi" required>
          <input
            type="date"
            className={inputCls}
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </Field>

        <Field label="Yöntem" required>
          <select
            className={inputCls}
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_META[m].label}
              </option>
            ))}
          </select>
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
