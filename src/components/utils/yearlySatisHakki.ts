// src/components/utils/yearlySatisHakki.ts
//
// "Yıllık Satış Hakkı Kullanımı" için ortak hesap.
//
// İş kuralı: Yıllık satış hakkı sadece DEVLETE/ŞEBEKEYE SATILAN veriş fazlası
// (verisFazlaKwh = max(0, üretim - tüketim)) ile düşer. Kendi tüketimine mahsup
// edilen kısım (verisMahsupKwh) bu hesaba DAHİL DEĞİLDİR.
//
// Yıllık toplam, her abonelik sayacı için ayrı; ay-bazlı bucket üzerinden
// `Σ_month max(0, ayVeriş - ayÇekiş)` formülüyle hesaplanır. Bu, calculateInvoice
// içindeki aylık `verisFazlaKwh` mantığının yıllık karşılığıdır.
//
// Not: on_yil flag'i sadece veriş fazlasının BEDELİNİ (USD vs perakende TL)
// etkiler — kWh miktarını değil. Bu helper sadece kWh döndürür, dolayısıyla
// on_yil mantığını etkilemez.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dayjsTR } from "@/lib/dayjs";
import { fetchAllConsumption } from "@/lib/paginatedFetch";

export async function calcYearlySatisHakkiUsage(opts: {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSernos: number[];
  year?: number;
}): Promise<number> {
  const sernos = opts.subscriptionSernos.filter((s) => s != null);
  if (sernos.length === 0) return 0;

  const now = dayjsTR();
  const year = opts.year ?? now.year();
  const yearStart = dayjsTR(`${year}-01-01`).startOf("year");
  const yearEnd =
    year === now.year() ? now : dayjsTR(`${year}-01-01`).endOf("year");

  const yearStartIso = yearStart.toDate().toISOString();
  const yearEndIso = yearEnd.toDate().toISOString();

  let used = 0;

  for (const serno of sernos) {
    const res = await fetchAllConsumption({
      supabase: opts.supabase,
      userId: opts.userId,
      subscriptionSerno: serno,
      columns: "ts, gn, cn",
      startIso: yearStartIso,
      endIso: yearEndIso,
      endInclusive: true,
    });

    if (res.error) continue;

    const monthlyTotals = new Map<string, { veris: number; cekis: number }>();
    for (const hour of res.data ?? []) {
      const monthKey = String((hour as any).ts ?? "").slice(0, 7);
      if (!monthKey) continue;
      const cur = monthlyTotals.get(monthKey) ?? { veris: 0, cekis: 0 };
      cur.veris += Number((hour as any).gn) || 0;
      cur.cekis += Number((hour as any).cn) || 0;
      monthlyTotals.set(monthKey, cur);
    }

    for (const { veris, cekis } of monthlyTotals.values()) {
      used += Math.max(0, veris - cekis);
    }
  }

  return used;
}
