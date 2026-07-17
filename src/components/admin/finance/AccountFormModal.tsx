// src/components/admin/finance/AccountFormModal.tsx
// Müşteri ekle (create) ve düzenle (edit) — alan setleri kullanıcı seçicisi dışında aynı.

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/admin/dataHealth/Modal";
import { supabase } from "@/lib/supabase";
import {
  currentMonthTR,
  monthLabelTR,
  todayTR,
  STATUS_META,
  STATUS_OPTIONS,
  type FinanceAccount,
  type FinanceStatus,
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

type UserOption = { user_id: string; label: string };

export default function AccountFormModal({
  mode,
  account,
  existingUserIds,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  account?: FinanceAccount;
  existingUserIds: Set<string>;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(mode === "create");
  const [userId, setUserId] = useState("");

  const [displayName, setDisplayName] = useState(account?.display_name ?? "");
  const [status, setStatus] = useState<FinanceStatus>(account?.status ?? "demo");
  const [monthlyFee, setMonthlyFee] = useState(String(account?.monthly_fee ?? 0));
  const [paymentDay, setPaymentDay] = useState(
    account?.payment_day != null ? String(account.payment_day) : "",
  );
  // Varsayılan demo tarihleri SADECE ekleme modunda. Düzenlemede `?? todayTR()` yazsaydık,
  // demo_start'ı null olan bir hesabı (ör. hiç demo olmamış aktif müşteri) açıp kaydetmek
  // ona sessizce demo tarihleri damgalardı.
  const [demoStart, setDemoStart] = useState(
    mode === "create" ? todayTR() : dateToInput(account?.demo_start ?? null),
  );
  const [demoEnd, setDemoEnd] = useState(
    mode === "create" ? plus30(todayTR()) : dateToInput(account?.demo_end ?? null),
  );
  const [billingStart, setBillingStart] = useState(monthToInput(account?.billing_start_month ?? null));
  const [billingEnd, setBillingEnd] = useState(monthToInput(account?.billing_end_month ?? null));
  const [note, setNote] = useState(account?.note ?? "");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const feeChanged =
    mode === "edit" && account != null && parseAmount(monthlyFee) !== account.monthly_fee;

  // Kullanıcı listesi: user_integrations'ta bir kullanıcının BİRDEN FAZLA satırı olabilir
  // (farklı provider). Dedup edilmezse aynı müşteri iki kez listelenir ve ikincisini seçmek
  // finance_accounts.user_id unique kısıtını patlatır.
  useEffect(() => {
    if (mode !== "create") return;
    let cancel = false;
    (async () => {
      setUsersLoading(true);
      const { data, error } = await supabase
        .from("user_integrations")
        .select("user_id, aril_user")
        .order("aril_user", { ascending: true })
        .limit(5000);
      if (cancel) return;
      if (error) {
        setMsg(error.message);
        setUsersLoading(false);
        return;
      }
      const byUser = new Map<string, string[]>();
      for (const r of (data ?? []) as { user_id: string; aril_user: string | null }[]) {
        const uid = String(r.user_id);
        const arr = byUser.get(uid) ?? [];
        if (r.aril_user) arr.push(r.aril_user);
        byUser.set(uid, arr);
      }
      const opts: UserOption[] = [...byUser.entries()]
        .filter(([uid]) => !existingUserIds.has(uid))
        .map(([uid, labels]) => ({
          user_id: uid,
          label:
            labels.length === 0
              ? uid
              : labels.length === 1
                ? labels[0]
                : `${labels[0]} (+${labels.length - 1} hesap)`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "tr"));
      setUsers(opts);
      setUsersLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [mode, existingUserIds]);

  const selectedUser = useMemo(
    () => users.find((u) => u.user_id === userId),
    [users, userId],
  );

  // Kullanıcı seçilince görünen adı otomatik doldur (kullanıcı sonradan değiştirebilir).
  useEffect(() => {
    if (mode === "create" && selectedUser && !displayName.trim()) {
      setDisplayName(selectedUser.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser]);

  async function save() {
    setMsg(null);

    if (mode === "create" && !userId) return setMsg("Kullanıcı seçin.");
    if (!displayName.trim()) return setMsg("Görünen ad zorunlu.");

    const fee = parseAmount(monthlyFee);
    if (fee == null || fee < 0) return setMsg("Aylık ücret geçerli bir sayı olmalı (0 veya üzeri).");

    let day: number | null = null;
    if (paymentDay.trim()) {
      const d = parseAmount(paymentDay);
      if (d == null || !Number.isInteger(d) || d < 1 || d > 31)
        return setMsg("Ödeme günü 1-31 arasında bir tam sayı olmalı.");
      day = d;
    }

    const bStart = inputToMonth(billingStart);
    const bEnd = inputToMonth(billingEnd);

    // DB'de de ck_finance_accounts_active_needs_billing_start var; formda erken yakalıyoruz ki
    // ham Postgres hatası yerine anlamlı mesaj görünsün.
    if (status === "active" && !bStart)
      return setMsg("Durum 'Aktif' ise faturalama başlangıç ayı zorunlu.");
    if (bStart && bEnd && bEnd < bStart)
      return setMsg("Faturalama bitiş ayı, başlangıç ayından önce olamaz.");

    const payload = {
      display_name: displayName.trim(),
      status,
      monthly_fee: fee,
      payment_day: day,
      demo_start: demoStart || null,
      demo_end: demoEnd || null,
      billing_start_month: bStart,
      billing_end_month: bEnd,
      note: note.trim() || null,
    };

    setBusy(true);
    try {
      if (mode === "create") {
        const { error } = await supabase
          .from("finance_accounts")
          .insert({ ...payload, user_id: userId });
        if (error) {
          // Liste bayatlamışsa (başka sekmede eklenmişse) unique kısıt patlar.
          if (error.code === "23505") throw new Error("Bu kullanıcı zaten ekli.");
          throw error;
        }
        onSaved("Müşteri eklendi.");
      } else {
        const { error } = await supabase
          .from("finance_accounts")
          .update(payload)
          .eq("id", account!.id);
        if (error) throw error;
        onSaved("Müşteri güncellendi.");
      }
    } catch (e) {
      setMsg(errMsg(e, "Kayıt başarısız"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Müşteri Ekle" : "Müşteriyi Düzenle"}
      subtitle={mode === "edit" ? account?.display_name : undefined}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <ModalError msg={msg} />

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "create" && (
          <div className="sm:col-span-2">
            <Field
              label="Kullanıcı"
              required
              hint={
                usersLoading
                  ? "Yükleniyor…"
                  : `${users.length} eklenebilir kullanıcı (zaten ekli olanlar listede yok)`
              }
            >
              <select
                className={inputCls}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={usersLoading}
              >
                <option value="">Kullanıcı seçin…</option>
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div className="sm:col-span-2">
          <Field label="Görünen ad" required>
            <input
              className={inputCls}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Müşteri adı"
            />
          </Field>
        </div>

        <Field label="Durum" required>
          <select
            className={inputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value as FinanceStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Aylık ücret (₺)"
          required
          hint={
            feeChanged ? (
              <span className="text-amber-700">
                Bu değişiklik geçmiş ayların ödeme rozetlerini etkiler.
              </span>
            ) : undefined
          }
        >
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputCls}
            value={monthlyFee}
            onChange={(e) => setMonthlyFee(e.target.value)}
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

        <Field
          label="Faturalama başlangıç ayı"
          required={status === "active"}
          hint={
            status === "active"
              ? "Aktif hesapta zorunlu. Bu aydan önceki aylar kapsam dışıdır."
              : "Demo hesapta boş bırakılır; aktife geçince doldurulur."
          }
        >
          <input
            type="month"
            className={inputCls}
            value={billingStart}
            onChange={(e) => setBillingStart(e.target.value)}
          />
        </Field>

        <Field
          label="Faturalama bitiş ayı"
          hint="Faturalanan SON ay. Hâlâ faturalanıyorsa boş bırakın."
        >
          <input
            type="month"
            className={inputCls}
            value={billingEnd}
            onChange={(e) => setBillingEnd(e.target.value)}
          />
        </Field>

        <Field label="Demo başlangıç">
          <input
            type="date"
            className={inputCls}
            value={demoStart}
            onChange={(e) => setDemoStart(e.target.value)}
          />
        </Field>

        <Field label="Demo bitiş">
          <input
            type="date"
            className={inputCls}
            value={demoEnd}
            onChange={(e) => setDemoEnd(e.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Not">
            <textarea
              className={inputCls}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {status === "active" && !billingStart && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
          Aktif hesap için faturalama başlangıç ayı gerekiyor. Öneri:{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => setBillingStart(monthToInput(currentMonthTR()))}
          >
            {monthLabelTR(currentMonthTR())}
          </button>
        </div>
      )}

      <ModalActions onCancel={onClose} onSave={save} busy={busy} />
    </Modal>
  );
}

/** Demo bitişi için varsayılan: bugün + 30 gün. Saf string işlemi değil, basit Date aritmetiği
 *  yeterli — sadece bir FORM VARSAYILANI, karşılaştırmaya girmiyor. */
function plus30(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 30);
  return dt.toISOString().slice(0, 10);
}
