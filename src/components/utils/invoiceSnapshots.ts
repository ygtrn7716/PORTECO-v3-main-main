//src/components/utils/invoiceSnapshots.ts
import { supabase } from "@/lib/supabase";
import type { InvoiceBreakdown, TariffType } from "@/components/utils/calculateInvoice";

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
  const q = supabase
    .from("invoice_snapshots")
    .select(
      "user_id, subscription_serno, period_year, period_month, invoice_type, month_label, total_with_mahsup, total_invoice, total_consumption_kwh, updated_at"
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
