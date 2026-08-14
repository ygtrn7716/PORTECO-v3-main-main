// src/components/dashboard/reports/fetchInvoiceComparison.ts
//
// Fatura Karşılaştırması raporunun veri katmanı.
//
// SADECE kayıtlı invoice_snapshots (invoice_type='billed') okunur; canlı
// fatura hesaplama pipeline'ı bilinçli olarak ÇALIŞTIRILMAZ (performans).
// Snapshot'ı olmayan aylar null kalır ("—" görünür).
//
// "Ödenecek" değeri InvoiceHistory sayfasıyla birebir aynı kaynaktan gelir:
// recomputeSnapshotTotalWithMahsup() (invoiceSnapshots.ts). KDV dahil fatura
// tutarı da aynı recompute'tan türetilir (ödenecek − mahsup − diğer), böylece
// eski snapshot'lardaki hatalı stored total'lar rapora sızmaz.

import { supabase } from "@/lib/supabase";
import {
  recomputeSnapshotTotalWithMahsup,
  INVOICE_SNAPSHOT_RECOMPUTE_FIELDS,
} from "@/components/utils/invoiceSnapshots";
import {
  fetchAllInvoiceOverridesForUser,
  overrideKey,
  type InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";
import type {
  InvoiceComparisonResult,
  InvoiceMonthlyRow,
  TesisOption,
} from "./types";

const nOrNull = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function fetchInvoiceComparison(args: {
  uid: string;
  selectedTesisler: TesisOption[];
  year: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<InvoiceComparisonResult> {
  const { uid, selectedTesisler, year, onProgress } = args;

  onProgress?.(0, 1);

  const sernos = selectedTesisler.map((t) => t.subscriptionSerNo);

  // Recompute için gereken alan listesi tek kaynaktan (invoiceSnapshots.ts);
  // üstüne ay/tesis kimlikleri eklenir.
  const { data, error } = await supabase
    .from("invoice_snapshots")
    .select(
      // period_year/period_month artık RECOMPUTE_FIELDS içinde (2K) — çift kolon olmasın.
      `subscription_serno, ${INVOICE_SNAPSHOT_RECOMPUTE_FIELDS}`,
    )
    .eq("user_id", uid)
    .eq("invoice_type", "billed")
    .eq("period_year", year)
    .in("subscription_serno", sernos);

  if (error) {
    throw new Error(`Fatura kayıtları alınamadı: ${error.message}`);
  }

  // Fatura kalem override'ları — seçili tesisler + yıl için TEK sorgu.
  // Fail-open: rapor yalnız okur; hata durumunda doğal toplamlar kullanılır.
  const ovMap = await fetchAllInvoiceOverridesForUser({
    userId: uid,
    periodYear: year,
    subscriptionSernos: sernos,
  }).catch((e) => {
    console.error("invoice overrides load error (comparison):", e);
    return new Map<string, InvoiceOverrides>();
  });

  onProgress?.(1, 1);

  // Ay bazlı toplayıcılar (null = o ay için hiç snapshot yok)
  const cons: (number | null)[] = Array(12).fill(null);
  const invoice: (number | null)[] = Array(12).fill(null);
  const mahsup: (number | null)[] = Array(12).fill(null);
  const payable: (number | null)[] = Array(12).fill(null);

  const payableByTesis: Record<number, (number | null)[]> = {};
  for (const t of selectedTesisler) {
    payableByTesis[t.subscriptionSerNo] = Array(12).fill(null);
  }

  for (const row of (data ?? []) as any[]) {
    const m = Number(row.period_month);
    if (!Number.isFinite(m) || m < 1 || m > 12) continue;
    const i = m - 1;

    // InvoiceHistory "Ödenecek" ile aynı fonksiyon — birebir eşleşme garantisi.
    const rowPayable = recomputeSnapshotTotalWithMahsup(
      row,
      ovMap.get(overrideKey(Number(row.subscription_serno), Number(row.period_year), m))
    );
    const rowMahsup = nOrNull(row.yekdem_mahsup) ?? 0;
    const rowDiger = nOrNull(row.diger_degerler) ?? 0;
    const rowInvoice = rowPayable - rowMahsup - rowDiger; // KDV dahil fatura
    const rowCons = nOrNull(row.total_consumption_kwh);

    payable[i] = (payable[i] ?? 0) + rowPayable;
    invoice[i] = (invoice[i] ?? 0) + rowInvoice;
    mahsup[i] = (mahsup[i] ?? 0) + rowMahsup;
    if (rowCons !== null) cons[i] = (cons[i] ?? 0) + rowCons;

    const serno = Number(row.subscription_serno);
    const arr = payableByTesis[serno];
    if (arr) arr[i] = (arr[i] ?? 0) + rowPayable;
  }

  const monthly: InvoiceMonthlyRow[] = [];
  for (let m = 0; m < 12; m++) {
    monthly.push({
      month: m + 1,
      consumption_kwh: cons[m],
      invoice_tl: invoice[m],
      mahsup_tl: mahsup[m],
      payable_tl: payable[m],
    });
  }

  return { year, tesisler: selectedTesisler, monthly, payableByTesis };
}
