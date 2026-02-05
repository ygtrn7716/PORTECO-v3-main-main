// src/utils/invoiceHistory.ts
import { supabase } from "@/lib/supabase";
import type { InvoiceBreakdown } from "@/components/utils/calculateInvoice";

export type InvoiceType = "billed" | "mahsub";

export async function saveInvoiceToHistory(args: {
  userId: string;
  periodYear: number;
  periodMonth: number;
  invoiceType: InvoiceType;

  totalConsumptionKwh: number;
  unitPriceEnergy: number;
  unitPriceDistribution: number;
  btvRate: number;
  vatRate: number;

  breakdown: InvoiceBreakdown;
  yekdemMahsup: number;
  totalWithMahsup: number;
}) {
  const {
    userId,
    periodYear,
    periodMonth,
    invoiceType,
    totalConsumptionKwh,
    unitPriceEnergy,
    unitPriceDistribution,
    btvRate,
    vatRate,
    breakdown,
    yekdemMahsup,
    totalWithMahsup,
  } = args;

  const { error } = await supabase.from("invoice_history").upsert(
    {
      user_id: userId,
      period_year: periodYear,
      period_month: periodMonth,
      invoice_type: invoiceType,

      total_consumption_kwh: totalConsumptionKwh,
      unit_price_energy: unitPriceEnergy,
      unit_price_distribution: unitPriceDistribution,
      btv_rate: btvRate,
      vat_rate: vatRate,

      energy_charge: breakdown.energyCharge,
      distribution_charge: breakdown.distributionCharge,
      btv_charge: breakdown.btvCharge,
      power_base_charge: breakdown.powerBaseCharge,
      power_excess_charge: breakdown.powerExcessCharge,
      subtotal_before_vat: breakdown.subtotalBeforeVat,
      vat_charge: breakdown.vatCharge,
      total_invoice: breakdown.totalInvoice,

      yekdem_mahsub: yekdemMahsup,
      total_with_mahsub: totalWithMahsup,
    },
    {
      onConflict: "user_id,period_year,period_month,invoice_type",
    }
  );

  if (error) {
    console.error("saveInvoiceToHistory error:", error);
  }
}
