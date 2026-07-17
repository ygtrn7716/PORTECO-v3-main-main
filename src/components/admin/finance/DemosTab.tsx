// src/components/admin/finance/DemosTab.tsx
// Sadece status='demo' hesaplar, kalan güne göre artan. demo_end yoksa (null) en sona.

import { useMemo } from "react";
import { ArrowRightCircle } from "lucide-react";
import Badge from "./Badge";
import {
  demoUrgency,
  formatDateTR,
  getDemoDaysLeft,
  DEMO_URGENCY_META,
  type DateStr,
  type FinanceAccount,
} from "@/lib/finance";

export default function DemosTab({
  accounts,
  today,
  onConvert,
  busy,
}: {
  accounts: FinanceAccount[];
  today: DateStr;
  onConvert: (a: FinanceAccount) => void;
  busy: boolean;
}) {
  const rows = useMemo(
    () =>
      accounts
        .filter((a) => a.status === "demo")
        .map((a) => ({ a, kalanGun: getDemoDaysLeft(a.demo_end, today) }))
        // null (süre belirsiz) asla 0 gibi kırmızı bölgeye düşmesin: en sona.
        .sort((x, y) => {
          if (x.kalanGun == null && y.kalanGun == null) return 0;
          if (x.kalanGun == null) return 1;
          if (y.kalanGun == null) return -1;
          return x.kalanGun - y.kalanGun;
        }),
    [accounts, today],
  );

  return (
    <div className="overflow-hidden rounded-2xl border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="border-b px-4 py-3 text-left font-medium">Müşteri</th>
              <th className="border-b px-4 py-3 text-left font-medium">Demo Başlangıç</th>
              <th className="border-b px-4 py-3 text-left font-medium">Demo Bitiş</th>
              <th className="border-b px-4 py-3 text-left font-medium">Kalan Gün</th>
              <th className="border-b px-4 py-3 text-left font-medium">Not</th>
              <th className="border-b px-4 py-3 text-right font-medium">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                  Demo aşamasında müşteri yok.
                </td>
              </tr>
            ) : (
              rows.map(({ a, kalanGun }) => {
                const u = demoUrgency(kalanGun);
                return (
                  <tr key={a.id} className="border-b last:border-b-0 hover:bg-neutral-50/70">
                    <td className="px-4 py-3 font-medium text-neutral-800">{a.display_name}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDateTR(a.demo_start)}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDateTR(a.demo_end)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        label={
                          kalanGun == null
                            ? DEMO_URGENCY_META.unknown.label
                            : kalanGun < 0
                              ? `${Math.abs(kalanGun)} gün geçti`
                              : `${kalanGun} gün`
                        }
                        className={DEMO_URGENCY_META[u].badge}
                      />
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      <span className="line-clamp-1">{a.note ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => onConvert(a)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          <ArrowRightCircle size={13} /> Aktife Geçir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
