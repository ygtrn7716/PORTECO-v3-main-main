// src/components/admin/finance/CustomersTab.tsx
// Müşteriler sekmesi: filtre çipleri + tablo. Modal orkestrasyonu sayfada.

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import CustomerRow from "./CustomerRow";
import {
  getPaymentStatus,
  isMonthInBillingWindow,
  STATUS_META,
  STATUS_OPTIONS,
  type DateStr,
  type FinanceAccount,
  type FinancePayment,
  type FinanceStatus,
  type MonthStr,
} from "@/lib/finance";

type Filter = "all" | FinanceStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tümü" },
  ...STATUS_OPTIONS.map((s) => ({ key: s as Filter, label: STATUS_META[s].label })),
];

export default function CustomersTab({
  accounts,
  payments,
  paymentsByAccount,
  anchorMonth,
  today,
  expandedId,
  expandedPayments,
  expandedLoading,
  onToggleExpand,
  onAdd,
  onRecordPayment,
  onEdit,
  onDeletePayment,
  busy,
}: {
  accounts: FinanceAccount[];
  /** 6 aylık pencere — "Son Ödeme" kolonu için. */
  payments: FinancePayment[];
  paymentsByAccount: Map<string, FinancePayment[]>;
  anchorMonth: MonthStr;
  today: DateStr;
  expandedId: string | null;
  expandedPayments: Record<string, FinancePayment[]>;
  expandedLoading: string | null;
  onToggleExpand: (id: string) => void;
  onAdd: () => void;
  onRecordPayment: (a: FinanceAccount) => void;
  onEdit: (a: FinanceAccount) => void;
  onDeletePayment: (p: FinancePayment) => void;
  busy: boolean;
}) {
  // Kapsam dışı satırlar gürültü; varsayılan "Aktif".
  const [filter, setFilter] = useState<Filter>("active");

  const windowByAccount = useMemo(() => {
    const m = new Map<string, FinancePayment[]>();
    for (const p of payments) {
      const arr = m.get(p.account_id) ?? [];
      arr.push(p);
      m.set(p.account_id, arr);
    }
    return m;
  }, [payments]);

  const rows = useMemo(() => {
    const list = filter === "all" ? accounts : accounts.filter((a) => a.status === filter);
    // Kapsam dışı olanlar en sona.
    return [...list].sort((a, b) => {
      const ai = isMonthInBillingWindow(a, anchorMonth, today) ? 0 : 1;
      const bi = isMonthInBillingWindow(b, anchorMonth, today) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return a.display_name.localeCompare(b.display_name, "tr");
    });
  }, [accounts, filter, anchorMonth, today]);

  const sayilar = useMemo(() => {
    const m = new Map<Filter, number>([["all", accounts.length]]);
    for (const s of STATUS_OPTIONS) m.set(s, accounts.filter((a) => a.status === s).length);
    return m;
  }, [accounts]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                filter === f.key
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{sayilar.get(f.key) ?? 0}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          <Plus size={15} /> Müşteri Ekle
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="border-b px-4 py-3 text-left font-medium">Müşteri</th>
                <th className="border-b px-4 py-3 text-left font-medium">Durum</th>
                <th className="border-b px-4 py-3 text-right font-medium">Aylık Ücret</th>
                <th className="border-b px-4 py-3 text-right font-medium">Ödeme Günü</th>
                <th className="border-b px-4 py-3 text-left font-medium">Seçili Ay</th>
                <th className="border-b px-4 py-3 text-right font-medium">Bu Ay Tahsilat</th>
                <th className="border-b px-4 py-3 text-left font-medium">Son Ödeme</th>
                <th className="border-b px-4 py-3 text-right font-medium">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-neutral-500">
                    {accounts.length === 0
                      ? "Henüz müşteri eklenmemiş."
                      : "Bu filtreye uyan müşteri yok."}
                  </td>
                </tr>
              ) : (
                rows.map((a) => (
                  <CustomerRow
                    key={a.id}
                    account={a}
                    paymentsThisMonth={paymentsByAccount.get(a.id) ?? []}
                    allWindowPayments={windowByAccount.get(a.id) ?? []}
                    anchorMonth={anchorMonth}
                    today={today}
                    expanded={expandedId === a.id}
                    expandedPayments={expandedPayments[a.id]}
                    expandedLoading={expandedLoading === a.id}
                    onToggle={() => onToggleExpand(a.id)}
                    onRecordPayment={() => onRecordPayment(a)}
                    onEdit={() => onEdit(a)}
                    onDeletePayment={onDeletePayment}
                    busy={busy}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rows.some((a) => getPaymentStatus(a, paymentsByAccount.get(a.id) ?? [], anchorMonth, today) === "kapsam_disi") && (
        <p className="text-xs text-neutral-500">
          “—” işaretli satırlar seçili ayda faturalama penceresi dışında (demo ya da o ay henüz
          başlamamış/kapanmış hesap).
        </p>
      )}
    </div>
  );
}
