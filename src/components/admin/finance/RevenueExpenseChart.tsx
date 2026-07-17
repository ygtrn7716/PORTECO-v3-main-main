// src/components/admin/finance/RevenueExpenseChart.tsx
// Son 6 ay gelir-gider. GERÇEKLEŞEN ödeme/gider çizer — monthly_fee'ye hiç bakmaz,
// dolayısıyla "ücret geçmişi tutulmuyor" sadeleştirmesinden etkilenmez.

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_COLORS,
  fmtTry,
  lastNMonths,
  monthShortLabelTR,
  type FinanceExpense,
  type FinancePayment,
  type MonthStr,
} from "@/lib/finance";
import { WINDOW_MONTHS } from "./useFinanceData";

const GRID = "#E5E7EB";

export default function RevenueExpenseChart({
  anchorMonth,
  payments,
  expenses,
}: {
  anchorMonth: MonthStr;
  payments: FinancePayment[];
  expenses: FinanceExpense[];
}) {
  const data = useMemo(() => {
    // ÖNCE iskelet: ödemesi de gideri de olmayan ay satır üretmez ve grafik 6 yerine
    // 4 bar çizip yanıltıcı bir trend gösterirdi.
    const months = lastNMonths(anchorMonth, WINDOW_MONTHS);
    const rev = new Map<string, number>();
    const exp = new Map<string, number>();
    for (const p of payments) rev.set(p.period_month, (rev.get(p.period_month) ?? 0) + p.amount);
    for (const e of expenses) exp.set(e.period_month, (exp.get(e.period_month) ?? 0) + e.amount);
    return months.map((m) => ({
      label: monthShortLabelTR(m),
      gelir: rev.get(m) ?? 0,
      gider: exp.get(m) ?? 0,
    }));
  }, [anchorMonth, payments, expenses]);

  const bosMu = data.every((d) => d.gelir === 0 && d.gider === 0);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="text-sm font-semibold text-neutral-900">Son 6 Ay Gelir - Gider</div>
      <div className="text-xs text-neutral-500">Gerçekleşen tahsilat ve giderler</div>

      <div className="mt-3 h-[300px] w-full">
        {bosMu ? (
          <div className="grid h-full place-items-center text-sm text-neutral-500">
            Bu dönem için veri bulunamadı.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v) => fmtTry(v)} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any, n: any) => [fmtTry(Number(v), 2), n]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="gelir" name="Gelir" fill={CHART_COLORS.revenue} radius={[8, 8, 0, 0]} />
              <Bar dataKey="gider" name="Gider" fill={CHART_COLORS.expense} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
