// src/utils/calculateInvoice.ts

import type {
  AppliedInvoiceOverrides,
  InvoiceOverrideItemKey,
  InvoiceOverrides,
} from "./invoiceOverrides";

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

  // Kayseri OSB (vhs_kayseri): dağıtım bedeli OSB tarafından ayrı faturalandırılır.
  // true ise Dağıtım Bedeli kalemi tamamen kaldırılır (charge/adjustment/kWh/birim = 0);
  // diğer tüm kalemler (Enerji, BTV, Güç, Reaktif, Veriş Mahsup, KDV) aynen hesaplanır.
  excludeDistributionCharge?: boolean;

  // Saatlik net mahsup (YALNIZCA net üretici, lisanslı olmayan tesislerde kullanılır).
  // Sağlandığında: dağıtım bedeli bazı net pozitif çekişe, GES üretim satışı kWh'ı
  // net fazla verişe döner. Verilmezse (eski snapshot / non-GES) aylık davranışa
  // fallback yapılır. Birim fiyat (D/2) ve enerji tarafı her durumda aynı kalır.
  netPositiveDrawKwh?: number; // Σ max(0, cn_saat − gn_saat)
  netExcessFeedKwh?: number;   // Σ max(0, gn_saat − cn_saat)
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

  // Uygulanan override özeti — yalnızca overrides parametresi kalem içerdiğinde
  // set edilir (UI satır gizleme + "düzenlendi" işaretleme için).
  appliedOverrides?: AppliedInvoiceOverrides;
}

export function calculateInvoice(
  input: InvoiceInput,
  overrides?: InvoiceOverrides | null
): InvoiceBreakdown {
  const {
    totalConsumptionKwh,
    unitPriceEnergy: unitPriceEnergyInput,
    unitPriceDistribution: unitPriceDistributionInput,
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
    netPositiveDrawKwh,
    netExcessFeedKwh,
  } = input;

  const lisansliSatis = input.lisansliSatis ?? false;
  const excludeDistributionCharge = input.excludeDistributionCharge ?? false;

  // Fatura kalem override'ları — GİRDİ SEVİYESİ (Aşama 1).
  // Birim fiyat override'ı mutlak değerle YERİNE geçer; shadow edilen isimler
  // sayesinde aşağıdaki formül zinciri (enerji, trafo, dağıtım, BTV, veriş
  // mahsup bedeli) efektif fiyattan doğal olarak akar.
  const ov = overrides ?? null;
  const enerjiUnitOv = ov?.enerji?.unitPriceOverride;
  const dagitimUnitOv = ov?.dagitim?.unitPriceOverride;
  const unitPriceEnergy =
    enerjiUnitOv != null && Number.isFinite(enerjiUnitOv)
      ? enerjiUnitOv
      : unitPriceEnergyInput;
  const unitPriceDistribution =
    dagitimUnitOv != null && Number.isFinite(dagitimUnitOv)
      ? dagitimUnitOv
      : unitPriceDistributionInput;

  // 1) Enerji + dağıtım
  let energyCharge = unitPriceEnergy * totalConsumptionKwh;

  // ✅ Trafo bedeli (null/0 ise 0)
  const trafoKwh =
    trafoDegeri != null && Number.isFinite(trafoDegeri) && trafoDegeri > 0
      ? trafoDegeri
      : 0;

  let trafoCharge = unitPriceEnergy * trafoKwh;

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

  // Saatlik net mahsup, ÜRETİMİ OLAN (veriş > 0) tüm lisanssız tesislerde devreye
  // girer — hem net üretici hem net tüketici. (Net tüketici de saat bazında fazla
  // üretip satabilir.) İki saatlik-net toplamı da geçilmiş olmalı. Aksi halde
  // (üretimsiz / lisanslı / değerler yok) aylık davranış korunur.
  const useHourlyNet =
    !lisansliSatis &&
    verisKwh > 0 &&
    netPositiveDrawKwh != null && Number.isFinite(netPositiveDrawKwh) &&
    netExcessFeedKwh != null && Number.isFinite(netExcessFeedKwh);

  // Dağıtım bedeli — kullanıcı bazlı iki-durumlu formül (sadeleştirme YOK):
  //  • Lisanslı Satış → mahsup yok, dağıtım = D × çekiş.
  //  • Aksi halde (mahsuplu tesisler): birim fiyat ÖNCE hesaplanır, sonra
  //    "mahsup edilmiş tüketim" (BAZ = net pozitif çekiş) ile çarpılarak tutar
  //    bulunur. Tutar AYLIK çekiş/veriş + /2 ile hesaplanır (dağıtım aylık, GES
  //    satışı saatlik — hibrit kasıtlı). D = unitPriceDistribution.
  //      CASE 1 — toplam veriş > toplam çekiş (net üretici):
  //        birim = (çekiş × D / 2) / BAZ ;            tutar = birim × BAZ
  //      CASE 2 — toplam veriş ≤ toplam çekiş (net tüketici; sınır da Case 2):
  //        birim = (çekiş × D − veriş × D / 2) / BAZ ; tutar = birim × BAZ
  //    "çekiş" trafoyu içerir (distributionBaseKwh = tüketim + trafo). Durum
  //    ayrımı ise toplam veriş ile toplam tüketim (Σcn, trafosuz) karşılaştırılarak
  //    yapılır. BAZ = net_positive_draw_kwh (saatlik öz-tüketim sonrası net çekiş,
  //    trafosuz); böylece üretimsiz/trafolu tesiste tutar bugünkü D×(çekiş) ile
  //    birebir aynı kalır, gösterilen birim trafo etkisini bugünküyle aynı yansıtır.
  let distributionAdjustment: number;
  let distributionCharge: number;
  let distributionChargeKwh: number;
  let effectiveDistributionUnitPrice: number;

  if (excludeDistributionCharge) {
    // Kayseri OSB: dağıtım bedeli faturada yok (OSB ayrı tahsil eder).
    distributionAdjustment = 0;
    distributionCharge = 0;
    distributionChargeKwh = 0;
    effectiveDistributionUnitPrice = 0;
  } else if (lisansliSatis) {
    // Lisanslı Satış: mahsup yok, dağıtım tam tarifeyle çekiş üzerinden alınır
    distributionAdjustment = 0;
    distributionCharge = cekisCharge;
    distributionChargeKwh = distributionBaseKwh;
    effectiveDistributionUnitPrice = unitPriceDistribution;
  } else {
    // Mahsup edilmiş tüketim (BAZ) = net pozitif çekiş. Saatlik net yoksa
    // (eski snapshot / non-GES) aylık fallback: max(0, toplam çekiş − toplam veriş).
    const mahsupBaz =
      netPositiveDrawKwh != null && Number.isFinite(netPositiveDrawKwh)
        ? netPositiveDrawKwh
        : Math.max(0, totalConsumptionKwh - verisKwh);

    // Durum ayrımı: toplam veriş vs toplam çekiş (Σcn). Sınır (veriş = çekiş) → Case 2.
    const netProducer = verisKwh > totalConsumptionKwh;

    // Sadeleştirilmiş eşdeğer tutar — yalnızca sıfıra bölme guard'ında doğrudan
    // kullanılır; baz > 0 iken tutar birim × baz ile (aynı değere) yeniden üretilir.
    const verisCharge = unitPriceDistribution * verisKwh;
    const simplifiedCharge = netProducer
      ? cekisCharge / 2
      : cekisCharge - verisCharge / 2;

    if (mahsupBaz > 0) {
      // Birim fiyatı ÖNCE hesapla, sonra bazla çarp (müşteri o ayki birim fiyatı görür).
      effectiveDistributionUnitPrice = simplifiedCharge / mahsupBaz;
      distributionCharge = effectiveDistributionUnitPrice * mahsupBaz;
      distributionChargeKwh = mahsupBaz;
    } else {
      // Sıfıra bölme guard'ı: birim 0 (gösterimde "—"), tutar sadeleştirilmiş eşdeğer.
      // NaN/Infinity faturaya asla yansımaz.
      effectiveDistributionUnitPrice = 0;
      distributionCharge = simplifiedCharge;
      distributionChargeKwh = 0;
    }
    distributionAdjustment = cekisCharge - distributionCharge;
  }

  // 2) BTV (net enerji bedeli üzerinden — veriş mahsuplu)
  // netKwh = totalConsumptionKwh - verisKwh (dağıtımda da aynı)
  // Lisanslı Satış: veriş düşülmez, BTV tüketim üzerinden hesaplanır.
  // Trafo bedeli ayrı bir gider; BTV hesabına dahil edilmez.
  // Saatlik net devredeyse net enerji = net pozitif çekiş (şebekeden gerçekte
  // çekilen); aksi halde aylık |net|.
  const netEnergyKwh = lisansliSatis
    ? totalConsumptionKwh
    : useHourlyNet
      ? netPositiveDrawKwh!
      : Math.abs(netKwh);
  const netEnergyCharge = unitPriceEnergy * netEnergyKwh;
  let btvCharge = lisansliSatis
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

  let powerTotalCharge = powerBaseCharge + powerExcessCharge;

  // 4) Reaktif ceza
  let reactivePenaltyCharge =
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

  // Enerji mahsubu (faturadan düşülen kısım):
  //  • Lisanslı Satış: mahsup yok; tüm üretim "fazla" (satış).
  //  • Saatlik net devrede: SAAT-İÇİ örtüşme Σ min(cn,gn) = tüketim − net pozitif
  //    çekiş. Satılan enerji (net fazla veriş) burada mahsup EDİLMEZ — yoksa aynı
  //    kWh hem satışta hem mahsupta sayılır (çift sayım). Böylece net enerji =
  //    net pozitif çekiş × birim olur.
  //  • Aksi halde (aylık): min(veriş, tüketim).
  const verisMahsupKwh = lisansliSatis
    ? 0
    : useHourlyNet
      ? Math.max(0, totalConsumptionKwh - netPositiveDrawKwh!)
      : verisKwh > 0
        ? Math.min(verisKwh, totalConsumptionKwh)
        : 0;
  // Satılan (fazla) veriş kWh'ı. Saatlik net devredeyse net fazla veriş
  // (Σ max(0, gn−cn)); aksi halde aylık fazla (Σgn − Σtüketim).
  const verisFazlaKwh = lisansliSatis
    ? verisKwh
    : useHourlyNet
      ? netExcessFeedKwh!
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

  // 4.6) Fatura kalem override'ları — KALEM SEVİYESİ (toplamlardan önce).
  // Öncelik: isExcluded > amountOverride. Kalemler arası bağımlılık zinciri
  // KURULMAZ (BTV bu noktadan önce doğal charge'lardan hesaplanmıştır; enerji
  // exclude edilse bile BTV doğal kalır — admin isterse BTV'yi ayrıca override
  // eder). Tek doğal zincir yukarıdaki birim fiyat override'ıdır.
  let appliedOverrides: AppliedInvoiceOverrides | undefined;
  if (ov && Object.keys(ov).length > 0) {
    const excludedItems: InvoiceOverrideItemKey[] = [];
    const amountOverriddenItems: InvoiceOverrideItemKey[] = [];
    const applyItem = (key: InvoiceOverrideItemKey, current: number): number => {
      const item = ov[key];
      if (!item) return current;
      if (item.isExcluded) {
        excludedItems.push(key);
        return 0;
      }
      if (item.amountOverride != null && Number.isFinite(item.amountOverride)) {
        amountOverriddenItems.push(key);
        return item.amountOverride;
      }
      return current;
    };

    energyCharge = applyItem("enerji", energyCharge);
    trafoCharge = applyItem("trafo", trafoCharge);
    distributionCharge = applyItem("dagitim", distributionCharge);
    btvCharge = applyItem("btv", btvCharge);
    reactivePenaltyCharge = applyItem("reaktif", reactivePenaltyCharge);

    // Güç: base + aşım TEK kalem olarak override edilir; base+aşım=total
    // değişmezi korunur (base = efektif toplam, aşım = 0).
    const gucItem = ov.guc;
    if (
      gucItem &&
      (gucItem.isExcluded ||
        (gucItem.amountOverride != null &&
          Number.isFinite(gucItem.amountOverride)))
    ) {
      powerTotalCharge = applyItem("guc", powerTotalCharge);
      powerBaseCharge = powerTotalCharge;
      powerExcessCharge = 0;
    }

    appliedOverrides = {
      excludedItems,
      amountOverriddenItems,
      unitPriceEnergyOverridden:
        enerjiUnitOv != null && Number.isFinite(enerjiUnitOv),
      unitPriceDistributionOverridden:
        dagitimUnitOv != null && Number.isFinite(dagitimUnitOv),
    };
  }

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
    // Override yokken anahtar hiç eklenmez → override'sız çıktı bit-identik.
    ...(appliedOverrides ? { appliedOverrides } : {}),
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
