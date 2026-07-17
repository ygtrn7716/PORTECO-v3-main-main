// src/components/admin/finance/useFinanceData.ts
// Finans sayfasının TEK fetch noktası.
//
// Her zaman 6 AYLIK pencere çekilir (grafik bunu ister), tek ay client-side türetilir.
// Hacim küçük (~31 hesap × 6 ay). İkinci bir "sadece bu ay" round-trip'i, grafik ile tabloların
// uyumsuz kalacağı bir pencere açardı.
//
// anchorMonth bir STRING'dir, asla dayjs/Date: dayjs nesnesi her render'da referans eşitliğini
// kaybeder, useCallback([anchorMonth]) yeniden tetiklenir ve sonsuz fetch döngüsü doğar.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  addMonths,
  normalizeAccount,
  normalizeExpense,
  normalizePayment,
  normalizeTemplate,
  type FinanceAccount,
  type FinanceExpense,
  type FinanceExpenseTemplate,
  type FinancePayment,
  type MonthStr,
} from "@/lib/finance";

type Row = Record<string, unknown>;

/** Projedeki ortak kalıp (TalepBirlestirmeAdmin, DataHealthAdmin). */
export function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Grafik penceresi: anchor dahil son 6 ay. */
export const WINDOW_MONTHS = 6;

export function useFinanceData(anchorMonth: MonthStr) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [payments, setPayments] = useState<FinancePayment[]>([]);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [templates, setTemplates] = useState<FinanceExpenseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Hızlı ay değişiminde geç dönen eski cevabın yenisini ezmesini engeller.
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const my = ++reqId.current;
    setLoading(true);
    setErr(null);
    try {
      const windowStart = addMonths(anchorMonth, -(WINDOW_MONTHS - 1));

      const [accRes, payRes, expRes, tplRes] = await Promise.all([
        supabase.from("finance_accounts").select("*").order("display_name", { ascending: true }),
        supabase
          .from("finance_payments")
          .select("*")
          .gte("period_month", windowStart)
          .lte("period_month", anchorMonth),
        supabase
          .from("finance_expenses")
          .select("*")
          .gte("period_month", windowStart)
          .lte("period_month", anchorMonth),
        supabase.from("finance_expense_templates").select("*").order("title", { ascending: true }),
      ]);

      const firstErr = accRes.error || payRes.error || expRes.error || tplRes.error;
      if (firstErr) throw firstErr;
      if (my !== reqId.current) return; // eskimiş cevap

      setAccounts(((accRes.data ?? []) as Row[]).map(normalizeAccount));
      setPayments(((payRes.data ?? []) as Row[]).map(normalizePayment));
      setExpenses(((expRes.data ?? []) as Row[]).map(normalizeExpense));
      setTemplates(((tplRes.data ?? []) as Row[]).map(normalizeTemplate));
    } catch (e) {
      if (my !== reqId.current) return;
      setErr(errMsg(e, "Finans verileri yüklenemedi"));
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [anchorMonth]);

  // SADECE anchorMonth'a bağlı: sekme/filtre değişimi network isteği doğurmaz.
  useEffect(() => {
    void load();
  }, [load]);

  return { accounts, payments, expenses, templates, loading, err, reload: load };
}
