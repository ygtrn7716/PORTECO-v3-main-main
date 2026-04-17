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

  // Veriş (gn) toplam kWh — pozitif değer; 0/undefined ise adj=0
  totalProductionKwh?: number;

  // GES lisans durumu
  onYil?: boolean;               // true = 10+ yıl (PTF ile satış), false = ulusal tarife
  perakendeEnerjiBedeli?: number; // TL/kWh, distribution_tariff_official'dan
}

export interface InvoiceBreakdown {
  energyCharge: number;
  distributionCharge: number;
  distributionBaseKwh: number; // totalConsumptionKwh + trafoKwh (çekiş)
  distributionAdjustment: number; // Veriş kaynaklı dağıtım indirimi = (D/2) × verişKwh
  verisKwh: number; // Dağıtım hesabında kullanılan veriş kWh
  effectiveDistributionUnitPrice: number; // distributionCharge / netKwh
  netEnergyKwh: number;     // totalConsumptionKwh - verisKwh
  netEnergyCharge: number;  // unitPriceEnergy × netEnergyKwh
  btvCharge: number;

  powerBaseCharge: number;
  powerExcessCharge: number;
  powerTotalCharge: number;

  // 🔥 Reaktif ceza (KDV öncesi)
  reactivePenaltyCharge: number;

  // Veriş satış bedeli (ulusal tarife mahsubu)
  verisMahsupKwh: number;   // min(verisKwh, totalConsumptionKwh) — birim fiyatla mahsup edilen
  verisFazlaKwh: number;    // max(0, verisKwh - totalConsumptionKwh) — perakende ile satılan
  verisSatisBedeli: number; // toplam: (mahsup×unitPrice) + (fazla×perakende)

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
    totalProductionKwh,
  } = input;

  // 1) Enerji + dağıtım
  const energyCharge = unitPriceEnergy * totalConsumptionKwh;

  // ✅ Trafo bedeli (null/0 ise 0)
  const trafoKwh =
    trafoDegeri != null && Number.isFinite(trafoDegeri) && trafoDegeri > 0
      ? trafoDegeri
      : 0;

  const trafoCharge = unitPriceEnergy * trafoKwh;

  const distributionBaseKwh = totalConsumptionKwh + trafoKwh; // çekiş

  // Veriş kWh (pozitifse al, değilse 0)
  const verisKwh = (totalProductionKwh ?? 0) > 0 ? totalProductionKwh! : 0;

  // Yeni formül: çekiş×D - veriş×(D/2)
  const cekisCharge = unitPriceDistribution * distributionBaseKwh;
  const distributionAdjustment = (unitPriceDistribution / 2) * verisKwh;
  const distributionCharge = cekisCharge - distributionAdjustment;

  // Efektif birim fiyat
  const netKwh = totalConsumptionKwh - verisKwh;
  const effectiveDistributionUnitPrice = netKwh !== 0
    ? distributionCharge / netKwh
    : unitPriceDistribution;

  console.log('[DAGITIM]', { verisKwh, cekisCharge, distributionAdjustment, distributionCharge, effectiveDistributionUnitPrice, netKwh });

  // 2) BTV (net enerji bedeli üzerinden — veriş mahsuplu)
  // netKwh = totalConsumptionKwh - verisKwh (dağıtımda da aynı)
  const netEnergyKwh = Math.abs(netKwh);  // çekiş - veriş, mutlak değer
  const netEnergyCharge = unitPriceEnergy * netEnergyKwh;
  const btvCharge = (netEnergyCharge + trafoCharge) * btvRate;

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

  // 4.5) Veriş satış bedeli (ulusal tarife mahsubu — iki katmanlı)
  const onYil = input.onYil ?? true;
  const perakendeEnerjiBedeli = input.perakendeEnerjiBedeli ?? 0;

  // Çekişi geçmeyen kısım → o ayın birim fiyatıyla mahsup
  // Çekişi geçen kısım → perakende enerji bedeliyle satılır
  const verisMahsupKwh = !onYil && verisKwh > 0
    ? Math.min(verisKwh, totalConsumptionKwh)
    : 0;
  const verisFazlaKwh = !onYil && verisKwh > 0
    ? Math.max(0, verisKwh - totalConsumptionKwh)
    : 0;
  const verisSatisBedeli = !onYil && verisKwh > 0
    ? (verisMahsupKwh * unitPriceEnergy) + (verisFazlaKwh * perakendeEnerjiBedeli)
    : 0;

  // 5) Ara toplam + KDV
  const subtotalBeforeVat =
    energyCharge +
    trafoCharge + // ✅ eklendi
    distributionCharge +
    btvCharge +
    powerTotalCharge +
    reactivePenaltyCharge -
    verisSatisBedeli;

  const vatCharge = subtotalBeforeVat * vatRate;
  const totalInvoice = subtotalBeforeVat + vatCharge;

  return {
    energyCharge,
    trafoCharge, // ✅
    distributionCharge,
    distributionBaseKwh,
    distributionAdjustment,
    verisKwh,
    effectiveDistributionUnitPrice,
    netEnergyKwh,
    netEnergyCharge,
    btvCharge,
    powerBaseCharge,
    powerExcessCharge,
    powerTotalCharge,
    reactivePenaltyCharge,
    verisMahsupKwh,
    verisFazlaKwh,
    verisSatisBedeli,
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
