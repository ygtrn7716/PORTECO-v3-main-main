// src/utils/calculateInvoice.ts

export type TariffType = "single" | "dual";

export interface InvoiceInput {
  // Tüketim (seçili tesis için)
  totalConsumptionKwh: number; // Geçen ay, SEÇİLİ TESİSİN toplam kWh'ı

  // Enerji + dağıtım birim fiyatları (TL/kWh)
  unitPriceEnergy: number;       // (PTF_tesis + YEKDEM_tesis) * KBK_tesis
  unitPriceDistribution: number; // Dağıtım birim fiyatı

  // Vergi oranları
  btvRate: number; // Örn: 0.01
  vatRate: number; // Örn: 0.20

  // Tarife tipi
  tariffType: TariffType; // "single" (tek terim) veya "dual" (çift terim)

  // Güç bedeli parametreleri (seçili tesis için)
  contractPowerKw: number;    // Sözleşme gücü = güç bedeli limiti
  monthFinalDemandKw: number; // Bitmiş ayın max demand'i (multiplier uygulanmış)
  powerPrice: number;         // Güç bedeli birim fiyatı (TL/kW)
  powerExcessPrice: number;   // Güç bedeli aşım birim fiyatı (TL/kW)

  // 🔥 Reaktif ceza (TL) – KDV öncesi, opsiyonel
  // Limitler aşıldıysa başka yerde hesaplayıp buraya geçiyoruz.
  reactivePenaltyCharge?: number;

    // ✅ Trafo (kWh gibi düşün) – opsiyonel
  trafoDegeri?: number; // null/0 ise yok

}

export interface InvoiceBreakdown {
  energyCharge: number;
  distributionCharge: number;
  btvCharge: number;

  powerBaseCharge: number;
  powerExcessCharge: number;
  powerTotalCharge: number;

  // 🔥 Reaktif ceza (KDV öncesi)
  reactivePenaltyCharge: number;

  subtotalBeforeVat: number;
  vatCharge: number;
  totalInvoice: number; // KDV dahil, YEKDEM mahsup HARİÇ

    trafoCharge: number;

}

export function calculateInvoice(input: InvoiceInput): InvoiceBreakdown {
  const {
    totalConsumptionKwh,
    unitPriceEnergy,
    unitPriceDistribution,
    btvRate,
    vatRate,
    tariffType,
    contractPowerKw,
    monthFinalDemandKw,
    powerPrice,
    powerExcessPrice,
    reactivePenaltyCharge: reactivePenaltyInput,

    trafoDegeri, // ✅
  } = input;

  // 1) Enerji + dağıtım
  const energyCharge = unitPriceEnergy * totalConsumptionKwh;

  // ✅ Trafo bedeli (null/0 ise 0)
  const trafoKwh =
    trafoDegeri != null && Number.isFinite(trafoDegeri) && trafoDegeri > 0
      ? trafoDegeri
      : 0;

  const trafoCharge = unitPriceEnergy * trafoKwh;

  const distributionCharge = unitPriceDistribution * totalConsumptionKwh;

  // 2) BTV (enerji üzerinden)
  // ✅ İstersen trafoyu da enerji sayıp BTV'ye dahil ediyoruz:
  const btvCharge = (energyCharge + trafoCharge) * btvRate;
  // (Eğer BTV trafoya uygulanmasın istersen: const btvCharge = energyCharge * btvRate;)

  // 3) Güç bedeli...
  let powerBaseCharge = 0;
  let powerExcessCharge = 0;

  if (tariffType === "dual") {
    powerBaseCharge = powerPrice * contractPowerKw;

    if (monthFinalDemandKw > contractPowerKw) {
      const excessKw = monthFinalDemandKw - contractPowerKw;
      powerExcessCharge = excessKw * powerExcessPrice;
    }
  }

  const powerTotalCharge = powerBaseCharge + powerExcessCharge;

  // 4) Reaktif ceza
  const reactivePenaltyCharge =
    reactivePenaltyInput != null && Number.isFinite(reactivePenaltyInput)
      ? reactivePenaltyInput
      : 0;

  // 5) Ara toplam + KDV
  const subtotalBeforeVat =
    energyCharge +
    trafoCharge + // ✅ eklendi
    distributionCharge +
    btvCharge +
    powerTotalCharge +
    reactivePenaltyCharge;

  const vatCharge = subtotalBeforeVat * vatRate;
  const totalInvoice = subtotalBeforeVat + vatCharge;

  return {
    energyCharge,
    trafoCharge, // ✅
    distributionCharge,
    btvCharge,
    powerBaseCharge,
    powerExcessCharge,
    powerTotalCharge,
    reactivePenaltyCharge,
    subtotalBeforeVat,
    vatCharge,
    totalInvoice,
  };
}


// ─────────────────────────────────────────────
// YEKDEM Mahsup – TESİS BAZLI
// ─────────────────────────────────────────────

export type YekdemMahsupParams = {
  totalKwh: number;  // önceki dönemin toplam tüketimi (kWh) – SEÇİLİ TESİS
  kbk: number;       // subscription_settings.kbk (seçili tesis)
  btvRate: number;   // 0.01 / 0.05 gibi ORAN (yüzde değil)
  vatRate: number;   // 0.20 gibi ORAN
  yekdemOld: number; // tahmini YEKDEM (TL/kWh) – faturayı keserken kullandığın
  yekdemNew: number; // kesin YEKDEM (TL/kWh) – ertesi ay gelen resmi değer
};

// DÖNEN SONUÇ: TL, KDV DAHİL (pozitif: kullanıcının aleyhine, negatif: lehine)
export function calculateYekdemMahsup({
  totalKwh,
  kbk,
  btvRate,
  vatRate,
  yekdemOld,
  yekdemNew,
}: YekdemMahsupParams): number {
  if (
    !Number.isFinite(totalKwh) ||
    !Number.isFinite(kbk) ||
    !Number.isFinite(btvRate) ||
    !Number.isFinite(vatRate) ||
    !Number.isFinite(yekdemOld) ||
    !Number.isFinite(yekdemNew)
  ) {
    return 0;
  }

  // 1) YEKDEM birim fiyat farkı (TL/kWh)
  const diffYekdem = yekdemNew - yekdemOld;

  // 2) Enerji bedeli farkı (KBK * kWh ile çarpılıyor)
  const deltaEnergy = diffYekdem * kbk * totalKwh;

  // 3) BTV ekle
  const subtotalWithoutVat = deltaEnergy * (1 + btvRate);

  // 4) KDV ekle → net mahsup tutarı
  const deltaTotal = subtotalWithoutVat * (1 + vatRate);

  return deltaTotal;
}

// İstersen kullanmak için küçük helper:
// InvoiceBreakdown + YEKDEM Mahsup → tek obje
export interface InvoiceWithMahsup extends InvoiceBreakdown {
  yekdemMahsup: number;   // TL, KDV dahil
  totalWithMahsup: number; // totalInvoice + yekdemMahsup
}

export function applyYekdemMahsup(
  base: InvoiceBreakdown,
  yekdemMahsup: number
): InvoiceWithMahsup {
  return {
    ...base,
    yekdemMahsup,
    totalWithMahsup: base.totalInvoice + yekdemMahsup,
  };
}
