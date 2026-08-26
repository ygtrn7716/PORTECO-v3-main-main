//src/components/utils/invoiceSnapshots.ts
import { supabase } from "@/lib/supabase";
import {
  isM1MahsupCapPeriod,
  type InvoiceBreakdown,
  type TariffType,
} from "@/components/utils/calculateInvoice";
import {
  calculateInvoiceForMethod,
  coerceInvoiceMethodId,
  isNetInvoiceMethod,
  type InvoiceMethodId,
} from "@/lib/invoiceMethods";
import type {
  InvoiceMethodInputs,
  MethodInvoiceBreakdown,
} from "@/components/utils/calculateInvoiceNetMethods";
import {
  applyReactivePayloadToSnapshot,
  resolveUnitPriceOverride,
  type InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";
// Yalnız tip importu — runtime döngüsü yaratmaz (billedInvoiceInputs bu modülü import etmiyor).
import type {
  BilledInvoiceInputs,
  BilledInvoiceResult,
} from "@/components/utils/billedInvoiceInputs";

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
 * diger_degerler, invoice_method) bulunması gerekir; eksikse stored
 * total_with_mahsup'a düşer (invoice_method eksik/null → metod 1).
 */
type RecomputeRow = Partial<InvoiceSnapshotRow> & {
  total_with_mahsup?: number | null;
  yekdem_mahsup?: number | null;
  diger_degerler?: number | null;
};

/** Metod 2/3/5 snapshot satırından saatlik-net girdilerini yeniden kurar.
 *  sumMahsup = sumCn − sumPos (min(cn,gn) kimliği). Metod 1/null → undefined.
 *  Kolonlar eksikse (teoride yok) 0'lı girdiler döner → motor 0 kalem üretir. */
export function methodInputsFromSnapshotRow(
  row: RecomputeRow
): InvoiceMethodInputs | undefined {
  const methodId = coerceInvoiceMethodId(row.invoice_method);
  // Metod 1 ve Metod 4 (GES'siz düz fatura) saatlik-net girdisi taşımaz (w_pos yok) →
  // undefined; dispatcher metod-1 çekirdeğinden hesaplar (m4 dalı üretimi sıfırlar).
  if (!isNetInvoiceMethod(methodId)) return undefined;
  // Aşama 2A geçiş dönemi: invoice_method=2/3 damgalı ama w_pos'suz satırlar
  // (2B öncesi yazım) METOD 1 MOTORUYLA hesaplanmıştı. Replay de m1 ile yapılmalı
  // — yoksa wPos=0 ile enerji kalemi çöker. undefined → dispatcher m1'e düşer.
  if (row.w_pos == null) return undefined;
  const sumCn = Number(row.total_consumption_kwh ?? 0);
  const sumPos = Number(row.net_positive_draw_kwh ?? 0);
  return {
    sumCn,
    sumGn: Number(row.total_production_kwh ?? 0),
    sumPos,
    sumMahsup: Math.max(0, sumCn - sumPos),
    sumExcess: Number(row.net_excess_feed_kwh ?? 0),
    wPos: Number(row.w_pos ?? 0),
    wMahsup: row.w_mahsup != null ? Number(row.w_mahsup) : null,
    kbk: Number(row.kbk ?? 0),
    tahminiYekdem: Number(row.yekdem_tahmini ?? 0),
    prevSumPos: row.prev_sum_pos != null ? Number(row.prev_sum_pos) : null,
    prevTahminiYekdem: row.prev_yekdem_tahmini != null ? Number(row.prev_yekdem_tahmini) : null,
    prevGerceklesenYekdem:
      row.prev_yekdem_gerceklesen != null ? Number(row.prev_yekdem_gerceklesen) : null,
    mahsuplasmaUnitPrice:
      row.mahsuplasma_unit_price != null ? Number(row.mahsuplasma_unit_price) : null,
  };
}

/** Saklı snapshot satırından calculateInvoice breakdown'ını TEK noktada üretir.
 *  Saatlik net kolonları (varsa) geçirilir → net üretici/tüketici faturalarda
 *  dağıtım/satış/enerji bazı saatlik nete döner. null (eski snapshot) → undefined
 *  → aylık davranışa fallback. */
export function buildSnapshotBreakdown(
  row: RecomputeRow,
  overrides?: InvoiceOverrides | null
): InvoiceBreakdown {
  // Reaktif payload (ri_kwh/rc_kwh) snapshot'ta ham toplam olmadığı için saklı
  // yüzdelerden geri türetilerek ceza girdisine uygulanır (invoiceOverrides.ts).
  const reactivePenaltyCharge = overrides?.reaktif?.payload
    ? applyReactivePayloadToSnapshot(
        {
          totalConsumptionKwh: Number(row.total_consumption_kwh ?? 0),
          riPercent: Number(row.reactive_ri_percent ?? 0),
          rcPercent: Number(row.reactive_rc_percent ?? 0),
          penalty: Number(row.reactive_penalty_charge ?? 0),
        },
        overrides.reaktif
      ).penalty
    : Number(row.reactive_penalty_charge ?? 0);

  // Tarihsel sadakat: metod snapshot'ın kesildiği andaki değerden okunur (null → metod 1).
  const methodId = coerceInvoiceMethodId(row.invoice_method);
  const methodInputs = methodInputsFromSnapshotRow(row);

  return calculateInvoiceForMethod(
    methodId,
    {
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
      reactivePenaltyCharge,
      trafoDegeri: Number(row.trafo_degeri ?? 0),
      totalProductionKwh: Number(row.total_production_kwh ?? 0),
      onYil: row.on_yil ?? true,
      perakendeEnerjiBedeli: Number(row.perakende_enerji_bedeli ?? 0),
      usdKur: Number(row.usd_kur ?? 0),
      lisansliSatis: row.lisansli_satis ?? false,
      netPositiveDrawKwh: row.net_positive_draw_kwh != null ? Number(row.net_positive_draw_kwh) : undefined,
      netExcessFeedKwh: row.net_excess_feed_kwh != null ? Number(row.net_excess_feed_kwh) : undefined,
      methodInputs,
      // Metod 6 (Kepsaş) replay: gömülen çıplak YEKDEM adder'ı saklı kolondan → dispatcher
      // enerji satırına yeniden gömer. Diğer metodlarda null → 0 → etkisiz (bit-identik).
      embeddedYekdemAdderTL:
        row.embedded_yekdem_adder != null ? Number(row.embedded_yekdem_adder) : undefined,
      // Aşama 2K: mahsup tavanı kapısı — dönem saklı damgadan, Kayseri
      // invoice_from'dan ('kayseri_osb', 20260718_002; NOT NULL 20260718_003).
      // Dönem alanları select'te yoksa Number(undefined)=NaN → kapı kapalı,
      // fail-safe eski davranış. ≤ 2026-06 replay'i böylece koşulsuz tavansız.
      applyVerisMahsupPerakendeCap:
        isM1MahsupCapPeriod(Number(row.period_year), Number(row.period_month)) &&
        row.invoice_from !== "kayseri_osb",
    },
    overrides
  );
}

export function recomputeSnapshotTotalWithMahsup(
  row: RecomputeRow,
  overrides?: InvoiceOverrides | null
): number {
  try {
    const breakdown = buildSnapshotBreakdown(row, overrides);
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
  "period_year, period_month, total_consumption_kwh, unit_price_energy, unit_price_distribution, btv_rate, vat_rate, tariff_type, contract_power_kw, month_final_demand_kw, power_price, power_excess_price, reactive_penalty_charge, reactive_ri_percent, reactive_rc_percent, trafo_degeri, total_production_kwh, on_yil, lisansli_satis, perakende_enerji_bedeli, usd_kur, net_positive_draw_kwh, net_excess_feed_kwh, yekdem_mahsup, diger_degerler, total_with_mahsup, invoice_method, invoice_from, w_pos, w_mahsup, kbk, yekdem_tahmini, prev_sum_pos, prev_yekdem_tahmini, prev_yekdem_gerceklesen, mahsuplasma_unit_price, embedded_yekdem_adder";

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

  // Saatlik net mahsup (net üretici tesisler). null = eski snapshot → aylık fallback.
  net_positive_draw_kwh: number | null; // Σ max(0, cn − gn) — yeni dağıtım bedeli bazı
  net_excess_feed_kwh: number | null;   // Σ max(0, gn − cn) — yeni GES üretim satışı kWh

  // Talep Birleştirme audit'i: bu faturaya waterfall ile tahsis edilen GES kWh.
  // Hesaba GİRMEZ (recompute mevcut alanlardan çalışır); null = tahsis yok/eski snapshot.
  allocated_ges_kwh: number | null;

  // Fatura metodu damgası: kesim anında çözülen metod ve tedarik firması anahtarı.
  // null = eski snapshot → metod 1 (bkz. coerceInvoiceMethodId).
  invoice_method: number | null;
  invoice_from: string | null;

  // ── Aşama 2B: Metod 2/3 replay alanları. Metod 1 snapshot'larında null.
  // sumCn/sumPos/sumMahsup/sumExcess mevcut kolonlardan türetilir; bunlar türetilemez.
  w_pos: number | null;                     // pos-ağırlıklı ÇIPLAK PTF
  w_mahsup: number | null;                  // m3: mahsup-ağırlıklı ÇIPLAK PTF (mahsuplaşma formülü girdisi)
  kbk: number | null;                       // kesim anındaki subscription_settings.kbk
  yekdem_tahmini: number | null;            // dönemin ÇIPLAK tahmini YEKDEM'i
  prev_sum_pos: number | null;              // önceki dönem net pozitif çekiş (YEK Farkı tabanı)
  prev_yekdem_tahmini: number | null;
  prev_yekdem_gerceklesen: number | null;
  mahsuplasma_unit_price: number | null;    // m3 muhtelif-2'de uygulanan efektif fiyat

  // ── Aşama 2L: Metod 6 (Kepsaş) replay alanı. Enerji birim fiyatına gömülen
  // çıplak (vergi öncesi) YEKDEM mahsup tutarı. Diğer metodlarda null.
  embedded_yekdem_adder: number | null;

  // ── Backdated damgaları (20260806_002). Replay OKUMAZ; GES Olmasaydı kartı
  // snapshot-öncelikli okur. null = eski/billed satır → canlı fallback.
  monthly_yekdem: number | null;            // dönemin ÇIPLAK aylık YEKDEM'i (TL/kWh)
  monthly_ptf: number | null;               // tüketim-ağırlıklı aylık PTF (TL/kWh, audit)
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

  // MethodInvoiceBreakdown ⊇ InvoiceBreakdown (ek alanlar opsiyonel) → metod 1
  // writer'ları değişmeden derlenir; metod 2/3'te mahsuplasmaUnitPriceApplied okunur.
  breakdown: MethodInvoiceBreakdown;

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
  /** Saatlik net pozitif çekiş Σ max(0, cn−gn). Net üretici recompute'unda dağıtım bazı. */
  netPositiveDrawKwh?: number | null;
  /** Saatlik net fazla veriş Σ max(0, gn−cn). Net üretici recompute'unda GES satış kWh'ı. */
  netExcessFeedKwh?: number | null;
  /** Talep Birleştirme audit'i: bu faturaya tahsis edilen GES kWh. Hesaba girmez. */
  allocatedGesKwh?: number | null;

  /** Kesim anında çözülen fatura metodu. Zorunlu: yeni writer'lar damgasız snapshot yazamasın. */
  invoiceMethod: InvoiceMethodId;
  /** Metodun çözüldüğü tedarik firması anahtarı (invoice_companies.key); eşleşme yoksa null. */
  invoiceFrom: string | null;
  /** Metod 2/3 saatlik-net girdileri (replay için damgalanır). Metod 1'de verilmez → kolonlar null. */
  methodInputs?: InvoiceMethodInputs | null;
  /** Metod 6 (Kepsaş): enerji birim fiyatına gömülen çıplak YEKDEM adder'ı (replay damgası). */
  embeddedYekdemAdder?: number | null;

  // ── Backdated damgaları. monthly_* yalnız parametre VERİLDİĞİNDE payload'a
  // girer (billed writer'lar kolona dokunmaz); kbk/prev_* metod-1'de de damga
  // için — methodInputs varsa (m2/3) onunki kazanır.
  monthlyYekdem?: number | null;
  monthlyPtf?: number | null;
  kbk?: number | null;
  prevYekdemTahmini?: number | null;
  prevYekdemGerceklesen?: number | null;
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
    net_positive_draw_kwh: params.netPositiveDrawKwh ?? null,
    net_excess_feed_kwh: params.netExcessFeedKwh ?? null,
    allocated_ges_kwh: params.allocatedGesKwh ?? null,
    invoice_method: params.invoiceMethod,
    invoice_from: params.invoiceFrom,

    // Aşama 2B: metod 2/3 replay alanları (metod 1 → hepsi null; backdated
    // metod-1'de params.kbk/prev* damga amaçlı — replay'i etkilemez, çünkü
    // methodInputsFromSnapshotRow metod 2/3 + w_pos kapılarından geçmez).
    w_pos: params.methodInputs?.wPos ?? null,
    w_mahsup: params.methodInputs?.wMahsup ?? null,
    kbk: params.methodInputs?.kbk ?? params.kbk ?? null,
    yekdem_tahmini: params.methodInputs?.tahminiYekdem ?? null,
    prev_sum_pos: params.methodInputs?.prevSumPos ?? null,
    prev_yekdem_tahmini: params.methodInputs?.prevTahminiYekdem ?? params.prevYekdemTahmini ?? null,
    prev_yekdem_gerceklesen:
      params.methodInputs?.prevGerceklesenYekdem ?? params.prevYekdemGerceklesen ?? null,
    // Efektif (override uygulanmış) fiyat yazılır → replay idempotent kalır.
    mahsuplasma_unit_price: params.breakdown.mahsuplasmaUnitPriceApplied ?? null,

    // Aşama 2L: Metod 6 (Kepsaş) gömülü çıplak YEKDEM adder'ı (diğer metodlarda null).
    embedded_yekdem_adder: params.embeddedYekdemAdder ?? null,

    // Backdated damgaları: yalnız parametre verildiğinde alan payload'a girer —
    // billed writer'ların upsert'i mevcut kolon değerini KORUR (alan yok = dokunma).
    ...(params.monthlyYekdem !== undefined ? { monthly_yekdem: params.monthlyYekdem } : {}),
    ...(params.monthlyPtf !== undefined ? { monthly_ptf: params.monthlyPtf } : {}),
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
  /** Birden çok tip birlikte listelenecekse (ör. billed + backdated). Verilirse invoiceType yok sayılır. */
  invoiceTypes?: InvoiceType[];
  subscriptionSerno?: number;
}) {
  // Listing'de canlı recompute yapabilmek için calculateInvoice'a gereken
  // tüm input'ları + mahsup/diger_degerler alanlarını getiriyoruz.
  const base = supabase
    .from("invoice_snapshots")
    .select(
      "user_id, subscription_serno, period_year, period_month, invoice_type, month_label, total_with_mahsup, total_invoice, total_consumption_kwh, updated_at, unit_price_energy, unit_price_distribution, btv_rate, vat_rate, tariff_type, contract_power_kw, month_final_demand_kw, power_price, power_excess_price, reactive_penalty_charge, reactive_ri_percent, reactive_rc_percent, trafo_degeri, total_production_kwh, on_yil, lisansli_satis, perakende_enerji_bedeli, usd_kur, net_positive_draw_kwh, net_excess_feed_kwh, yekdem_mahsup, diger_degerler, invoice_method, invoice_from, w_pos, w_mahsup, kbk, yekdem_tahmini, prev_sum_pos, prev_yekdem_tahmini, prev_yekdem_gerceklesen, mahsuplasma_unit_price, embedded_yekdem_adder"
    )
    .eq("user_id", params.userId);

  const typed = params.invoiceTypes?.length
    ? base.in("invoice_type", params.invoiceTypes)
    : base.eq("invoice_type", params.invoiceType ?? "billed");

  const q = typed
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

/**
 * Motor çıktısını (inputs + result) upsertInvoiceSnapshot parametrelerine çevirir.
 * InvoiceOverridesAdmin "Kaydet + snapshot yeniden yaz" haritalamasının TEK kaynağı —
 * backdated writer da aynısını kullanır; iki yazıcının alan-alan aynı kalması
 * kuruş-kuruş replay eşitliğinin ön koşulu.
 * Efektif (override uygulanmış) birim fiyatlar yazılır → snapshot replay idempotent
 * (InvoiceDetail de efektif değer yazıyor).
 */
export function snapshotParamsFromEngine(args: {
  userId: string;
  subscriptionSerno: number;
  inputs: BilledInvoiceInputs;
  /** buildBreakdownFromInputs(inputs, overrides) çıktısı — override'lı efektif sonuç. */
  result: BilledInvoiceResult;
  /** Yalnız efektif birim fiyat çözümü için (resolveUnitPriceOverride). */
  overrides?: InvoiceOverrides | null;
  invoiceType: InvoiceType;
}): Parameters<typeof upsertInvoiceSnapshot>[0] {
  const { userId, subscriptionSerno, inputs, result, overrides, invoiceType } = args;
  return {
    userId,
    subscriptionSerno,
    periodYear: inputs.periodYear,
    periodMonth: inputs.periodMonth,
    invoiceType,
    monthLabel: inputs.monthLabel,

    totalConsumptionKwh: inputs.totalConsumptionKwh,
    unitPriceEnergy: resolveUnitPriceOverride(inputs.unitPriceEnergy, overrides?.enerji),
    unitPriceAdjustment: inputs.unitPriceAdjustment,
    unitPriceDistribution: resolveUnitPriceOverride(
      inputs.unitPriceDistribution,
      overrides?.dagitim
    ),
    btvRate: inputs.btvRate,
    vatRate: inputs.vatRate,
    tariffType: inputs.tariffType,

    contractPowerKw: inputs.contractPowerKw,
    monthFinalDemandKw: inputs.monthFinalDemandKw,
    hasDemandData: inputs.hasDemandData,

    powerPrice: inputs.powerPrice,
    powerExcessPrice: inputs.powerExcessPrice,

    reactiveRiPercent: result.riPercent,
    reactiveRcPercent: result.rcPercent,
    reactivePenaltyCharge: result.breakdown.reactivePenaltyCharge,

    breakdown: result.breakdown,

    hasYekdemMahsup: result.hasYekdemMahsup,
    yekdemMahsup: result.yekdemMahsup,
    totalWithMahsup: result.totalWithMahsup,
    trafoDegeri: inputs.trafoDegeri,
    trafoCharge: result.breakdown.trafoCharge,
    digerDegerler: inputs.digerDegerler,
    totalProductionKwh: inputs.totalProductionKwh,
    onYil: inputs.onYil,
    lisansliSatis: inputs.lisansliSatis,
    perakendeEnerjiBedeli: inputs.perakendeEnerjiBedeli,
    usdKur: inputs.usdKur,
    gesSatisDagitimBedeli: inputs.dagitimUreticiBedeli,
    netPositiveDrawKwh: inputs.netPositiveDrawKwh,
    netExcessFeedKwh: inputs.netExcessFeedKwh,
    allocatedGesKwh: inputs.allocatedGesKwh,
    invoiceMethod: inputs.invoiceMethodId,
    invoiceFrom: inputs.invoiceFrom,
    methodInputs: inputs.methodInputs,
    // Metod 6 (Kepsaş): gömülen çıplak YEKDEM adder'ı (diğer metodlarda 0).
    embeddedYekdemAdder: result.embeddedYekdemAdder,
  };
}
