import { supabase } from "@/lib/supabase";
import { TR_TZ } from "@/lib/dayjs";
import type {
  ConsumptionVsProductionResult,
  MonthlySummaryRow,
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

const plantLabel = (p: {
  id: string;
  plant_name: string | null;
  nickname: string | null;
}): string => {
  const nick = (p.nickname ?? "").trim();
  if (nick) return nick;
  const name = (p.plant_name ?? "").trim();
  if (name) return name;
  return `Plant ${p.id.slice(0, 8)}`;
};

export async function fetchConsumptionVsProduction(args: {
  uid: string;
  selectedTesisler: TesisOption[];
  year: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<ConsumptionVsProductionResult> {
  const { uid, selectedTesisler, year, onProgress } = args;

  // ---- Tüketim: her tesis için paralel monthly_dashboard_series ----
  onProgress?.(0, selectedTesisler.length);

  const consumptionByTesis: Record<number, (number | null)[]> = {};
  for (const t of selectedTesisler) {
    consumptionByTesis[t.subscriptionSerNo] = Array(12).fill(null);
  }

  const calls = selectedTesisler.map((t) =>
    supabase.rpc("monthly_dashboard_series", {
      p_user_id: uid,
      p_subscription_serno: t.subscriptionSerNo,
      p_year: year,
      p_tz: TR_TZ,
    }),
  );

  // İlerleme sayacı için Promise.all yerine indexli await
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
        `Tesis ${t.subscriptionSerNo} için tüketim verisi alınamadı: ${r.error.message}`,
      );
    }
    const arr = consumptionByTesis[t.subscriptionSerNo];
    for (const row of (r.data ?? []) as any[]) {
      const m = Number(row.month);
      if (!Number.isFinite(m) || m < 1 || m > 12) continue;
      arr[m - 1] = nOrNull(row.consumption_kwh);
    }
  }

  // ---- Üretim: linked_serno ile filtrelenmiş aktif GES plant'ları ----
  const sernoList = selectedTesisler.map((t) => t.subscriptionSerNo);

  let plantRows: {
    id: string;
    plant_name: string | null;
    nickname: string | null;
    linked_serno: number | null;
  }[] = [];

  if (sernoList.length > 0) {
    const { data, error } = await supabase
      .from("ges_plants")
      .select("id, plant_name, nickname, linked_serno")
      .eq("user_id", uid)
      .eq("is_active", true)
      .in("linked_serno", sernoList);

    if (error) {
      throw new Error(`GES plant listesi alınamadı: ${error.message}`);
    }
    plantRows = (data ?? []) as any[];
  }

  const plantNames = plantRows.map((p) => ({
    id: p.id,
    label: plantLabel(p),
  }));

  const productionByPlant: Record<string, (number | null)[]> = {};
  for (const p of plantRows) productionByPlant[p.id] = Array(12).fill(null);

  if (plantRows.length > 0) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const plantIds = plantRows.map((p) => p.id);

    const { data, error } = await supabase
      .from("ges_production_daily")
      .select("ges_plant_id, date, energy_kwh")
      .in("ges_plant_id", plantIds)
      .gte("date", startDate)
      .lte("date", endDate);

    if (error) {
      throw new Error(`GES üretim verisi alınamadı: ${error.message}`);
    }

    for (const row of (data ?? []) as any[]) {
      const pid = String(row.ges_plant_id);
      const arr = productionByPlant[pid];
      if (!arr) continue;
      const d = new Date(row.date);
      const m = d.getMonth();
      if (m < 0 || m > 11) continue;
      const v = Number(row.energy_kwh);
      if (!Number.isFinite(v)) continue;
      arr[m] = (arr[m] ?? 0) + v;
    }
  }

  // ---- Aylık özet: tüm tesislerin / plant'ların ay bazlı toplamı ----
  const monthlySummary: MonthlySummaryRow[] = [];
  for (let m = 0; m < 12; m++) {
    const consVals = selectedTesisler.map(
      (t) => consumptionByTesis[t.subscriptionSerNo][m],
    );
    const prodVals = plantRows.map((p) => productionByPlant[p.id][m]);
    monthlySummary.push({
      month: m + 1,
      consumption_kwh: sumNullable(consVals),
      production_kwh: sumNullable(prodVals),
    });
  }

  return {
    year,
    tesisler: selectedTesisler,
    plantNames,
    monthlySummary,
    consumptionByTesis,
    productionByPlant,
  };
}
