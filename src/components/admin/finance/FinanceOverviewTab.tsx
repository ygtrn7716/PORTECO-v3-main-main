// src/components/admin/finance/FinanceOverviewTab.tsx
// Özet sekmesi — saf türetme, kendi fetch'i yok.

import { useMemo } from "react";
import KpiCard from "./KpiCard";
import RevenueExpenseChart from "./RevenueExpenseChart";
import UpcomingPanel from "./UpcomingPanel";
import {
  demoUrgency,
  expectedRevenue,
  fmtTry,
  getDemoDaysLeft,
  isOverdue,
  monthLabelTR,
  mrr,
  outstandingOf,
  SOON_DAYS,
  type DateStr,
  type FinanceAccount,
  type FinanceExpense,
  type FinancePayment,
  type MonthStr,
} from "@/lib/finance";

export default function FinanceOverviewTab({
  accounts,
  payments,
  expenses,
  monthPayments,
  monthExpenses,
  paymentsByAccount,
  anchorMonth,
  today,
  onGoToday,
}: {
  accounts: FinanceAccount[];
  /** 6 aylık pencere — grafik için. */
  payments: FinancePayment[];
  expenses: FinanceExpense[];
  /** Seçili ay dilimi. */
  monthPayments: FinancePayment[];
  monthExpenses: FinanceExpense[];
  paymentsByAccount: Map<string, FinancePayment[]>;
  anchorMonth: MonthStr;
  today: DateStr;
  onGoToday: () => void;
}) {
  const k = useMemo(() => {
    const beklenen = expectedRevenue(accounts, anchorMonth, today);
    const tahsilat = monthPayments.reduce((s, p) => s + p.amount, 0);
    const gider = monthExpenses.reduce((s, e) => s + e.amount, 0);

    // Bekleyen/Geciken ayrımı ROZETE göre değil TUTARA göre: rozete göre bölseydik
    // "geciken kısmi" hiçbir kovaya düşmez, toplam sessizce eksik çıkardı.
    let bekleyen = 0;
    let geciken = 0;
    for (const a of accounts) {
      const pays = paymentsByAccount.get(a.id) ?? [];
      const kalan = outstandingOf(a, pays, anchorMonth, today);
      if (kalan <= 0) continue;
      if (isOverdue(a, pays, anchorMonth, today)) geciken += kalan;
      else bekleyen += kalan;
    }

    const aktifSayi = accounts.filter((a) => a.status === "active").length;
    const demolar = accounts.filter((a) => a.status === "demo");
    const acilDemo = demolar.filter((a) => {
      const g = getDemoDaysLeft(a.demo_end, today);
      const u = demoUrgency(g);
      return u === "expired" || u === "critical" || u === "warning";
    }).length;

    return {
      beklenen,
      tahsilat,
      gider,
      bekleyen,
      geciken,
      net: tahsilat - gider,
      mrrDegeri: mrr(accounts),
      aktifSayi,
      demoSayi: demolar.length,
      acilDemo,
    };
  }, [accounts, monthPayments, monthExpenses, paymentsByAccount, anchorMonth, today]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Beklenen Gelir"
          value={fmtTry(k.beklenen)}
          sub={`${monthLabelTR(anchorMonth)} · faturalanabilir hesaplar`}
        />
        <KpiCard
          label="Tahsilat"
          value={fmtTry(k.tahsilat)}
          tone={k.tahsilat > 0 ? "good" : "neutral"}
          sub={
            k.beklenen > 0
              ? `Beklenenin %${Math.round((k.tahsilat / k.beklenen) * 100)}'i`
              : "—"
          }
        />
        <KpiCard
          label="Bekleyen"
          value={fmtTry(k.bekleyen)}
          tone={k.bekleyen > 0 ? "warn" : "neutral"}
          sub="Vadesi henüz geçmemiş bakiye"
        />
        <KpiCard
          label="Geciken"
          value={fmtTry(k.geciken)}
          tone={k.geciken > 0 ? "bad" : "neutral"}
          sub="Vadesi geçmiş bakiye"
        />
        <KpiCard
          label="Gider Toplamı"
          value={fmtTry(k.gider)}
          sub={`${monthExpenses.length} kayıt`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Net (Tahsilat − Gider)"
          value={fmtTry(k.net)}
          tone={k.net > 0 ? "good" : k.net < 0 ? "bad" : "neutral"}
        />
        <KpiCard label="MRR" value={fmtTry(k.mrrDegeri)} sub="Aktif hesapların aylık ücreti" />
        <KpiCard label="Aktif Müşteri" value={k.aktifSayi} />
        <KpiCard
          label="Demo"
          value={k.demoSayi}
          tone={k.acilDemo > 0 ? "warn" : "neutral"}
          sub={
            k.acilDemo > 0
              ? `${k.acilDemo} tanesinin ${SOON_DAYS} günden az süresi kaldı`
              : "Acil olan yok"
          }
        />
      </div>

      <RevenueExpenseChart anchorMonth={anchorMonth} payments={payments} expenses={expenses} />

      <UpcomingPanel
        accounts={accounts}
        paymentsByAccount={paymentsByAccount}
        anchorMonth={anchorMonth}
        today={today}
        onGoToday={onGoToday}
      />
    </div>
  );
}
