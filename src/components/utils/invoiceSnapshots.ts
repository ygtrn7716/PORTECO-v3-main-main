//src/components/utils/invoiceSnapshots.ts
import { supabase } from "@/lib/supabase";
import { calculateInvoice, type InvoiceBreakdown, type TariffType } from "@/components/utils/calculateInvoice";

/**
 * Saklı snapshot satırından "ödenecek toplam"ı (mahsup + diğer dahil) canlı
 * yeniden hesaplar.
 *
 * Eski snapshot'larda dağıtım bedeli yanlış (üretim>tüketim durumunda negatif)
 * kayıtlı olabilir. Yeni calculateInvoice() bu durumu düzelttiği için,
 * snapshot'tan okurken stored total yerine bu helper'dan dönen değer
 * gösterilmelidir.
 *
 * Not: Çağıran tarafın `select`'inde calculateInvoice'a giden tüm input
 * alanlarının (total_consumption_kwh, unit_price_energy/distribution, btv_rate,
 * vat_rate, tariff_type, contract_power_kw, month_final_demand_kw, power_price,
 * power_excess_price, reactive_penalty_charge, trafo_degeri,
 * total_production_kwh, on_yil, perakende_enerji_bedeli, yekdem_mahsup,
 * diger_degerler) bulunması gerekir; eksikse stored total_with_mahsup'a düşer.
 */
export function recomputeSnapshotTotalWithMahsup(
  row: Partial<InvoiceSnapshotRow> & {
    total_with_mahsup?: number | null;
    yekdem_mahsup?: number | null;
    diger_degerler?: number | null;
  }
): number {
  try {
    const breakdown = calculateInvoice({
      totalConsumptionKwh: Number(row.total_consumption_kwh ?? 0),
      unitPriceEnergy: Number(row.unit_price_energy ?? 0),
      unitPriceDistribution: Number(row.unit_price_distribution ?? 0),
      btvRate: Number(row.btv_rate ?? 0),
      vatRate: Number(row.vat_rate ?? 0),
      tariffType: ((row.tariff_type as TariffType) ?? "single"),
      contractPowerKw: Number(row.contract_power_kw ?? 0),
      monthFinalDemandKw: Number(row.month_final_demand_kw ?? 0),
      powerPrice: Number(row.power_price ?? 0),
      powerExcessPrice: Number(row.power_excess_price ?? 0),
      reactivePenaltyCharge: Number(row.reactive_penalty_charge ?? 0),
      trafoDegeri: Number(row.trafo_degeri ?? 0),
      totalProductionKwh: Number(row.total_production_kwh ?? 0),
      onYil: row.on_yil ?? true,
      perakendeEnerjiBedeli: Number(row.perakende_enerji_bedeli ?? 0),
      usdKur: Number(row.usd_kur ?? 0),
      lisansliSatis: row.lisansli_satis ?? false,
    });
    const yekdem = Number(row.yekdem_mahsup ?? 0);
    const diger = Number(row.diger_degerler ?? 0);
    return breakdown.totalInvoice + yekdem + diger;
  } catch {
    return Number(row.total_with_mahsup ?? 0);
  }
}

/** Tek noktadan import edilen "snapshot select" listesi — recompute yapacak
 * çağıran tarafların kullanması beklenir. */
export const INVOICE_SNAPSHOT_RECOMPUTE_FIELDS =
  "total_consumption_kwh, unit_price_energy, unit_price_distribution, btv_rate, vat_rate, tariff_type, contract_power_kw, month_final_demand_kw, power_price, power_excess_price, reactive_penalty_charge, trafo_degeri, total_production_kwh, on_yil, lisansli_satis, perakende_enerji_bedeli, usd_kur, yekdem_mahsup, diger_degerler, total_with_mahsup";

export type InvoiceType = "billed" | "backdated";

export type InvoiceSnapshotRow = {
  user_id: string;
  subscription_serno: number;
  period_year: number;
  period_month: number;
  invoice_type: InvoiceType;
  month_label: string | null;

  total_consumption_kwh: number | null;
  unit_price_energy: number | null;
  unit_price_adjustment: number | null;
  unit_price_distribution: number | null;
  btv_rate: number | null;
  vat_rate: number | null;
  tariff_type: TariffType | null;

  contract_power_kw: number | null;
  month_final_demand_kw: number | null;
  has_demand_data: boolean | null;

  power_price: number | null;
  power_excess_price: number | null;

  reactive_ri_percent: number | null;
  reactive_rc_percent: number | null;
  reactive_penalty_charge: number | null;

  energy_charge: number | null;
  distribution_charge: number | null;
  btv_charge: number | null;
  power_base_charge: number | null;
  power_excess_charge: number | null;
  subtotal_before_vat: number | null;
  vat_charge: number | null;
  total_invoice: number | null;

  has_yekdem_mahsup: boolean | null;
  yekdem_mahsup: number | null;
  total_with_mahsup: number | null;

  created_at: string;
  updated_at: string;

    trafo_degeri: number | null;
  trafo_charge: number | null;

  diger_degerler: number | null;

  total_production_kwh: number | null;
  distribution_adjustment: number | null;
  veris_kwh: number | null;
  effective_distribution_unit_price: number | null;
  on_yil: boolean | null;
  lisansli_satis: boolean | null;
  veris_satis_bedeli: number | null;
  perakende_enerji_bedeli: number | null;
  usd_kur: number | null;

  // GES Üretim Satışı: fatura kesilirken donmuş dağıtım kesinti oranı (TL/kWh).
  // lisansli_satis'e göre seçilen dagitim_uretici_1/2 değeri. Geçmiş kartın
  // tarife değişse bile sabit kalması için saklanır. null = eski snapshot →
  // gösterim tarafında canlı tarife fallback'i yapılır.
  ges_satis_dagitim_bedeli: number | null;
};

export async function upsertInvoiceSnapshot(params: {
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  invoiceType?: InvoiceType;
  monthLabel?: string;

  totalConsumptionKwh: number;
  unitPriceEnergy: number;
  /** Audit: bu snapshot'a uygulanan birim fiyat düzeltmesi (TL/kWh, +/-).
   * unitPriceEnergy zaten düzeltilmiş (final) değer olarak gelir; bu yalnızca kayıt amaçlıdır. */
  unitPriceAdjustment?: number | null;
  unitPriceDistribution: number;
  btvRate: number;
  vatRate: number;
  tariffType: TariffType;

  contractPowerKw: number;
  monthFinalDemandKw: number;
  hasDemandData: boolean;

  powerPrice: number;
  powerExcessPrice: number;

  reactiveRiPercent: number;
  reactiveRcPercent: number;
  reactivePenaltyCharge: number;

  breakdown: InvoiceBreakdown;

  hasYekdemMahsup: boolean;
  yekdemMahsup: number;
  totalWithMahsup: number;

    trafoDegeri: number;
  trafoCharge: number;

  digerDegerler: number; // ✅ ekle

  totalProductionKwh?: number;
  onYil?: boolean;
  lisansliSatis?: boolean;
  perakendeEnerjiBedeli?: number;
  usdKur?: number;
  /** GES Üretim Satışı: fatura kesilirken donmuş dağıtım kesinti oranı (TL/kWh). */
  gesSatisDagitimBedeli?: number | null;
}) {
  const invoiceType = params.invoiceType ?? "billed";

  const payload = {
    user_id: params.userId,
    subscription_serno: params.subscriptionSerno,
    period_year: params.periodYear,
    period_month: params.periodMonth,
    invoice_type: invoiceType,
    month_label: params.monthLabel ?? null,

    total_consumption_kwh: params.totalConsumptionKwh,
    unit_price_energy: params.unitPriceEnergy,
    unit_price_adjustment: params.unitPriceAdjustment ?? null,
    unit_price_distribution: params.unitPriceDistribution,
    btv_rate: params.btvRate,
    vat_rate: params.vatRate,
    tariff_type: params.tariffType,

    contract_power_kw: params.contractPowerKw,
    month_final_demand_kw: params.monthFinalDemandKw,
    has_demand_data: params.hasDemandData,

    power_price: params.powerPrice,
    power_excess_price: params.powerExcessPrice,

    reactive_ri_percent: params.reactiveRiPercent,
    reactive_rc_percent: params.reactiveRcPercent,
    reactive_penalty_charge: params.reactivePenaltyCharge,

    energy_charge: params.breakdown.energyCharge,
    distribution_charge: params.breakdown.distributionCharge,
    btv_charge: params.breakdown.btvCharge,
    power_base_charge: params.breakdown.powerBaseCharge,
    power_excess_charge: params.breakdown.powerExcessCharge,
    subtotal_before_vat: params.breakdown.subtotalBeforeVat,
    vat_charge: params.breakdown.vatCharge,
    total_invoice: params.breakdown.totalInvoice,

    has_yekdem_mahsup: params.hasYekdemMahsup,
    yekdem_mahsup: params.yekdemMahsup,
    total_with_mahsup: params.totalWithMahsup,

    trafo_degeri: params.trafoDegeri,
    trafo_charge: params.trafoCharge,

    diger_degerler: params.digerDegerler,

    total_production_kwh: params.totalProductionKwh ?? 0,
    distribution_adjustment: params.breakdown.distributionAdjustment ?? 0,
    veris_kwh: params.breakdown.verisKwh ?? 0,
    effective_distribution_unit_price: params.breakdown.effectiveDistributionUnitPrice ?? 0,
    on_yil: params.onYil ?? null,
    lisansli_satis: params.lisansliSatis ?? null,
    veris_satis_bedeli: params.breakdown.verisSatisBedeli ?? 0,
    perakende_enerji_bedeli: params.perakendeEnerjiBedeli ?? null,
    usd_kur: params.usdKur ?? null,
    ges_satis_dagitim_bedeli: params.gesSatisDagitimBedeli ?? null,
  };

  const { error } = await supabase
    .from("invoice_snapshots")
    .upsert(payload, {
      onConflict: "user_id,subscription_serno,period_year,period_month,invoice_type",
    });

  if (error) throw error;
}

export async function listInvoiceSnapshots(params: {
  userId: string;
  invoiceType?: InvoiceType;
  subscriptionSerno?: number;
}) {
  // Listing'de canlı recompute yapabilmek için calculateInvoice'a gereken
  // tüm input'ları + mahsup/diger_degerler alanlarını getiriyoruz.
  const q = supabase
    .from("invoice_snapshots")
    .select(
      "user_id, subscription_serno, period_year, period_month, invoice_type, month_label, total_with_mahsup, total_invoice, total_consumption_kwh, updated_at, unit_price_energy, unit_price_distribution, btv_rate, vat_rate, tariff_type, contract_power_kw, month_final_demand_kw, power_price, power_excess_price, reactive_penalty_charge, trafo_degeri, total_production_kwh, on_yil, lisansli_satis, perakende_enerji_bedeli, usd_kur, yekdem_mahsup, diger_degerler"
    )
    .eq("user_id", params.userId)
    .eq("invoice_type", params.invoiceType ?? "billed")
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const q2 = params.subscriptionSerno != null ? q.eq("subscription_serno", params.subscriptionSerno) : q;

  const { data, error } = await q2;
  if (error) throw error;
  return (data ?? []) as InvoiceSnapshotRow[];
}

export async function getInvoiceSnapshot(params: {
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  invoiceType?: InvoiceType;
}) {
  const { data, error } = await supabase
    .from("invoice_snapshots")
    .select("*")
    .eq("user_id", params.userId)
    .eq("subscription_serno", params.subscriptionSerno)
    .eq("period_year", params.periodYear)
    .eq("period_month", params.periodMonth)
    .eq("invoice_type", params.invoiceType ?? "billed")
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as InvoiceSnapshotRow | null;
}
