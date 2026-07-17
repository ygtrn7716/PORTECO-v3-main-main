// src/components/admin/finance/ConvertDemoModal.tsx
// Demo -> Aktif. billing_end_month bu modale GİRMEZ: aktife geçen hesabın kapanış ayı olmaz.

import { useState } from "react";
import Modal from "@/components/admin/dataHealth/Modal";
import { supabase } from "@/lib/supabase";
import { currentMonthTR, monthLabelTR, type FinanceAccount } from "@/lib/finance";
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

export default function ConvertDemoModal({
  account,
  onClose,
  onSaved,
}: {
  account: FinanceAccount;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [monthlyFee, setMonthlyFee] = useState(
    account.monthly_fee > 0 ? String(account.monthly_fee) : "",
  );
  const [paymentDay, setPaymentDay] = useState(
    account.payment_day != null ? String(account.payment_day) : "",
  );
  const [billingStart, setBillingStart] = useState(
    monthToInput(account.billing_start_month ?? currentMonthTR()),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);

    const fee = parseAmount(monthlyFee);
    if (fee == null || fee <= 0) return setMsg("Aktife geçirmek için aylık ücret 0'dan büyük olmalı.");

    let day: number | null = null;
    if (paymentDay.trim()) {
      const d = parseAmount(paymentDay);
      if (d == null || !Number.isInteger(d) || d < 1 || d > 31)
        return setMsg("Ödeme günü 1-31 arasında bir tam sayı olmalı.");
      day = d;
    }

    const bStart = inputToMonth(billingStart);
    if (!bStart) return setMsg("Faturalama başlangıç ayı zorunlu.");

    setBusy(true);
    try {
      const { error } = await supabase
        .from("finance_accounts")
        .update({
          status: "active",
          monthly_fee: fee,
          payment_day: day,
          billing_start_month: bStart,
        })
        .eq("id", account.id);
      if (error) throw error;
      onSaved(`${account.display_name} aktife geçirildi.`);
    } catch (e) {
      setMsg(errMsg(e, "Aktife geçirilemedi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Aktife Geçir"
      subtitle={account.display_name}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <ModalError msg={msg} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Aylık ücret (₺)" required>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className={inputCls}
            value={monthlyFee}
            onChange={(e) => setMonthlyFee(e.target.value)}
            placeholder="örn. 1500"
          />
        </Field>

        <Field label="Ödeme günü" hint="Boş bırakılırsa ayın son günü vade sayılır.">
          <input
            type="number"
            min="1"
            max="31"
            step="1"
            className={inputCls}
            value={paymentDay}
            onChange={(e) => setPaymentDay(e.target.value)}
            placeholder="örn. 15"
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Faturalama başlangıç ayı"
            required
            hint={
              billingStart
                ? `${monthLabelTR(`${billingStart}-01`)} ve sonrası faturalanır; önceki aylar kapsam dışı kalır.`
                : undefined
            }
          >
            <input
              type="month"
              className={inputCls}
              value={billingStart}
              onChange={(e) => setBillingStart(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <ModalActions onCancel={onClose} onSave={save} busy={busy} saveLabel="Aktife Geçir" />
    </Modal>
  );
}
