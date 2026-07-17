// src/components/dashboard/reports/fetchMahsupPerformance.ts
//
// Mahsup Performansı raporunun veri katmanı. Her seçili tesis için
// monthly_dashboard_series RPC'sinden yekdem_mahsup_tl, yekdem_value_tl_kwh,
// yekdem_final_tl_kwh ve consumption_kwh alınır
// (fetchConsumptionVsProduction pattern'i).
//
// Çoklu tesiste: mahsup tutarları TOPLANIR; YEKDEM birim değerleri (TL/kWh)
// tüketim-ağırlıklı ORTALAMA alınır. Ağırlık toplamı 0 ise basit aritmetik
// ortalamaya düşülür (division-by-zero guard).

import { supabase } from "@/lib/supabase";
import { TR_TZ } from "@/lib/dayjs";
import type {
  MahsupPerformanceResult,
  MahsupMonthlyRow,
  TesisOption,
} from "./types";

const nOrNull = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const sumNullable = (vals: (number | null)[]): number | null => {
  let any = false;
  let acc = 0;
  for (const v of vals) {
    if (v === null) continue;
    any = true;
    acc += v;
  }
  return any ? acc : null;
};

// Tüketim-ağırlıklı ortalama; ağırlıksız değerler basit ortalamaya düşer.
const weightedAvg = (
  pairs: Array<{ value: number | null; weight: number | null }>,
): number | null => {
  let weightSum = 0;
  let weightedSum = 0;
  const plain: number[] = [];
  for (const p of pairs) {
    if (p.value === null) continue;
    plain.push(p.value);
    if (p.weight === null) continue;
    weightSum += p.weight;
    weightedSum += p.weight * p.value;
  }
  if (weightSum > 0) return weightedSum / weightSum;
  if (plain.length > 0) return plain.reduce((s, v) => s + v, 0) / plain.length;
  return null;
};

export async function fetchMahsupPerformance(args: {
  uid: string;
  selectedTesisler: TesisOption[];
  year: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<MahsupPerformanceResult> {
  const { uid, selectedTesisler, year, onProgress } = args;

  onProgress?.(0, selectedTesisler.length);

  const consByTesis: Record<number, (number | null)[]> = {};
  const valueByTesis: Record<number, (number | null)[]> = {};
  const finalByTesis: Record<number, (number | null)[]> = {};
  const mahsupByTesis: Record<number, (number | null)[]> = {};
  for (const t of selectedTesisler) {
    consByTesis[t.subscriptionSerNo] = Array(12).fill(null);
    valueByTesis[t.subscriptionSerNo] = Array(12).fill(null);
    finalByTesis[t.subscriptionSerNo] = Array(12).fill(null);
    mahsupByTesis[t.subscriptionSerNo] = Array(12).fill(null);
  }

  const calls = selectedTesisler.map((t) =>
    supabase.rpc("monthly_dashboard_series", {
      p_user_id: uid,
      p_subscription_serno: t.subscriptionSerNo,
      p_year: year,
      p_tz: TR_TZ,
    }),
  );

  let done = 0;
  const results = await Promise.all(
    calls.map((p) =>
      p.then((res) => {
        done += 1;
        onProgress?.(done, selectedTesisler.length);
        return res;
      }),
    ),
  );

  for (let i = 0; i < selectedTesisler.length; i++) {
    const t = selectedTesisler[i];
    const r = results[i];
    if (r.error) {
      throw new Error(
        `Tesis ${t.subscriptionSerNo} için mahsup verisi alınamadı: ${r.error.message}`,
      );
    }
    const serno = t.subscriptionSerNo;
    for (const row of (r.data ?? []) as any[]) {
      const m = Number(row.month);
      if (!Number.isFinite(m) || m < 1 || m > 12) continue;
      consByTesis[serno][m - 1] = nOrNull(row.consumption_kwh);
      valueByTesis[serno][m - 1] = nOrNull(row.yekdem_value_tl_kwh);
      finalByTesis[serno][m - 1] = nOrNull(row.yekdem_final_tl_kwh);
      mahsupByTesis[serno][m - 1] = nOrNull(row.yekdem_mahsup_tl);
    }
  }

  const monthly: MahsupMonthlyRow[] = [];
  for (let m = 0; m < 12; m++) {
    const consPairs = selectedTesisler.map((t) => ({
      cons: consByTesis[t.subscriptionSerNo][m],
      value: valueByTesis[t.subscriptionSerNo][m],
      final: finalByTesis[t.subscriptionSerNo][m],
    }));

    monthly.push({
      month: m + 1,
      consumption_kwh: sumNullable(consPairs.map((p) => p.cons)),
      yekdem_value_tl_kwh: weightedAvg(
        consPairs.map((p) => ({ value: p.value, weight: p.cons })),
      ),
      yekdem_final_tl_kwh: weightedAvg(
        consPairs.map((p) => ({ value: p.final, weight: p.cons })),
      ),
      mahsup_tl: sumNullable(
        selectedTesisler.map((t) => mahsupByTesis[t.subscriptionSerNo][m]),
      ),
    });
  }

  return { year, tesisler: selectedTesisler, monthly, mahsupByTesis };
}
