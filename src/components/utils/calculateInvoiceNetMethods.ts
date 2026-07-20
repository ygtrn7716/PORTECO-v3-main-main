//src/components/utils/calculateInvoiceNetMethods.ts
import type {
  InvoiceBreakdown,
  InvoiceInput,
} from "@/components/utils/calculateInvoice";
import type {
  AppliedInvoiceOverrides,
  InvoiceLineOverride,
  InvoiceOverrideItemKey,
  InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";

/**
 * Metod 2 (Uedaş) ve Metod 3 (Tredaş) fatura motorları — Aşama 2B.
 *
 * Metod 1 (calculateInvoice.ts) AYLIK netleşmeye dayanır; bu iki metod ise
 * SAATLİK net agregalara dayanır:
 *   pos_h = max(cn−gn, 0) · mahsup_h = min(cn, gn) · excess_h = max(gn−cn, 0)
 *   wPos  = Σ(pos_h × PTF_h) / Σ pos_h     (ÇIPLAK, pos-ağırlıklı PTF)
 * Agregalar hourlyNetAggregates.ts'de üretilir; bu dosya SAF hesaptır.
 *
 * ⚠️ Bu modül BİLEREK hiçbir runtime import'u yapmaz (yalnız `import type`).
 * Kabul testi script'i (scripts/check-invoice-methods.ts) bunu doğrudan import
 * edebilsin diye — @/lib/supabase zinciri env değişkeni ister.
 */

// calculateInvoice.ts:73'teki sabitin aynısı (orada modül-private olduğu için
// export edilemiyor; o dosyaya dokunulmuyor). Değişirse ikisi birlikte güncellenmeli.
const VERIS_USD_BIRIM_FIYAT = 0.133;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const isFin = (v: unknown): v is number =>
  v != null && Number.isFinite(Number(v));

/** Metod 2/3'ün saatlik-net girdileri. Metod 1 bu bloğu YOK SAYAR. */
export type InvoiceMethodInputs = {
  /** Σ cn — brüt tüketim */
  sumCn: number;
  /** Σ efektif gn (tahsis dahil) + atfedilemeyen excess */
  sumGn: number;
  /** Σ max(cn−gn, 0) — net pozitif çekiş */
  sumPos: number;
  /** Σ min(cn, gn) — saat-içi örtüşme. Kimlik: sumCn − sumPos */
  sumMahsup: number;
  /** Σ max(gn−cn, 0) — faturaya GİRMEZ, GES kartında gösterilir */
  sumExcess: number;
  /** Pos-ağırlıklı ÇIPLAK PTF (TL/kWh) */
  wPos: number;
  /** subscription_settings.kbk */
  kbk: number;
  /** Dönemin ÇIPLAK tahmini YEKDEM'i (subscription_yekdem.yekdem_value) */
  tahminiYekdem: number;
  /** Önceki dönemin net pozitif çekişi. Yoksa YEK Farkı kalemi 0 olur. */
  prevSumPos?: number | null;
  prevTahminiYekdem?: number | null;
  prevGerceklesenYekdem?: number | null;
  /** Metod 3 muhtelif-2 kredisi birim fiyatı. Yoksa T-0 enerji fiyatı kullanılır. */
  mahsuplasmaUnitPrice?: number | null;
};

export type MethodInvoiceInput = InvoiceInput & {
  methodInputs?: InvoiceMethodInputs;
};

/** Metod 2/3'e özgü OPSİYONEL kalemler. Metod 1 çıktısında bu anahtarlar hiç bulunmaz. */
export type MethodInvoiceBreakdown = InvoiceBreakdown & {
  /** m3: "Tahmini YEKDEM" · m2: "YEK Bedeli" */
  yekTahminiCharge?: number;
  /** m3: "Önceki YEKDEM Mahsup" · m2: "YEK Farkı" (önceki dönem verisi yoksa 0) */
  yekFarkiCharge?: number;
  /** m3 muhtelif-2, dağıtım bileşeni (+) */
  muhtelif2Dagitim?: number;
  /** m3 muhtelif-2, mahsuplaşma kredisi (POZİTİF tutulur, matrahta düşülür) */
  muhtelif2MahsupKredisi?: number;
  /** m3 muhtelif-2 net (dağıtım − kredi) */
  muhtelif2Net?: number;
  mahsuplasmaUnitPriceApplied?: number;
  energyUnitPriceApplied?: number;
  wPosApplied?: number;
};

/**
 * Önceki dönem YEKDEM farkı kalemi — metod 2 "YEK Farkı" ve metod 3 "Önceki
 * YEKDEM Mahsup" AYNI aritmetiği kullanır (taban her ikisinde de önceki dönemin
 * NET pozitif çekişi):
 *
 *   tutar = prevSumPos × (gerçekleşen − tahmini) × KBK      [TL, KDV öncesi]
 *
 * Metod 1'in mahsubundan farkı: burada fatura KALEMİdir (KDV matrahına girer),
 * metod 1'de ise toplam sonrası KDV-dahil eklenir (calculateInvoice.ts:474+).
 * Girdilerden biri eksik/geçersizse 0 döner (D3: "önceki dönem verisi yok → satır gizli").
 */
export function calculateYekFarki(p: {
  prevSumPos?: number | null;
  prevTahminiYekdem?: number | null;
  prevGerceklesenYekdem?: number | null;
  kbk: number;
}): number {
  if (!isFin(p.prevSumPos) || !isFin(p.prevTahminiYekdem) || !isFin(p.prevGerceklesenYekdem)) {
    return 0;
  }
  const base = Number(p.prevSumPos);
  const kbk = Number(p.kbk);
  if (!(base > 0) || !Number.isFinite(kbk)) return 0;
  return base * (Number(p.prevGerceklesenYekdem) - Number(p.prevTahminiYekdem)) * kbk;
}

type NetMethodId = 2 | 3;

function calculateNetMethod(
  method: NetMethodId,
  input: MethodInvoiceInput,
  overrides?: InvoiceOverrides | null,
  mi?: InvoiceMethodInputs
): MethodInvoiceBreakdown {
  const m = mi ?? input.methodInputs!;
  const ov = overrides ?? null;

  const sumCn = num(m.sumCn);
  const sumGn = num(m.sumGn);
  const sumPos = num(m.sumPos);
  const sumMahsup = num(m.sumMahsup);
  const sumExcess = num(m.sumExcess);
  const kbk = num(m.kbk);

  // ── Birim fiyatlar (öncelik: calculateInvoice.ts:142-152 ile aynı — override girişte gölgeler)
  const naturalEnergyUnitPrice = num(m.wPos) * kbk; // T-0
  const enerjiUnitOv = ov?.enerji?.unitPriceOverride;
  const energyUnitPrice = isFin(enerjiUnitOv) ? Number(enerjiUnitOv) : naturalEnergyUnitPrice;

  const dagitimUnitOv = ov?.dagitim?.unitPriceOverride;
  const unitPriceDistribution = isFin(dagitimUnitOv)
    ? Number(dagitimUnitOv)
    : num(input.unitPriceDistribution);

  // ── 1) Enerji — her iki metodda da taban NET pozitif çekiş
  let energyCharge = sumPos * energyUnitPrice;

  // Trafo: kural setinde geçmiyor; metod 1 semantiği korunuyor (VARSAYIM, 2C'de teyit).
  const trafoKwh = isFin(input.trafoDegeri) && Number(input.trafoDegeri) > 0
    ? Number(input.trafoDegeri)
    : 0;
  let trafoCharge = energyUnitPrice * trafoKwh;

  // ── 2) m3 "Tahmini YEKDEM" (taban NET) · m2 "YEK Bedeli" (taban BRÜT)
  const yekBase = method === 2 ? sumCn : sumPos;
  let yekTahminiCharge = yekBase * (num(m.tahminiYekdem) * kbk);

  // ── 3) Önceki dönem farkı — iki metodda da taban NET (ortak fonksiyon)
  let yekFarkiCharge = calculateYekFarki({
    prevSumPos: m.prevSumPos,
    prevTahminiYekdem: m.prevTahminiYekdem,
    prevGerceklesenYekdem: m.prevGerceklesenYekdem,
    kbk,
  });

  // ── 4) Dağıtım — m3 taban NET, m2 taban BRÜT (m2'de muhtelif yok, tek satır)
  const distributionBaseKwh = method === 2 ? sumCn : sumPos;
  let distributionCharge = distributionBaseKwh * unitPriceDistribution;

  // ── 5) Muhtelif-2 (YALNIZ m3): +mahsup×dağıtım ve −mahsup×mahsuplaşmaFiyatı
  // NOT: Gerçek Trepaş faturası mahsuplaşmada 1,82375 kullanmıştı; bu değerin
  // kaynağı çözülemedi (bilinçli sapma). Default T-0 fiyatıdır; admin
  // "mahsuplasma" override'ıyla gerçek değeri girebilir. Temmuz faturasıyla test edilecek.
  const mahsuplasmaUnitOv = ov?.mahsuplasma?.unitPriceOverride;
  const mahsuplasmaUnitPrice = isFin(mahsuplasmaUnitOv)
    ? Number(mahsuplasmaUnitOv)
    : isFin(m.mahsuplasmaUnitPrice)
      ? Number(m.mahsuplasmaUnitPrice)
      : energyUnitPrice;

  let muhtelif2Dagitim = 0;
  let muhtelif2MahsupKredisi = 0;
  if (method === 3) {
    muhtelif2Dagitim = sumMahsup * unitPriceDistribution;
    muhtelif2MahsupKredisi = sumMahsup * mahsuplasmaUnitPrice;
  }

  // ── 6) Reaktif — brüt bazlı ceza dışarıda hesaplanıp geçilir (metod 1 ile aynı)
  let reactivePenaltyCharge = isFin(input.reactivePenaltyCharge)
    ? Number(input.reactivePenaltyCharge)
    : 0;

  // ── 7) BTV — m3: %1 × (Enerji − mahsuplaşma kredisi) · m2: %1 × Enerji
  // (VARSAYIM: örnek faturalarda BTV satırı yoktu. Trafo, metod 1'deki gibi tabana dahil.)
  const btvRate = num(input.btvRate);
  const btvEnergyBase = method === 3 ? energyCharge - muhtelif2MahsupKredisi : energyCharge;
  let btvCharge = (btvEnergyBase + trafoCharge) * btvRate;

  // ── Güç — kural setinde geçmiyor; metod 1 semantiği (yalnız çift terim). VARSAYIM.
  let powerBaseCharge = 0;
  let powerExcessCharge = 0;
  if (input.tariffType === "dual") {
    const contractPowerKw = num(input.contractPowerKw);
    const monthFinalDemandKw = num(input.monthFinalDemandKw);
    powerBaseCharge = num(input.powerPrice) * contractPowerKw;
    if (monthFinalDemandKw > contractPowerKw) {
      powerExcessCharge = (monthFinalDemandKw - contractPowerKw) * num(input.powerExcessPrice);
    }
  }
  let powerTotalCharge = powerBaseCharge + powerExcessCharge;

  // ── Kalem override'ları (calculateInvoice.ts:350-410 ile aynı öncelik: isExcluded > amountOverride)
  const excludedItems: InvoiceOverrideItemKey[] = [];
  const amountOverriddenItems: InvoiceOverrideItemKey[] = [];
  const applyItem = (key: InvoiceOverrideItemKey, current: number): number => {
    const item: InvoiceLineOverride | undefined = ov?.[key];
    if (!item) return current;
    if (item.isExcluded) {
      excludedItems.push(key);
      return 0;
    }
    if (isFin(item.amountOverride)) {
      amountOverriddenItems.push(key);
      return Number(item.amountOverride);
    }
    return current;
  };

  energyCharge = applyItem("enerji", energyCharge);
  trafoCharge = applyItem("trafo", trafoCharge);
  distributionCharge = applyItem("dagitim", distributionCharge);
  btvCharge = applyItem("btv", btvCharge);
  reactivePenaltyCharge = applyItem("reaktif", reactivePenaltyCharge);

  const gucOv = ov?.guc;
  if (gucOv) {
    const before = powerTotalCharge;
    powerTotalCharge = applyItem("guc", powerTotalCharge);
    if (powerTotalCharge !== before) {
      // base + excess = total değişmezini koru (calculateInvoice.ts:378-386 ile aynı)
      powerBaseCharge = powerTotalCharge;
      powerExcessCharge = 0;
    }
  }

  const muhtelif2Net = muhtelif2Dagitim - muhtelif2MahsupKredisi;

  // ── Veriş blokları: GES Üretim Satışı kartı TÜM metodlarda aynı kalsın diye
  // metod 1 formülleriyle doldurulur. FARK: verisMahsupBedeli faturadan DÜŞÜLMEZ
  // (m3'te kredi muhtelif-2 kaleminde, m2'de böyle bir kalem yok).
  const verisFazlaUseUsd = input.onYil === true && num(input.usdKur) > 0;
  const verisFazlaBirim = verisFazlaUseUsd
    ? VERIS_USD_BIRIM_FIYAT * num(input.usdKur)
    : num(input.perakendeEnerjiBedeli);
  const verisMahsupBedeli = sumMahsup * energyUnitPrice;
  const verisFazlaBedeli = sumExcess * verisFazlaBirim;
  const verisSatisBedeli = sumGn > 0 ? verisMahsupBedeli + verisFazlaBedeli : 0;

  // ── Toplamlar. Matrah = kalemler + reaktif + BTV (metod 1'de de BTV ve reaktif matrahta).
  const subtotalBeforeVat =
    energyCharge +
    trafoCharge +
    yekTahminiCharge +
    yekFarkiCharge +
    distributionCharge +
    muhtelif2Net +
    powerTotalCharge +
    reactivePenaltyCharge +
    btvCharge;

  const vatRate = num(input.vatRate);
  const vatCharge = subtotalBeforeVat * vatRate;
  const totalInvoice = subtotalBeforeVat + vatCharge;

  const appliedOverrides: AppliedInvoiceOverrides | null =
    excludedItems.length > 0 ||
    amountOverriddenItems.length > 0 ||
    isFin(enerjiUnitOv) ||
    isFin(dagitimUnitOv) ||
    isFin(mahsuplasmaUnitOv)
      ? {
          excludedItems,
          amountOverriddenItems,
          unitPriceEnergyOverridden: isFin(enerjiUnitOv),
          unitPriceDistributionOverridden: isFin(dagitimUnitOv),
          unitPriceMahsuplasmaOverridden: isFin(mahsuplasmaUnitOv),
        }
      : null;

  return {
    energyCharge,
    trafoCharge,
    distributionCharge,
    distributionBaseKwh,
    // Metod 2/3'te dağıtım düz tarifeden hesaplanır; metod 1'deki "mahsup indirimi"
    // kavramı yoktur → düzeltme 0.
    distributionAdjustment: 0,
    distributionChargeKwh: distributionBaseKwh,
    verisKwh: sumGn,
    effectiveDistributionUnitPrice: unitPriceDistribution,
    netEnergyKwh: sumPos,
    netEnergyCharge: sumPos * energyUnitPrice,
    btvCharge,
    powerBaseCharge,
    powerExcessCharge,
    powerTotalCharge,
    reactivePenaltyCharge,
    verisMahsupKwh: sumMahsup,
    verisFazlaKwh: sumExcess,
    verisMahsupBedeli,
    verisFazlaBedeli,
    verisSatisBedeli,
    subtotalBeforeVat,
    vatCharge,
    totalInvoice,

    // Metoda özgü kalemler
    yekTahminiCharge,
    yekFarkiCharge,
    ...(method === 3
      ? {
          muhtelif2Dagitim,
          muhtelif2MahsupKredisi,
          muhtelif2Net,
          mahsuplasmaUnitPriceApplied: mahsuplasmaUnitPrice,
        }
      : {}),
    energyUnitPriceApplied: energyUnitPrice,
    wPosApplied: num(m.wPos),

    ...(appliedOverrides ? { appliedOverrides } : {}),
  };
}

/** Metod 2 — Uedaş. Dağıtım ve YEK Bedeli tabanı BRÜT (sumCn), enerji tabanı NET (sumPos). */
export function calculateInvoiceMethod2(
  input: MethodInvoiceInput,
  overrides?: InvoiceOverrides | null,
  methodInputs?: InvoiceMethodInputs
): MethodInvoiceBreakdown {
  return calculateNetMethod(2, input, overrides, methodInputs);
}

/** Metod 3 — Tredaş. Tüm tabanlar NET (sumPos); mahsup, muhtelif-2 kaleminde netleşir. */
export function calculateInvoiceMethod3(
  input: MethodInvoiceInput,
  overrides?: InvoiceOverrides | null,
  methodInputs?: InvoiceMethodInputs
): MethodInvoiceBreakdown {
  return calculateNetMethod(3, input, overrides, methodInputs);
}
