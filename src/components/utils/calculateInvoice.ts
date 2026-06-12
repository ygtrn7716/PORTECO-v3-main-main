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
  // 10 yıl üstü tesislerde veriş FAZLASI (çekişten geçen kısım) USD bazlı satılır.
  // Mahsup kısmı (çekişe eşit veriş) her tesis için aynı (enerji birim fiyatı).
  onYil?: boolean;
  perakendeEnerjiBedeli?: number; // TL/kWh, distribution_tariff_official'dan
  // Ay sonu USD/TL kuru (subscription_yekdem.usd_kur). on_yil=true ve usd_kur>0
  // ise veriş fazlası 0.133 × usd_kur birim fiyatıyla satılır. NULL/0 ise
  // perakende_enerji_bedeli formülüne fallback yapılır.
  usdKur?: number;

  // Lisanslı Satış Üretim Tesisi: true ise mahsuplaşma tamamen kapatılır;
  // tüm üretim doğrudan satış olarak işlenir. on_yil ile bağımsız çalışır
  // (ikisi de true olabilir — on_yil bu durumda sadece satış birim fiyatını
  // belirler, mahsup davranışında lisansliSatis baskındır).
  lisansliSatis?: boolean;
}

// 10 yıl üstü tesislerin veriş fazlası satışında kullanılan sabit USD birim fiyatı.
// Toplam birim fiyat (TL/kWh) = VERIS_USD_BIRIM_FIYAT × usd_kur.
const VERIS_USD_BIRIM_FIYAT = 0.133;

export interface InvoiceBreakdown {
  energyCharge: number;
  distributionCharge: number;
  distributionBaseKwh: number; // totalConsumptionKwh + trafoKwh (çekiş)
  distributionAdjustment: number; // Veriş kaynaklı dağıtım indirimi = (D/2) × verişKwh
  distributionChargeKwh: number; // Dağıtım bedeli açıklamasında gösterilecek kWh (distributionCharge / effectiveDistributionUnitPrice)
  verisKwh: number; // Dağıtım hesabında kullanılan veriş kWh
  effectiveDistributionUnitPrice: number; // distributionCharge / netKwh (veya override durumda unitPriceDistribution)
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
  verisMahsupBedeli: number; // mahsup×unitPrice — FATURADAN DÜŞÜLEN kısım
  verisFazlaBedeli: number;  // fazla×birim — faturadan DÜŞÜLMEZ; ayrı "GES Üretim Satışı" kartında
  verisSatisBedeli: number; // toplam (mahsup+fazla) — geriye-uyum/audit; subtotal'a GİRMEZ

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

  const lisansliSatis = input.lisansliSatis ?? false;

  // 1) Enerji + dağıtım
  const energyCharge = unitPriceEnergy * totalConsumptionKwh;

  // ✅ Trafo bedeli (null/0 ise 0)
  const trafoKwh =
    trafoDegeri != null && Number.isFinite(trafoDegeri) && trafoDegeri > 0
      ? trafoDegeri
      : 0;

  const trafoCharge = unitPriceEnergy * trafoKwh;

  // Çekiş tabanı:
  // - Normal tesisler: trafo kaybı şebekeden çekilen enerjinin bir parçasıdır
  //   → çekiş = tüketim + trafo
  // - Lisanslı Satış: tesisin çekişi yok (sadece üretim/satış). Trafo bedeli
  //   ayrı bir gider satırı olarak kalır; dağıtım ve BTV hesabına girmez,
  //   mahsuplaşmaya katılmaz.
  const distributionBaseKwh = lisansliSatis
    ? totalConsumptionKwh
    : totalConsumptionKwh + trafoKwh;

  // Veriş kWh (pozitifse al, değilse 0)
  const verisKwh = (totalProductionKwh ?? 0) > 0 ? totalProductionKwh! : 0;

  // Çekiş ve net kWh
  const cekisCharge = unitPriceDistribution * distributionBaseKwh;
  const netKwh = totalConsumptionKwh - verisKwh;

  // Dağıtım bedeli:
  //  - Satış var (veriş > çekiş) → dağıtım = (D/2) × çekiş
  //      Net üretici olan tesisler için tarife biriminin yarısı uygulanır.
  //      Veriş çekişe eşit olduğunda satış 0'dır, bu kural devreye girmez.
  //  - Üretim = çekiş (satış yok, rare edge) → dağıtım = D × çekiş
  //      Mahsup uygulanmaz; tam tarife (negatife düşmez).
  //  - Normal (veriş < çekiş) → mahsuplu eski formül: çekiş×D - veriş×(D/2)
  let distributionAdjustment: number;
  let distributionCharge: number;
  let distributionChargeKwh: number;
  let effectiveDistributionUnitPrice: number;

  if (lisansliSatis) {
    // Lisanslı Satış: mahsup yok, dağıtım tam tarifeyle çekiş üzerinden alınır
    distributionAdjustment = 0;
    distributionCharge = cekisCharge;
    distributionChargeKwh = distributionBaseKwh;
    effectiveDistributionUnitPrice = unitPriceDistribution;
  } else if (verisKwh > totalConsumptionKwh) {
    // Satış var → (D/2) × çekiş
    distributionCharge = (unitPriceDistribution / 2) * distributionBaseKwh;
    distributionAdjustment = cekisCharge - distributionCharge; // = cekisCharge / 2
    distributionChargeKwh = distributionBaseKwh;
    effectiveDistributionUnitPrice = unitPriceDistribution / 2;
  } else if (netKwh <= 0) {
    // Üretim = tüketim (satış yok)
    distributionAdjustment = 0;
    distributionCharge = cekisCharge;
    distributionChargeKwh = distributionBaseKwh;
    effectiveDistributionUnitPrice = unitPriceDistribution;
  } else {
    // Normal: çekiş>veriş, mahsuplu eski formül
    distributionAdjustment = (unitPriceDistribution / 2) * verisKwh;
    distributionCharge = cekisCharge - distributionAdjustment;
    distributionChargeKwh = netKwh;
    effectiveDistributionUnitPrice = netKwh !== 0
      ? distributionCharge / netKwh
      : unitPriceDistribution;
  }

  console.log('[DAGITIM]', { verisKwh, cekisCharge, distributionAdjustment, distributionCharge, distributionChargeKwh, effectiveDistributionUnitPrice, netKwh });

  // 2) BTV (net enerji bedeli üzerinden — veriş mahsuplu)
  // netKwh = totalConsumptionKwh - verisKwh (dağıtımda da aynı)
  // Lisanslı Satış: veriş düşülmez, BTV tüketim üzerinden hesaplanır.
  // Trafo bedeli ayrı bir gider; BTV hesabına dahil edilmez.
  const netEnergyKwh = lisansliSatis ? totalConsumptionKwh : Math.abs(netKwh);
  const netEnergyCharge = unitPriceEnergy * netEnergyKwh;
  const btvCharge = lisansliSatis
    ? netEnergyCharge * btvRate
    : (netEnergyCharge + trafoCharge) * btvRate;

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

  // 4.5) Veriş satış bedeli (iki katmanlı)
  //
  // MAHSUP kısmı (çekişe eşit kısım) — her tesis için aynı:
  //   verisMahsupKwh × unitPriceEnergy   (o ayın enerji birim fiyatı)
  //
  // FAZLA kısmı (çekişi aşan kısım) — tesis tipine göre değişir:
  //   • on_yil = true  ve  usd_kur > 0 → verisFazlaKwh × 0.133 × usd_kur
  //   • aksi halde (10 yıl altı VEYA usd_kur tanımsız) → verisFazlaKwh × perakende_enerji_bedeli
  //
  // Sonuç fatura toplamından düşülür (kullanıcı lehine). Mahsup ve fazla
  // bedellerinin toplamı verisSatisBedeli olarak return edilir.
  const onYil = input.onYil ?? false;
  const perakendeEnerjiBedeli = input.perakendeEnerjiBedeli ?? 0;
  const usdKur = input.usdKur ?? 0;

  // Lisanslı Satış: mahsup yok; tüm üretim "fazla" (satış) olarak işlenir.
  const verisMahsupKwh = lisansliSatis
    ? 0
    : verisKwh > 0
      ? Math.min(verisKwh, totalConsumptionKwh)
      : 0;
  const verisFazlaKwh = lisansliSatis
    ? verisKwh
    : verisKwh > 0
      ? Math.max(0, verisKwh - totalConsumptionKwh)
      : 0;

  // Fazla kısmı için birim fiyat seçimi (USD veya TL fallback)
  const verisFazlaUseUsd = onYil && usdKur > 0;
  const verisFazlaBirim = verisFazlaUseUsd
    ? VERIS_USD_BIRIM_FIYAT * usdKur          // 10 yıl üstü + kur var: 0.133 × kur
    : perakendeEnerjiBedeli;                   // 10 yıl altı VEYA kur tanımsız: TL perakende

  const verisMahsupBedeli = verisMahsupKwh * unitPriceEnergy;
  const verisFazlaBedeli  = verisFazlaKwh * verisFazlaBirim;
  const verisSatisBedeli  = verisKwh > 0
    ? (verisMahsupBedeli + verisFazlaBedeli)
    : 0;

  // 5) Ara toplam + KDV
  //
  // ⚠️ Faturadan YALNIZCA veriş MAHSUBU düşülür (tüketimle netleşen kısım).
  // Veriş FAZLASI satışı (müşterinin kendi kestiği fatura) toplamlara GİRMEZ;
  // ayrı "GES Üretim Satışı" kartında gösterilir. Böylece fatura yalnızca
  // müşterinin gerçekten ödeyeceği tutarı yansıtır (eksiye düşmez).
  const subtotalBeforeVat =
    energyCharge +
    trafoCharge + // ✅ eklendi
    distributionCharge +
    btvCharge +
    powerTotalCharge +
    reactivePenaltyCharge -
    verisMahsupBedeli;

  const vatCharge = subtotalBeforeVat * vatRate;
  const totalInvoice = subtotalBeforeVat + vatCharge;

  return {
    energyCharge,
    trafoCharge, // ✅
    distributionCharge,
    distributionBaseKwh,
    distributionAdjustment,
    distributionChargeKwh,
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
    verisMahsupBedeli,
    verisFazlaBedeli,
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
