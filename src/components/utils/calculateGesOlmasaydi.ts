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
  // Birim fiyat düzeltmesi (TL/kWh, +/-): karşı-olgusal birim fiyata da uygulanır ki
  // GES'li/GES'siz fatura aynı sözleşme bazında karşılaştırılsın. null/undefined = 0.
  unitPriceAdjustment?: number | null;
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
  // Lisanslı Satış: true ise GES tüketim faturasını etkilemez; tasarruf =
  // satılan enerjinin geliri olarak ortaya çıkar (gesOlmasaydiFatura - mevcut).
  lisansliSatis?: boolean;
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

/** GES production_daily'den paginated fetch (hourly yoksa fallback). */
async function fetchAllGesProductionDaily(
  supabase: SupabaseClient,
  plantIds: string[],
  startDate: string, // YYYY-MM-DD (inclusive)
  endDateExclusive: string, // YYYY-MM-DD (exclusive)
): Promise<{ data: any[]; error: any }> {
  const all: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ges_production_daily")
      .select("date, energy_kwh")
      .in("ges_plant_id", plantIds)
      .gte("date", startDate)
      .lt("date", endDateExclusive)
      .order("date", { ascending: true })
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

// TR günü (UTC+3 sabit) — daily fallback gün-bazlı agregasyonda kullanılır.
function dayKeyTR(ts: string): string {
  const trMs = new Date(ts).getTime() + 3 * 3_600_000;
  return new Date(trMs).toISOString().slice(0, 10);
}

// periodYear/periodMonth → YYYY-MM-DD ay başı ve bir sonraki ay başı.
function monthDateBounds(periodYear: number, periodMonth: number) {
  const mm = String(periodMonth).padStart(2, "0");
  const startDate = `${periodYear}-${mm}-01`;
  const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
  const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
  const endDateExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { startDate, endDateExclusive };
}

export async function calculateGesOlmasaydi(
  params: GesOlmasaydiParams,
): Promise<GesOlmasaydiResult | null> {
  const { supabase, userId, subscriptionSerno, periodYear, periodMonth } = params;

  // Lisanslı Satış: GES tüketim faturasını etkilemez. "GES olmasaydı fatura"
  // = mevcut tüketim faturası (satış indirimi yokken). Tasarruf doğal olarak
  // satılan enerjinin geliri (×KDV) olarak hesaplanır.
  if (params.lisansliSatis) {
    let totalGesKwh = 0;
    const { data: plantsData } = await supabase
      .from("ges_plants")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("linked_serno", subscriptionSerno);

    if (plantsData && plantsData.length > 0) {
      const plantIds = plantsData.map((p: { id: string }) => p.id);
      const start = new Date(periodYear, periodMonth - 1, 1);
      const end = new Date(periodYear, periodMonth, 1);
      const gesRes = await fetchAllGesProduction(
        supabase,
        plantIds,
        start.toISOString(),
        end.toISOString(),
      );
      if (!gesRes.error) {
        totalGesKwh = gesRes.data.reduce(
          (s: number, r: { energy_kwh: number | null }) =>
            s + (Number(r.energy_kwh) || 0),
          0,
        );
      }
      // Hourly tablosunda bu dönem için satır yoksa daily fallback.
      if ((gesRes.error || gesRes.data.length === 0)) {
        const { startDate, endDateExclusive } = monthDateBounds(periodYear, periodMonth);
        const dailyRes = await fetchAllGesProductionDaily(
          supabase,
          plantIds,
          startDate,
          endDateExclusive,
        );
        if (!dailyRes.error) {
          totalGesKwh = dailyRes.data.reduce(
            (s: number, r: { energy_kwh: number | null }) =>
              s + (Number(r.energy_kwh) || 0),
            0,
          );
        }
      }
    }

    const breakdown = calculateInvoice({
      totalConsumptionKwh: params.mevcutTuketimKwh,
      unitPriceEnergy: params.mevcutBirimFiyat,
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
      totalProductionKwh: 0,
      lisansliSatis: true,
    });

    const gesOlmasaydiFatura = breakdown.totalInvoice;
    const tasarruf = gesOlmasaydiFatura - params.mevcutFatura;
    return {
      hamTuketimKwh: params.mevcutTuketimKwh,
      mevcutTuketimKwh: params.mevcutTuketimKwh,
      gesUretimKwh: totalGesKwh,
      gesOlmasaydiFatura,
      mevcutFatura: params.mevcutFatura,
      tasarruf,
      tasarrufYuzde:
        gesOlmasaydiFatura > 0 ? (tasarruf / gesOlmasaydiFatura) * 100 : 0,
      hamBirimFiyat: params.mevcutBirimFiyat,
      mevcutBirimFiyat: params.mevcutBirimFiyat,
      gesOlmasaydiBreakdown: breakdown,
    };
  }

  // 1) Bu tüketim aboneliğine (subscription_serno) BAĞLI aktif GES plant'ları bul.
  //    linked_serno filtresi sayesinde her tüketim tesisi sadece kendi GES
  //    üretimini görür. Birden fazla plant aynı abonelikle eşleşebilir
  //    (örn. iki manuel + bir API plant).
  const { data: plants, error: plantsErr } = await supabase
    .from("ges_plants")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("linked_serno", subscriptionSerno);

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

  let totalHamKwh = 0;
  let totalGesKwh = 0;
  let hamPtfTl = 0; // Σ(ham_kwh × ptf_TL_per_kWh)

  if (gesRes.data.length > 0) {
    // 4a) Hourly path — GES üretimi saat bazında topla (birden fazla plant olabilir)
    const gesMap = new Map<number, number>();
    for (const r of gesRes.data) {
      const key = hourKey(r.ts);
      gesMap.set(key, (gesMap.get(key) ?? 0) + (Number(r.energy_kwh) || 0));
    }

    // PTF map
    const ptfMap = new Map<number, number>();
    for (const r of ptfRes.data) {
      ptfMap.set(hourKey(r.ts), Number(r.ptf_tl_mwh) || 0);
    }

    // Saat bazında ham tüketim hesapla + PTF ağırlıklı ortalama
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
  } else {
    // 4b) Daily fallback — hourly tablosunda bu dönem için satır yok.
    // ges_production_daily'den günlük üretimi al, consumption + PTF saatlerini
    // TR-gününe göre agrega et, gün-ağırlıklı PTF ortalaması ile hesapla.
    const { startDate, endDateExclusive } = monthDateBounds(periodYear, periodMonth);
    const dailyRes = await fetchAllGesProductionDaily(
      supabase,
      plantIds,
      startDate,
      endDateExclusive,
    );
    if (dailyRes.error || dailyRes.data.length === 0) return null;

    const gesDayMap = new Map<string, number>();
    for (const r of dailyRes.data) {
      const k = String(r.date); // PostgreSQL date → "YYYY-MM-DD"
      gesDayMap.set(k, (gesDayMap.get(k) ?? 0) + (Number(r.energy_kwh) || 0));
    }

    type DayAgg = { cn: number; gn: number; ptfSum: number; ptfCount: number };
    const dayMap = new Map<string, DayAgg>();
    for (const row of cnRes.data) {
      const k = dayKeyTR(row.ts);
      const agg = dayMap.get(k) ?? { cn: 0, gn: 0, ptfSum: 0, ptfCount: 0 };
      agg.cn += Number(row.cn) || 0;
      agg.gn += Number(row.gn) || 0;
      dayMap.set(k, agg);
    }
    for (const row of ptfRes.data) {
      const k = dayKeyTR(row.ts);
      const agg = dayMap.get(k);
      if (!agg) continue; // consumption olmayan günleri sayma
      agg.ptfSum += Number(row.ptf_tl_mwh) || 0;
      agg.ptfCount += 1;
    }

    for (const [day, agg] of dayMap) {
      const gesKwh = gesDayMap.get(day) ?? 0;
      totalGesKwh += gesKwh;

      const ham = Math.max(0, agg.cn + gesKwh - agg.gn);
      totalHamKwh += ham;

      if (agg.ptfCount > 0 && ham > 0) {
        const dailyAvgPtfMwh = agg.ptfSum / agg.ptfCount;
        hamPtfTl += ham * (dailyAvgPtfMwh / 1000);
      }
    }
  }

  if (totalHamKwh === 0) return null;

  // 7) Ham tüketim-ağırlıklı ortalama PTF (TL/kWh)
  const hamWeightedPtf = hamPtfTl / totalHamKwh;

  // 8) GES olmasaydı birim fiyat
  const hamUnitPriceEnergy =
    (hamWeightedPtf + params.monthlyYekdem) * params.kbk + (params.unitPriceAdjustment ?? 0);

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
