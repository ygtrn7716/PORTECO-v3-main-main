// src/components/admin/finance/UpcomingPanel.tsx
// "Yaklaşanlar" — BUGÜNE göre çalışır, seçili aya göre değil.
//
// ⚠️ ÖDEME yarısı yalnızca ankraj CARİ AY iken hesaplanır. Sebep: fetch penceresi
// [anchorMonth-5, anchorMonth]. Ankraj geçmiş bir aydayken cari ayın ödemeleri pencereye hiç
// girmez; "bu ayı ödememiş" listesi veri yokluğunu ödememe sanıp HERKESİ listeler.
// (Ankraj Ocak 2026 → pencere [Ağu 25, Oca 26]; bugün Temmuz 26 → Temmuz ödemeleri yok.)
// Pencereyi genişletmek yerine bloğu gizliyoruz: ankrajdan bağımsız ikinci bir veri ekseni
// tek-fetch modelini bozardı.
// DEMO yarısı accounts + today'den gelir, pencereden bağımsızdır → her ankrajda doğru.

import { useMemo } from "react";
import { CalendarClock, Clock, TimerOff } from "lucide-react";
import Badge from "./Badge";
import {
  currentMonthTR,
  demoUrgency,
  diffDays,
  dueDateOf,
  fmtTry,
  formatDateTR,
  getDemoDaysLeft,
  getPaymentStatus,
  outstandingOf,
  DEMO_URGENCY_META,
  SOON_DAYS,
  type DateStr,
  type FinanceAccount,
  type FinancePayment,
  type MonthStr,
} from "@/lib/finance";

export default function UpcomingPanel({
  accounts,
  paymentsByAccount,
  anchorMonth,
  today,
  onGoToday,
}: {
  accounts: FinanceAccount[];
  /** Seçili ayın ödemeleri, account_id'ye göre gruplanmış. */
  paymentsByAccount: Map<string, FinancePayment[]>;
  anchorMonth: MonthStr;
  today: DateStr;
  onGoToday: () => void;
}) {
  const ankrajCariAy = anchorMonth === currentMonthTR();

  const yaklasanOdemeler = useMemo(() => {
    if (!ankrajCariAy) return [];
    return accounts
      .map((a) => {
        const pays = paymentsByAccount.get(a.id) ?? [];
        const st = getPaymentStatus(a, pays, anchorMonth, today);
        if (st === "odendi" || st === "kapsam_disi") return null;
        const due = dueDateOf(a, anchorMonth);
        const kalanGun = diffDays(today, due);
        if (kalanGun < 0 || kalanGun > SOON_DAYS) return null; // gecikenler KPI'da zaten var
        return { a, due, kalanGun, bakiye: outstandingOf(a, pays, anchorMonth, today) };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((x, y) => x.kalanGun - y.kalanGun);
  }, [ankrajCariAy, accounts, paymentsByAccount, anchorMonth, today]);

  const bitenDemolar = useMemo(
    () =>
      accounts
        .filter((a) => a.status === "demo")
        .map((a) => ({ a, kalanGun: getDemoDaysLeft(a.demo_end, today) }))
        .filter((x): x is { a: FinanceAccount; kalanGun: number } => x.kalanGun != null)
        .filter((x) => x.kalanGun <= SOON_DAYS)
        .sort((x, y) => x.kalanGun - y.kalanGun),
    [accounts, today],
  );

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-center gap-1.5">
        <CalendarClock size={16} className="text-neutral-400" />
        <div className="text-sm font-semibold text-neutral-900">Yaklaşanlar</div>
      </div>
      <div className="text-xs text-neutral-500">Bugüne göre — {formatDateTR(today)}</div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {/* --- Ödemeler --- */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <Clock size={13} /> Ödeme günü yaklaşanlar
          </div>

          {!ankrajCariAy ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800">
              Yaklaşan ödemeler yalnızca cari ay görüntülenirken hesaplanır (geçmiş aya
              bakarken cari ayın tahsilatları yüklenmiyor).{" "}
              <button type="button" onClick={onGoToday} className="font-semibold underline">
                Bugüne dön
              </button>
            </div>
          ) : yaklasanOdemeler.length === 0 ? (
            <div className="text-sm text-neutral-500">
              Önümüzdeki {SOON_DAYS} günde ödeme günü gelen müşteri yok.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {yaklasanOdemeler.map(({ a, due, kalanGun, bakiye }) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-800">
                      {a.display_name}
                    </div>
                    <div className="text-xs text-neutral-500">
                      Vade {formatDateTR(due)} · kalan {fmtTry(bakiye, 2)}
                    </div>
                  </div>
                  <Badge
                    label={kalanGun === 0 ? "Bugün" : `${kalanGun} gün`}
                    className={
                      kalanGun <= 3
                        ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                        : "bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200"
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* --- Demolar --- */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <TimerOff size={13} /> Demosu bitenler
          </div>

          {bitenDemolar.length === 0 ? (
            <div className="text-sm text-neutral-500">
              Önümüzdeki {SOON_DAYS} günde biten demo yok.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {bitenDemolar.map(({ a, kalanGun }) => {
                const u = demoUrgency(kalanGun);
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-800">
                        {a.display_name}
                      </div>
                      <div className="text-xs text-neutral-500">
                        Bitiş {formatDateTR(a.demo_end)}
                      </div>
                    </div>
                    <Badge
                      label={kalanGun < 0 ? `${Math.abs(kalanGun)} gün geçti` : `${kalanGun} gün`}
                      className={DEMO_URGENCY_META[u].badge}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
