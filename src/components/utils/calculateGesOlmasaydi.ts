// src/components/utils/calculateGesOlmasaydi.ts
//
// GES olmasaydı fatura karşılaştırma hesaplaması.
// Ham tüketim = çekiş + GES üretim - veriş (saat bazında)

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllConsumption, fetchAllPtf } from "@/lib/paginatedFetch";
import { calculateInvoice, type InvoiceBreakdown, type TariffType } from "./calculateInvoice";

const PAGE = 1000;

export interface GesOlmasaydiResult {
  hamTuketimKwh: number;
  mevcutTuketimKwh: number;
  gesUretimKwh: number;
  gesOlmasaydiFatura: number;
  mevcutFatura: number;
  tasarruf: number;
  tasarrufYuzde: number;
  hamBirimFiyat: number;
  mevcutBirimFiyat: number;
  gesOlmasaydiBreakdown: InvoiceBreakdown;
}

export interface GesOlmasaydiParams {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  // Mevcut fatura hesabından gelen değerler (yeniden sorgulamayı önlemek için)
  mevcutFatura: number;
  mevcutBirimFiyat: number;
  mevcutTuketimKwh: number;
  monthlyYekdem: number;
  kbk: number;
  // Tarife parametreleri
  unitPriceDistribution: number;
  btvRate: number;
  vatRate: number;
  tariffType: TariffType;
  contractPowerKw: number;
  monthFinalDemandKw: number;
  powerPrice: number;
  powerExcessPrice: number;
  reactivePenaltyCharge: number;
  trafoDegeri: number;
  // Veriş satış parametreleri
  onYil?: boolean;
  perakendeEnerjiBedeli?: number;
}

/** GES production_hourly'den paginated fetch */
async function fetchAllGesProduction(
  supabase: SupabaseClient,
  plantIds: string[],
  startIso: string,
  endIso: string,
): Promise<{ data: any[]; error: any }> {
  const all: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ges_production_hourly")
      .select("ts, energy_kwh")
      .in("ges_plant_id", plantIds)
      .gte("ts", startIso)
      .lt("ts", endIso)
      .order("ts", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) return { data: all, error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return { data: all, error: null };
}

function hourKey(ts: string): number {
  return Math.floor(new Date(ts).getTime() / 3_600_000) * 3_600_000;
}

export async function calculateGesOlmasaydi(
  params: GesOlmasaydiParams,
): Promise<GesOlmasaydiResult | null> {
  const { supabase, userId, subscriptionSerno, periodYear, periodMonth } = params;

  // 1) Kullanıcının aktif GES plant'lerini bul
  const { data: plants, error: plantsErr } = await supabase
    .from("ges_plants")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (plantsErr || !plants || plants.length === 0) return null;
  const plantIds = plants.map((p: { id: string }) => p.id);

  // 2) Dönem aralığı
  const start = new Date(periodYear, periodMonth - 1, 1);
  const end = new Date(periodYear, periodMonth, 1);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // 3) Paralel fetch: GES üretim + tüketim + PTF
  const [gesRes, cnRes, ptfRes] = await Promise.all([
    fetchAllGesProduction(supabase, plantIds, startIso, endIso),
    fetchAllConsumption({
      supabase,
      userId,
      subscriptionSerno,
      columns: "ts, cn, gn",
      startIso,
      endIso,
    }),
    fetchAllPtf({ supabase, startIso, endIso }),
  ]);

  if (gesRes.error || cnRes.error || ptfRes.error) return null;
  if (gesRes.data.length === 0) return null; // GES verisi yoksa hesaplama yapma

  // 4) GES üretimi saat bazında topla (birden fazla plant olabilir)
  const gesMap = new Map<number, number>();
  for (const r of gesRes.data) {
    const key = hourKey(r.ts);
    gesMap.set(key, (gesMap.get(key) ?? 0) + (Number(r.energy_kwh) || 0));
  }

  // 5) PTF map
  const ptfMap = new Map<number, number>();
  for (const r of ptfRes.data) {
    ptfMap.set(hourKey(r.ts), Number(r.ptf_tl_mwh) || 0);
  }

  // 6) Saat bazında ham tüketim hesapla + PTF ağırlıklı ortalama
  let totalHamKwh = 0;
  let totalGesKwh = 0;
  let hamPtfTl = 0; // Σ(ham_kwh × ptf_TL_per_kWh)

  for (const row of cnRes.data) {
    const key = hourKey(row.ts);
    const cn = Number(row.cn) || 0;
    const gn = Number(row.gn) || 0;
    const gesKwh = gesMap.get(key) ?? 0;
    const ptfMwh = ptfMap.get(key);

    totalGesKwh += gesKwh;

    // Ham tüketim = çekiş + GES üretim - veriş (min 0)
    const ham = Math.max(0, cn + gesKwh - gn);
    totalHamKwh += ham;

    // PTF maliyeti (ham tüketim ağırlıklı)
    if (ptfMwh != null && ham > 0) {
      hamPtfTl += ham * (ptfMwh / 1000); // TL/MWh → TL/kWh
    }
  }

  if (totalHamKwh === 0) return null;

  // 7) Ham tüketim-ağırlıklı ortalama PTF (TL/kWh)
  const hamWeightedPtf = hamPtfTl / totalHamKwh;

  // 8) GES olmasaydı birim fiyat
  const hamUnitPriceEnergy = (hamWeightedPtf + params.monthlyYekdem) * params.kbk;

  // 9) GES olmasaydı fatura (veriş = 0, çünkü GES yok)
  const gesOlmasaydiBreakdown = calculateInvoice({
    totalConsumptionKwh: totalHamKwh,
    unitPriceEnergy: hamUnitPriceEnergy,
    unitPriceDistribution: params.unitPriceDistribution,
    btvRate: params.btvRate,
    vatRate: params.vatRate,
    tariffType: params.tariffType,
    contractPowerKw: params.contractPowerKw,
    monthFinalDemandKw: params.monthFinalDemandKw,
    powerPrice: params.powerPrice,
    powerExcessPrice: params.powerExcessPrice,
    reactivePenaltyCharge: params.reactivePenaltyCharge,
    trafoDegeri: params.trafoDegeri,
    totalProductionKwh: 0, // GES yok → veriş yok
    // on_yil ve perakende irrelevant — veriş 0
  });

  const gesOlmasaydiFatura = gesOlmasaydiBreakdown.totalInvoice;
  const tasarruf = gesOlmasaydiFatura - params.mevcutFatura;
  const tasarrufYuzde = gesOlmasaydiFatura > 0
    ? (tasarruf / gesOlmasaydiFatura) * 100
    : 0;

  return {
    hamTuketimKwh: totalHamKwh,
    mevcutTuketimKwh: params.mevcutTuketimKwh,
    gesUretimKwh: totalGesKwh,
    gesOlmasaydiFatura,
    mevcutFatura: params.mevcutFatura,
    tasarruf,
    tasarrufYuzde,
    hamBirimFiyat: hamUnitPriceEnergy,
    mevcutBirimFiyat: params.mevcutBirimFiyat,
    gesOlmasaydiBreakdown,
  };
}
