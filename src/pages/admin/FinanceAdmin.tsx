// src/pages/admin/FinanceAdmin.tsx
// PortEco Finans Takip — TAMAMEN DAHİLİ gelir-gider takibi.
// Fatura kesme / PDF / müşteriye bildirim YOK; dört finance_* tablosu admin-only.
//
// Sayfa tüm state'i ve tüm mutasyonları sahiplenir; sekmeler saf sunum katmanıdır.
// Fetch SADECE anchorMonth'a bağlıdır — sekme/filtre değişimi network isteği doğurmaz.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import MonthNavigator from "@/components/admin/finance/MonthNavigator";
import FinanceOverviewTab from "@/components/admin/finance/FinanceOverviewTab";
import CustomersTab from "@/components/admin/finance/CustomersTab";
import DemosTab from "@/components/admin/finance/DemosTab";
import ExpensesTab from "@/components/admin/finance/ExpensesTab";
import AccountFormModal from "@/components/admin/finance/AccountFormModal";
import PaymentFormModal from "@/components/admin/finance/PaymentFormModal";
import ConvertDemoModal from "@/components/admin/finance/ConvertDemoModal";
import ExpenseFormModal from "@/components/admin/finance/ExpenseFormModal";
import TemplateFormModal from "@/components/admin/finance/TemplateFormModal";
import { errMsg, useFinanceData } from "@/components/admin/finance/useFinanceData";
import {
  currentMonthTR,
  normalizePayment,
  outstandingOf,
  todayTR,
  type FinanceAccount,
  type FinanceExpense,
  type FinanceExpenseTemplate,
  type FinancePayment,
  type MonthStr,
} from "@/lib/finance";

type Tab = "ozet" | "musteriler" | "demolar" | "giderler";

const TABS: { key: Tab; label: string }[] = [
  { key: "ozet", label: "Özet" },
  { key: "musteriler", label: "Müşteriler" },
  { key: "demolar", label: "Demolar" },
  { key: "giderler", label: "Giderler" },
];

type Row = Record<string, unknown>;

export default function FinanceAdmin() {
  // MonthStr string'i — dayjs nesnesi TUTULMAZ (sonsuz fetch döngüsü riski).
  const [anchorMonth, setAnchorMonth] = useState<MonthStr>(() => currentMonthTR());
  const [tab, setTab] = useState<Tab>("ozet");

  // today sabit tutulur: her render'da todayTR() çağırmak useMemo'ları boşuna geçersizleştirir.
  const [today] = useState(() => todayTR());

  const { accounts, payments, expenses, templates, loading, err, reload } =
    useFinanceData(anchorMonth);

  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Toast (projedeki ortak kalıp — kütüphane yok).
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  // Satır genişletme cache'i SAYFADA durur: sekmeler koşullu render edildiği için
  // CustomersTab'da tutulsaydı her sekme değişiminde çöpe giderdi.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPayments, setExpandedPayments] = useState<Record<string, FinancePayment[]>>({});
  const [expandedLoading, setExpandedLoading] = useState<string | null>(null);

  // Modallar
  const [accountModal, setAccountModal] = useState<
    { mode: "create" } | { mode: "edit"; account: FinanceAccount } | null
  >(null);
  const [paymentModal, setPaymentModal] = useState<FinanceAccount | null>(null);
  const [convertModal, setConvertModal] = useState<FinanceAccount | null>(null);
  const [expenseModal, setExpenseModal] = useState<{ expense?: FinanceExpense } | null>(null);
  const [templateModal, setTemplateModal] = useState<{ template?: FinanceExpenseTemplate } | null>(
    null,
  );

  /* --- Türetilmiş diliml er (satır başına filter = O(n²) olmasın diye bir kez) --- */

  const monthPayments = useMemo(
    () => payments.filter((p) => p.period_month === anchorMonth),
    [payments, anchorMonth],
  );
  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.period_month === anchorMonth),
    [expenses, anchorMonth],
  );
  const paymentsByAccount = useMemo(() => {
    const m = new Map<string, FinancePayment[]>();
    for (const p of monthPayments) {
      const arr = m.get(p.account_id) ?? [];
      arr.push(p);
      m.set(p.account_id, arr);
    }
    return m;
  }, [monthPayments]);

  const existingUserIds = useMemo(() => new Set(accounts.map((a) => a.user_id)), [accounts]);

  /* --- Son 12 ödeme: satır SAYISI, tarih aralığı değil → 6 aylık cache'ten servis edilemez --- */

  const loadAccountPayments = useCallback(async (accountId: string) => {
    setExpandedLoading(accountId);
    try {
      const { data, error } = await supabase
        .from("finance_payments")
        .select("*")
        .eq("account_id", accountId)
        .order("period_month", { ascending: false })
        .order("paid_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      setExpandedPayments((prev) => ({
        ...prev,
        [accountId]: ((data ?? []) as Row[]).map(normalizePayment),
      }));
    } catch (e) {
      setActionErr(errMsg(e, "Ödeme geçmişi yüklenemedi"));
    } finally {
      setExpandedLoading(null);
    }
  }, []);

  const toggleExpand = useCallback(
    (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (!expandedPayments[id]) void loadAccountPayments(id);
    },
    [expandedId, expandedPayments, loadAccountPayments],
  );

  /** Mutasyon sonrası: ana veri + açık satırın geçmişi tazelenir. Optimistic update yok. */
  const refreshAll = useCallback(async () => {
    await reload();
    if (expandedId) await loadAccountPayments(expandedId);
  }, [reload, expandedId, loadAccountPayments]);

  const afterSave = useCallback(
    async (msg: string) => {
      setAccountModal(null);
      setPaymentModal(null);
      setConvertModal(null);
      setExpenseModal(null);
      setTemplateModal(null);
      showToast(msg);
      await refreshAll();
    },
    [showToast, refreshAll],
  );

  /* --- Silme / toggle mutasyonları --- */

  async function deletePayment(p: FinancePayment) {
    if (!window.confirm("Bu tahsilat kaydını silmek istiyor musunuz?")) return;
    setBusy(true);
    setActionErr(null);
    try {
      const { error } = await supabase.from("finance_payments").delete().eq("id", p.id);
      if (error) throw error;
      showToast("Tahsilat silindi.");
      await refreshAll();
    } catch (e) {
      setActionErr(errMsg(e, "Tahsilat silinemedi"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpense(e: FinanceExpense) {
    if (!window.confirm(`"${e.title}" giderini silmek istiyor musunuz?`)) return;
    setBusy(true);
    setActionErr(null);
    try {
      const { error } = await supabase.from("finance_expenses").delete().eq("id", e.id);
      if (error) throw error;
      showToast("Gider silindi.");
      await reload();
    } catch (err2) {
      setActionErr(errMsg(err2, "Gider silinemedi"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(t: FinanceExpenseTemplate) {
    if (
      !window.confirm(
        `"${t.title}" şablonunu silmek istiyor musunuz?\n\nBu şablondan üretilmiş geçmiş giderler SİLİNMEZ; sadece şablon bağlantıları kopar.`,
      )
    )
      return;
    setBusy(true);
    setActionErr(null);
    try {
      const { error } = await supabase.from("finance_expense_templates").delete().eq("id", t.id);
      if (error) throw error;
      showToast("Şablon silindi.");
      await reload();
    } catch (e) {
      setActionErr(errMsg(e, "Şablon silinemedi"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleTemplateActive(t: FinanceExpenseTemplate) {
    setBusy(true);
    setActionErr(null);
    try {
      const { error } = await supabase
        .from("finance_expense_templates")
        .update({ active: !t.active })
        .eq("id", t.id);
      if (error) throw error;
      await reload();
    } catch (e) {
      setActionErr(errMsg(e, "Şablon güncellenemedi"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sabit giderleri seçili aya uygula — IDEMPOTENT.
   * ignoreDuplicates:true → ON CONFLICT DO NOTHING; .select() SADECE yeni eklenen satırları
   * döndürür, sayaç tam da bu. .select() zincirlenmezse data null olur ve sayaçlar bozulur.
   */
  async function applyTemplates() {
    const aktif = templates.filter((t) => t.active);
    if (aktif.length === 0) {
      showToast("Aktif sabit gider şablonu yok.");
      return;
    }
    setBusy(true);
    setActionErr(null);
    try {
      const rows = aktif.map((t) => ({
        period_month: anchorMonth,
        title: t.title,
        category: t.category,
        amount: t.amount,
        // Ayın 1'i — todayTR() DEĞİL: Temmuz şablonlarını 3 Ağustos'ta uygulamak
        // Temmuz giderine Ağustos tarihi damgalardı.
        expense_date: anchorMonth,
        template_id: t.id,
        note: t.note,
      }));
      const { data, error } = await supabase
        .from("finance_expenses")
        .upsert(rows, { onConflict: "template_id,period_month", ignoreDuplicates: true })
        .select();
      if (error) throw error;
      const eklenen = data?.length ?? 0;
      const atlanan = aktif.length - eklenen;
      showToast(`${eklenen} gider eklendi, ${atlanan} atlandı (zaten vardı).`);
      await reload();
    } catch (e) {
      setActionErr(errMsg(e, "Sabit giderler uygulanamadı"));
    } finally {
      setBusy(false);
    }
  }

  const goToday = useCallback(() => setAnchorMonth(currentMonthTR()), []);

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet size={22} className="text-neutral-700" />
          <div>
            <h1 className="text-xl font-semibold">Finans Takip</h1>
            <p className="text-sm text-neutral-500">
              Dahili gelir-gider takibi — müşteri ödemeleri, demo süreleri ve giderler.
            </p>
          </div>
        </div>
        <MonthNavigator value={anchorMonth} onChange={setAnchorMonth} />
      </div>

      {err && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}
      {actionErr && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{actionErr}</span>
          <button
            type="button"
            onClick={() => setActionErr(null)}
            className="shrink-0 font-medium underline"
          >
            Kapat
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-[#0A66FF] text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Yükleniyor…</p>
      ) : (
        <>
          {tab === "ozet" && (
            <FinanceOverviewTab
              accounts={accounts}
              payments={payments}
              expenses={expenses}
              monthPayments={monthPayments}
              monthExpenses={monthExpenses}
              paymentsByAccount={paymentsByAccount}
              anchorMonth={anchorMonth}
              today={today}
              onGoToday={goToday}
            />
          )}

          {tab === "musteriler" && (
            <CustomersTab
              accounts={accounts}
              payments={payments}
              paymentsByAccount={paymentsByAccount}
              anchorMonth={anchorMonth}
              today={today}
              expandedId={expandedId}
              expandedPayments={expandedPayments}
              expandedLoading={expandedLoading}
              onToggleExpand={toggleExpand}
              onAdd={() => setAccountModal({ mode: "create" })}
              onRecordPayment={(a) => setPaymentModal(a)}
              onEdit={(a) => setAccountModal({ mode: "edit", account: a })}
              onDeletePayment={deletePayment}
              busy={busy}
            />
          )}

          {tab === "demolar" && (
            <DemosTab
              accounts={accounts}
              today={today}
              onConvert={(a) => setConvertModal(a)}
              busy={busy}
            />
          )}

          {tab === "giderler" && (
            <ExpensesTab
              monthExpenses={monthExpenses}
              templates={templates}
              anchorMonth={anchorMonth}
              onAddExpense={() => setExpenseModal({})}
              onEditExpense={(e) => setExpenseModal({ expense: e })}
              onDeleteExpense={deleteExpense}
              onApplyTemplates={applyTemplates}
              onAddTemplate={() => setTemplateModal({})}
              onEditTemplate={(t) => setTemplateModal({ template: t })}
              onDeleteTemplate={deleteTemplate}
              onToggleTemplateActive={toggleTemplateActive}
              busy={busy}
            />
          )}
        </>
      )}

      {accountModal && (
        <AccountFormModal
          mode={accountModal.mode}
          account={accountModal.mode === "edit" ? accountModal.account : undefined}
          existingUserIds={existingUserIds}
          onClose={() => setAccountModal(null)}
          onSaved={afterSave}
        />
      )}

      {paymentModal && (
        <PaymentFormModal
          account={paymentModal}
          periodMonth={anchorMonth}
          defaultAmount={outstandingOf(
            paymentModal,
            paymentsByAccount.get(paymentModal.id) ?? [],
            anchorMonth,
            today,
          )}
          onClose={() => setPaymentModal(null)}
          onSaved={afterSave}
        />
      )}

      {convertModal && (
        <ConvertDemoModal
          account={convertModal}
          onClose={() => setConvertModal(null)}
          onSaved={afterSave}
        />
      )}

      {expenseModal && (
        <ExpenseFormModal
          expense={expenseModal.expense}
          periodMonth={anchorMonth}
          onClose={() => setExpenseModal(null)}
          onSaved={afterSave}
        />
      )}

      {templateModal && (
        <TemplateFormModal
          template={templateModal.template}
          onClose={() => setTemplateModal(null)}
          onSaved={afterSave}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
