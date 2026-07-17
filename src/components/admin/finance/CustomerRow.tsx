// src/components/admin/finance/CustomerRow.tsx
// Müşteriler tablosunun bir satırı + genişletilmiş "son 12 ödeme" bloğu.
// Kendi fetch'ini yapmaz — genişletme isteğini yukarı bildirir (cache sayfa seviyesinde durur).

import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import Badge from "./Badge";
import {
  dueDateOf,
  fmtTry,
  formatDateTR,
  getPaymentStatus,
  isOverdue,
  monthLabelTR,
  sumPaid,
  PAYMENT_METHOD_META,
  PAYMENT_STATUS_META,
  STATUS_META,
  type DateStr,
  type FinanceAccount,
  type FinancePayment,
  type MonthStr,
} from "@/lib/finance";

export default function CustomerRow({
  account,
  paymentsThisMonth,
  allWindowPayments,
  anchorMonth,
  today,
  expanded,
  expandedPayments,
  expandedLoading,
  onToggle,
  onRecordPayment,
  onEdit,
  onDeletePayment,
  busy,
}: {
  account: FinanceAccount;
  paymentsThisMonth: FinancePayment[];
  /** Bu hesabın 6 aylık penceredeki tüm ödemeleri — "Son Ödeme" kolonu için. */
  allWindowPayments: FinancePayment[];
  anchorMonth: MonthStr;
  today: DateStr;
  expanded: boolean;
  expandedPayments?: FinancePayment[];
  expandedLoading: boolean;
  onToggle: () => void;
  onRecordPayment: () => void;
  onEdit: () => void;
  onDeletePayment: (p: FinancePayment) => void;
  busy: boolean;
}) {
  const st = getPaymentStatus(account, paymentsThisMonth, anchorMonth, today);
  const gecikmis = isOverdue(account, paymentsThisMonth, anchorMonth, today);
  const tahsilat = sumPaid(paymentsThisMonth);
  const kapsamDisi = st === "kapsam_disi";

  const sonOdeme = allWindowPayments.reduce<string | null>(
    (acc, p) => (acc == null || p.paid_at > acc ? p.paid_at : acc),
    null,
  );

  return (
    <>
      <tr
        className={`border-b last:border-b-0 hover:bg-neutral-50/70 ${gecikmis ? "bg-red-50/40" : ""}`}
      >
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1.5 text-left"
            aria-label={expanded ? "Daralt" : "Genişlet"}
          >
            {expanded ? (
              <ChevronDown size={14} className="shrink-0 text-neutral-400" />
            ) : (
              <ChevronRight size={14} className="shrink-0 text-neutral-400" />
            )}
            <span className="font-medium text-neutral-800">{account.display_name}</span>
          </button>
        </td>

        <td className="px-4 py-3">
          <Badge label={STATUS_META[account.status].label} className={STATUS_META[account.status].badge} />
        </td>

        <td className="px-4 py-3 text-right tabular-nums">{fmtTry(account.monthly_fee, 2)}</td>

        <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
          {account.payment_day ?? "Ay sonu"}
        </td>

        <td className="px-4 py-3">
          {kapsamDisi ? (
            <span
              className="text-neutral-400"
              title={
                account.billing_start_month == null
                  ? "Faturalama başlangıç ayı yok (demo)."
                  : `Bu ay faturalama penceresi dışında (başlangıç: ${monthLabelTR(account.billing_start_month)}${account.billing_end_month ? `, bitiş: ${monthLabelTR(account.billing_end_month)}` : ""}).`
              }
            >
              —
            </span>
          ) : (
            <Badge
              label={PAYMENT_STATUS_META[st].label}
              className={PAYMENT_STATUS_META[st].badge}
              title={
                gecikmis
                  ? `Vade ${formatDateTR(dueDateOf(account, anchorMonth))} — geçti`
                  : `Vade ${formatDateTR(dueDateOf(account, anchorMonth))}`
              }
            />
          )}
        </td>

        <td className="px-4 py-3 text-right tabular-nums">
          {tahsilat > 0 ? fmtTry(tahsilat, 2) : <span className="text-neutral-400">—</span>}
        </td>

        <td
          className="px-4 py-3 text-neutral-600"
          title="Yüklü 6 aylık pencere içindeki en güncel tahsilat"
        >
          {sonOdeme ? formatDateTR(sonOdeme) : <span className="text-neutral-400">—</span>}
        </td>

        <td className="px-4 py-3">
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={onRecordPayment}
              disabled={busy}
              title="Ödeme kaydet"
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              <Plus size={13} /> Ödeme
            </button>
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              title="Düzenle"
              className="rounded-lg border p-1.5 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
            >
              <Pencil size={13} />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b bg-neutral-50/60 last:border-b-0">
          <td colSpan={8} className="px-4 py-3">
            {expandedLoading ? (
              <div className="text-sm text-neutral-500">Yükleniyor…</div>
            ) : !expandedPayments || expandedPayments.length === 0 ? (
              <div className="text-sm text-neutral-500">Bu müşteride kayıtlı tahsilat yok.</div>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Son {expandedPayments.length} ödeme
                  </div>
                  <div className="text-xs text-neutral-600">
                    Toplam:{" "}
                    <span className="font-semibold tabular-nums">
                      {fmtTry(sumPaid(expandedPayments), 2)}
                    </span>
                  </div>
                </div>
                <ul className="space-y-1">
                  {expandedPayments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2"
                    >
                      <span className="w-28 shrink-0 text-xs font-medium text-neutral-700">
                        {monthLabelTR(p.period_month)}
                      </span>
                      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-neutral-800">
                        {fmtTry(p.amount, 2)}
                      </span>
                      <span className="w-24 shrink-0 text-xs text-neutral-500">
                        {formatDateTR(p.paid_at)}
                      </span>
                      <span className="w-24 shrink-0 text-xs text-neutral-500">
                        {PAYMENT_METHOD_META[p.method].label}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
                        {p.note ?? ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeletePayment(p)}
                        disabled={busy}
                        title="Ödemeyi sil"
                        className="shrink-0 rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
