// src/components/dashboard/reports/fetchPtfAnalysis.ts
//
// PTF Analizi raporunun veri katmanı. Her seçili tesis için
// monthly_dashboard_series RPC'sinden ptf_tl_kwh + consumption_kwh alınır
// (fetchConsumptionVsProduction pattern'i).
//
// Çoklu tesiste aylık PTF = tüketim-ağırlıklı ortalama:
//   Σ(tesis_tüketim × tesis_ptf) / Σ(tesis_tüketim)
// Ağırlık toplamı 0 ise (tüm tüketimler 0) payda bozulmasın diye basit
// aritmetik ortalamaya düşülür.

import { supabase } from "@/lib/supabase";
import { TR_TZ } from "@/lib/dayjs";
import type { PtfAnalysisResult, PtfMonthlyRow, TesisOption } from "./types";

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

export async function fetchPtfAnalysis(args: {
  uid: string;
  selectedTesisler: TesisOption[];
  year: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<PtfAnalysisResult> {
  const { uid, selectedTesisler, year, onProgress } = args;

  onProgress?.(0, selectedTesisler.length);

  const ptfByTesis: Record<number, (number | null)[]> = {};
  const consByTesis: Record<number, (number | null)[]> = {};
  for (const t of selectedTesisler) {
    ptfByTesis[t.subscriptionSerNo] = Array(12).fill(null);
    consByTesis[t.subscriptionSerNo] = Array(12).fill(null);
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
        `Tesis ${t.subscriptionSerNo} için PTF verisi alınamadı: ${r.error.message}`,
      );
    }
    const ptfArr = ptfByTesis[t.subscriptionSerNo];
    const consArr = consByTesis[t.subscriptionSerNo];
    for (const row of (r.data ?? []) as any[]) {
      const m = Number(row.month);
      if (!Number.isFinite(m) || m < 1 || m > 12) continue;
      ptfArr[m - 1] = nOrNull(row.ptf_tl_kwh);
      consArr[m - 1] = nOrNull(row.consumption_kwh);
    }
  }

  // ---- Aylık özet: ağırlıklı PTF + toplam tüketim + maliyet ----
  const monthly: PtfMonthlyRow[] = [];
  for (let m = 0; m < 12; m++) {
    // Maliyet ve ağırlıklı ortalama yalnız PTF'i VE tüketimi olan tesislerle
    // hesaplanır; PTF'i olup tüketimi olmayan tesis ortalamaya sade (ağırlıksız)
    // fallback'te katılır.
    let weightSum = 0;
    let weightedPtfSum = 0;
    let costAny = false;

    const ptfVals: number[] = [];
    for (const t of selectedTesisler) {
      const ptf = ptfByTesis[t.subscriptionSerNo][m];
      const cons = consByTesis[t.subscriptionSerNo][m];
      if (ptf === null) continue;
      ptfVals.push(ptf);
      if (cons === null) continue;
      weightSum += cons;
      weightedPtfSum += cons * ptf;
      costAny = true;
    }

    let ptfAvg: number | null = null;
    if (weightSum > 0) {
      ptfAvg = weightedPtfSum / weightSum;
    } else if (ptfVals.length > 0) {
      // Division-by-zero guard: tüm ağırlıklar 0/yok → basit ortalama
      ptfAvg = ptfVals.reduce((s, v) => s + v, 0) / ptfVals.length;
    }

    const consTotal = sumNullable(
      selectedTesisler.map((t) => consByTesis[t.subscriptionSerNo][m]),
    );

    monthly.push({
      month: m + 1,
      ptf_tl_kwh: ptfAvg,
      consumption_kwh: consTotal,
      cost_tl: costAny ? weightedPtfSum : null, // Σ(tüketim × PTF)
    });
  }

  return { year, tesisler: selectedTesisler, monthly, ptfByTesis };
}
