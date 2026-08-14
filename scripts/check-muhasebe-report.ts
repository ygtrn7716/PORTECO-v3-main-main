// scripts/check-muhasebe-report.ts
// Muhasebe Excel — buildMuhasebeReport kabul testi (7 senaryo + kapanış + invariant + cfCheck).
// Kullanım: npm run check:muhasebe
//
// SAF fonksiyon testidir: DB'ye HİÇBİR ŞEY yazmaz/okumaz. Metot 1 senaryoları
// el-hesaplı self-consistent fixture; PENGUEN senaryosu (S6) ise MOTOR-TÜREVLİ:
// billed + karşı-olgu breakdown'ları calculateInvoiceMethod2'den, girdiler canlı
// DB'den birebir (snapshot + saatlik SQL) — fixture tuning YOK. buildMuhasebeReport
// ve calculateInvoiceNetMethods runtime-import'suz olduğundan tsx altında
// @/lib/supabase zincirine girmeden yüklenir.

import { buildMuhasebeReport } from "../src/components/dashboard/reports/muhasebeReport";
import type { MuhasebePayload } from "../src/components/dashboard/reports/muhasebeReport";
import type { InvoiceBreakdown } from "../src/components/utils/calculateInvoice";
import {
  calculateInvoiceMethod2,
  type InvoiceMethodInputs,
  type MethodInvoiceBreakdown,
  type MethodInvoiceInput,
} from "../src/components/utils/calculateInvoiceNetMethods";
import type { GesOlmasaydiResult } from "../src/components/utils/calculateGesOlmasaydi";
import { buildPenguenTahakkukView } from "../src/components/dashboard/reports/penguenTahakkukView";

// ── Test harness ────────────────────────────────────────────────
let failures = 0;
const money = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TOL = 0.01;

function assertClose(label: string, actual: number, expected: number, tol = TOL) {
  const diff = Math.abs(actual - expected);
  const ok = diff <= tol;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "✅" : "❌"} ${label.padEnd(46)} = ${money(actual).padStart(16)}` +
      `   (beklenen ${money(expected)}, Δ ${diff.toFixed(4)})`,
  );
}
function assertTrue(label: string, cond: boolean) {
  if (!cond) failures++;
  console.log(`  ${cond ? "✅" : "❌"} ${label}`);
}

// ── Fixture kurucular ───────────────────────────────────────────
type BreakdownParts = {
  energyCharge: number;
  netEnergyCharge: number;
  trafoCharge: number;
  distributionCharge: number;
  distributionBaseKwh: number;
  distributionAdjustment: number;
  distributionChargeKwh: number;
  btvCharge: number;
  powerBaseCharge: number;
  powerExcessCharge: number;
  reactivePenaltyCharge: number;
  verisMahsupKwh: number;
  verisFazlaKwh: number;
  verisMahsupBedeli: number;
  verisKwh: number;
};

/** subtotalBeforeVat'ı calculateInvoice.ts L418-425 formülüyle TÜRETİR → self-consistent. */
function makeBreakdown(o: BreakdownParts, vatRate: number): InvoiceBreakdown {
  const powerTotalCharge = o.powerBaseCharge + o.powerExcessCharge;
  const subtotalBeforeVat =
    o.energyCharge +
    o.trafoCharge +
    o.distributionCharge +
    o.btvCharge +
    powerTotalCharge +
    o.reactivePenaltyCharge -
    o.verisMahsupBedeli;
  const vatCharge = subtotalBeforeVat * vatRate;
  const totalInvoice = subtotalBeforeVat + vatCharge;
  return {
    energyCharge: o.energyCharge,
    distributionCharge: o.distributionCharge,
    distributionBaseKwh: o.distributionBaseKwh,
    distributionAdjustment: o.distributionAdjustment,
    distributionChargeKwh: o.distributionChargeKwh,
    verisKwh: o.verisKwh,
    effectiveDistributionUnitPrice:
      o.distributionChargeKwh > 0 ? o.distributionCharge / o.distributionChargeKwh : 0,
    netEnergyKwh: 0, // builder netEnergyCharge kullanır; kWh önemsiz
    netEnergyCharge: o.netEnergyCharge,
    btvCharge: o.btvCharge,
    powerBaseCharge: o.powerBaseCharge,
    powerExcessCharge: o.powerExcessCharge,
    powerTotalCharge,
    reactivePenaltyCharge: o.reactivePenaltyCharge,
    verisMahsupKwh: o.verisMahsupKwh,
    verisFazlaKwh: o.verisFazlaKwh,
    verisMahsupBedeli: o.verisMahsupBedeli,
    verisFazlaBedeli: 0,
    verisSatisBedeli: 0,
    subtotalBeforeVat,
    vatCharge,
    totalInvoice,
    trafoCharge: o.trafoCharge,
  };
}

// Metot 2 (Uedaş net) sentetik fixture: enerji + YEK tabanı NET; subtotal
// verisMahsupBedeli'yi DÜŞMEZ, yek kalemlerini EKLER (calculateNetMethod L339-348).
type Method2Parts = {
  sumPos: number;
  sumMahsup: number;
  energyCharge: number; // = sumPos × eUP
  yekTahminiCharge: number; // = sumPos × yekUP
  yekFarkiCharge: number;
  distributionCharge: number; // brüt (sumCn) tabanlı
  btvCharge: number; // = energyCharge × btvRate
  verisFazlaKwh: number;
  trafoCharge?: number;
  powerBaseCharge?: number;
  powerExcessCharge?: number;
  reactivePenaltyCharge?: number;
};
function makeMethod2Breakdown(o: Method2Parts, vatRate: number): MethodInvoiceBreakdown {
  const trafo = o.trafoCharge ?? 0;
  const powerBase = o.powerBaseCharge ?? 0;
  const powerExcess = o.powerExcessCharge ?? 0;
  const reactive = o.reactivePenaltyCharge ?? 0;
  const powerTotalCharge = powerBase + powerExcess;
  const eUP = o.sumPos > 0 ? o.energyCharge / o.sumPos : 0;
  const grossKwh = o.sumPos + o.sumMahsup; // sumCn
  const verisMahsupBedeli = o.sumMahsup * eUP;
  const subtotalBeforeVat =
    o.energyCharge + trafo + o.yekTahminiCharge + o.yekFarkiCharge + o.distributionCharge +
    powerTotalCharge + reactive + o.btvCharge; // verisMahsupBedeli DÜŞÜLMEZ
  const vatCharge = subtotalBeforeVat * vatRate;
  const totalInvoice = subtotalBeforeVat + vatCharge;
  return {
    energyCharge: o.energyCharge,
    distributionCharge: o.distributionCharge,
    distributionBaseKwh: grossKwh,
    distributionAdjustment: 0,
    distributionChargeKwh: grossKwh,
    verisKwh: o.sumMahsup + o.verisFazlaKwh,
    effectiveDistributionUnitPrice: grossKwh > 0 ? o.distributionCharge / grossKwh : 0,
    netEnergyKwh: o.sumPos,
    netEnergyCharge: o.energyCharge,
    btvCharge: o.btvCharge,
    powerBaseCharge: powerBase,
    powerExcessCharge: powerExcess,
    powerTotalCharge,
    reactivePenaltyCharge: reactive,
    verisMahsupKwh: o.sumMahsup,
    verisFazlaKwh: o.verisFazlaKwh,
    verisMahsupBedeli,
    verisFazlaBedeli: 0,
    verisSatisBedeli: 0,
    subtotalBeforeVat,
    vatCharge,
    totalInvoice,
    trafoCharge: trafo,
    yekTahminiCharge: o.yekTahminiCharge,
    yekFarkiCharge: o.yekFarkiCharge,
  };
}

function makeGesResult(o: Partial<GesOlmasaydiResult> & {
  mode: "producer" | "receiver";
  mevcutFatura: number;
  mevcutTuketimKwh: number;
  hamTuketimKwh: number;
  gesOlmasaydiFatura: number;
}): GesOlmasaydiResult {
  return {
    mode: o.mode,
    anlikUretimKullanimi: o.anlikUretimKullanimi ?? true,
    hamTuketimKwh: o.hamTuketimKwh,
    mevcutTuketimKwh: o.mevcutTuketimKwh,
    gesUretimKwh: o.gesUretimKwh ?? 0,
    verisMahsupKwh: o.verisMahsupKwh ?? 0,
    allocatedKwh: o.allocatedKwh ?? null,
    satis: o.satis ?? null,
    gesOlmasaydiFatura: o.gesOlmasaydiFatura,
    mevcutFatura: o.mevcutFatura,
    tasarruf: o.tasarruf ?? o.gesOlmasaydiFatura - o.mevcutFatura,
    tasarrufYuzde: o.tasarrufYuzde ?? 0,
    hamBirimFiyat: o.hamBirimFiyat ?? 0,
    mevcutBirimFiyat: o.mevcutBirimFiyat ?? 0,
    gesOlmasaydiBreakdown: o.gesOlmasaydiBreakdown as InvoiceBreakdown,
    counterfactualApproximate: o.counterfactualApproximate ?? false,
  };
}

type Scenario = {
  ad: string;
  payload: MuhasebePayload;
  totalWithMahsup: number;
  expects?: { A?: number; B?: number; C?: number; E1?: number; E2?: number; D1?: number };
  lisansli?: boolean;
  noSale?: boolean;
  method2?: boolean;
  expectS2?: number; // BLOK 2 subtotalKdvHaric
  blok5Mismatch?: boolean; // gesResult.mevcutFatura ≠ total → uyarı, C etkilenmez
  cfChecked: boolean; // öz tüketim ≈ 0 → kimlik kontrolü devrede mi
  cfOk?: boolean; // cfChecked=true iken beklenen sonuç
};

function basePayload(over: Partial<MuhasebePayload>): MuhasebePayload {
  return {
    facilityLabel: "Test Tesisi",
    serno: 1,
    monthLabel: "2026-06",
    periodYear: 2026,
    periodMonth: 6,
    dataSource: "live",
    generatedAtIso: "2026-07-28T10:00:00+03:00",
    breakdown: over.breakdown as MethodInvoiceBreakdown,
    totalConsumptionKwh: 0,
    vatRate: 0.2,
    btvRate: 0.01,
    lisansliSatis: false,
    yekdemMahsup: 0,
    digerDegerler: 0,
    totalWithMahsup: 0,
    contractPowerKw: 0,
    monthFinalDemandKw: 0,
    powerPrice: 0,
    powerExcessPrice: 0,
    reactiveUnitPrice: 0,
    unitPriceEnergy: 0,
    naturalUnitPriceEnergy: 0,
    unitPriceDistribution: 0,
    effectiveDistributionUnitPrice: 0,
    trafoDegeri: 0,
    onYil: false,
    usdKur: 0,
    perakendeEnerjiBedeli: 0,
    dagitimUreticiBedeli: 0,
    kbk: 1,
    monthlyPTF: 0,
    monthlyYekdem: 0,
    unitPriceAdjustment: 0,
    terim: "cift_terim",
    gerilim: "OG",
    tarife: "sanayi",
    tariffType: "dual",
    anlikUretimKullanimi: null,
    invoiceMethodId: 1,
    gesAlloc: null,
    gesResult: over.gesResult as GesOlmasaydiResult,
    ...over,
  };
}

// ── Senaryolar ──────────────────────────────────────────────────
const scenarios: Scenario[] = [];

// 1) ÖZ TÜKETİM — mahsuplu, satış YOK, digerDegerler ≠ 0 (Kriter 11 + 12b).
//    ham ≠ mevcut → cfCheck DEVRE DIŞI.
{
  const vat = 0.2;
  const bd = makeBreakdown(
    {
      energyCharge: 25000, netEnergyCharge: 17500, trafoCharge: 1250,
      distributionCharge: 9000, distributionBaseKwh: 10500, distributionAdjustment: 3600,
      distributionChargeKwh: 7500, btvCharge: 187.5, powerBaseCharge: 5000,
      powerExcessCharge: 800, reactivePenaltyCharge: 300,
      verisMahsupKwh: 3000, verisFazlaKwh: 0, verisMahsupBedeli: 7500, verisKwh: 3000,
    },
    vat,
  );
  const yekdem = -1200, diger = 500;
  const twm = bd.totalInvoice + yekdem + diger; // 40145
  scenarios.push({
    ad: "1) Öz tüketim (mahsuplu, satış yok, diğer≠0)",
    totalWithMahsup: twm,
    noSale: true,
    cfChecked: false,
    expects: { A: 54255, B: -14610, C: 40145, E1: 33337.5, E2: 40145, D1: 0 },
    payload: basePayload({
      breakdown: bd, vatRate: vat, btvRate: 0.01, lisansliSatis: false,
      totalConsumptionKwh: 10000, unitPriceEnergy: 2.5, unitPriceDistribution: 1.2,
      powerPrice: 250, powerExcessPrice: 400, contractPowerKw: 20, monthFinalDemandKw: 22,
      reactiveUnitPrice: 1.5, yekdemMahsup: yekdem, digerDegerler: diger, totalWithMahsup: twm,
      gesResult: makeGesResult({
        mode: "producer", anlikUretimKullanimi: true, mevcutFatura: twm,
        mevcutTuketimKwh: 10000, hamTuketimKwh: 12500, gesOlmasaydiFatura: 55000,
      }),
    }),
  });
}

// 2) ARAZİ GES (anlikUretimKullanimi=false) — mahsup + satış (USD modu).
//    Öz tüketim 0 → kimlik: gesOlmasaydiFatura = A (yekdem=diger=0) → cfCheck OK.
{
  const vat = 0.18;
  const bd = makeBreakdown(
    {
      energyCharge: 13000, netEnergyCharge: 2600, trafoCharge: 0,
      distributionCharge: 4550, distributionBaseKwh: 5000, distributionAdjustment: 1950,
      distributionChargeKwh: 3500, btvCharge: 26, powerBaseCharge: 2000,
      powerExcessCharge: 0, reactivePenaltyCharge: 150,
      verisMahsupKwh: 4000, verisFazlaKwh: 3000, verisMahsupBedeli: 10400, verisKwh: 7000,
    },
    vat,
  );
  const twm = bd.totalInvoice; // yekdem=diger=0
  const A = 21780 * (1 + vat); // S1 = 13000+6500+130+2000+150 = 21780 → A = 25700.4
  scenarios.push({
    ad: "2) Arazi GES (anlik yok, mahsup + USD satış)",
    totalWithMahsup: twm,
    cfChecked: true,
    cfOk: true,
    payload: basePayload({
      breakdown: bd, vatRate: vat, btvRate: 0.01, lisansliSatis: false,
      totalConsumptionKwh: 5000, unitPriceEnergy: 2.6, unitPriceDistribution: 1.3,
      powerPrice: 200, powerExcessPrice: 300, contractPowerKw: 10, monthFinalDemandKw: 10,
      reactiveUnitPrice: 1.5, totalWithMahsup: twm,
      onYil: true, usdKur: 34, perakendeEnerjiBedeli: 2.0, dagitimUreticiBedeli: 0.35,
      anlikUretimKullanimi: false,
      gesResult: makeGesResult({
        mode: "producer", anlikUretimKullanimi: false, mevcutFatura: twm,
        mevcutTuketimKwh: 5000, hamTuketimKwh: 5000, gesOlmasaydiFatura: A,
      }),
    }),
  });
}

// 3) LİSANSLI SATIŞ — BLOK 2 = 0, tüm üretim satılır. Öz tüketim 0 + cf = A → cfCheck OK.
{
  const vat = 0.2;
  const bd = makeBreakdown(
    {
      energyCharge: 5000, netEnergyCharge: 5000, trafoCharge: 0,
      distributionCharge: 2400, distributionBaseKwh: 2000, distributionAdjustment: 0,
      distributionChargeKwh: 2000, btvCharge: 50, powerBaseCharge: 0,
      powerExcessCharge: 0, reactivePenaltyCharge: 0,
      verisMahsupKwh: 0, verisFazlaKwh: 8000, verisMahsupBedeli: 0, verisKwh: 8000,
    },
    vat,
  );
  const twm = bd.totalInvoice; // 8940
  scenarios.push({
    ad: "3) Lisanslı satış (BLOK2=0, satış var)",
    totalWithMahsup: twm,
    lisansli: true,
    cfChecked: true,
    cfOk: true,
    expects: { B: 0, C: 8940 },
    payload: basePayload({
      breakdown: bd, vatRate: vat, btvRate: 0.01, lisansliSatis: true,
      totalConsumptionKwh: 2000, unitPriceEnergy: 2.5, unitPriceDistribution: 1.2,
      totalWithMahsup: twm,
      onYil: false, usdKur: 0, perakendeEnerjiBedeli: 2.0, dagitimUreticiBedeli: 0.3,
      gesResult: makeGesResult({
        mode: "producer", anlikUretimKullanimi: true, mevcutFatura: twm,
        mevcutTuketimKwh: 2000, hamTuketimKwh: 2000, gesOlmasaydiFatura: 8940,
        satis: { satisKwh: 8000, satisNetGelir: 13600 },
      }),
    }),
  });
}

// 4) ALICI + TALEP BİRLEŞTİRME (receiver, assigned) — BLOK 1 bilgi satırı, satış yok.
//    Öz tüketim 0 → kimlik: cf = A + yekdem → cfCheck OK.
{
  const vat = 0.2;
  const bd = makeBreakdown(
    {
      energyCharge: 14400, netEnergyCharge: 9600, trafoCharge: 0,
      distributionCharge: 4950, distributionBaseKwh: 6000, distributionAdjustment: 1650,
      distributionChargeKwh: 4500, btvCharge: 48, powerBaseCharge: 3000,
      powerExcessCharge: 500, reactivePenaltyCharge: 0,
      verisMahsupKwh: 2000, verisFazlaKwh: 0, verisMahsupBedeli: 4800, verisKwh: 2000,
    },
    vat,
  );
  const yekdem = -300;
  const twm = bd.totalInvoice + yekdem; // 21417.60
  const A = 24572 * (1 + vat); // S1 = 14400+6600+72+3500 = 24572 → A = 29486.4
  scenarios.push({
    ad: "4) Alıcı + talep birleştirme (receiver/assigned)",
    totalWithMahsup: twm,
    noSale: true,
    cfChecked: true,
    cfOk: true,
    payload: basePayload({
      breakdown: bd, vatRate: vat, btvRate: 0.005, lisansliSatis: false,
      totalConsumptionKwh: 6000, unitPriceEnergy: 2.4, unitPriceDistribution: 1.1,
      powerPrice: 300, powerExcessPrice: 500, contractPowerKw: 10, monthFinalDemandKw: 11,
      reactiveUnitPrice: 1.5, yekdemMahsup: yekdem, totalWithMahsup: twm,
      gesAlloc: { role: "assigned", priority: 1, allocatedKwh: 2000, isSource: false },
      gesResult: makeGesResult({
        mode: "receiver", anlikUretimKullanimi: true, mevcutFatura: twm,
        mevcutTuketimKwh: 6000, hamTuketimKwh: 6000, gesOlmasaydiFatura: A + yekdem,
        allocatedKwh: 2000,
      }),
    }),
  });
}

// 5) METOT 2 sentetik — mahsup (enerji + YEK) dolu + satış + pozitif YEK Farkı.
//    REBASE: grossUP = 1.6 (cf breakdown'dan) → residual = 140000×1.6 − 200000 = 24000.
//    ham ≠ mevcut → cfCheck devre dışı; gesResult.mevcutFatura KASITLI farklı →
//    BLOK 5 mutabakat uyarısı, C etkilenmez.
{
  const vat = 0.2;
  const bd = makeMethod2Breakdown(
    {
      sumPos: 100000, sumMahsup: 40000, energyCharge: 200000, // eUP=2,0
      yekTahminiCharge: 110000, yekFarkiCharge: 5000,          // yekUP=1,1
      distributionCharge: 182000, btvCharge: 2000,             // 140000×1,3 ; 200000×%1
      verisFazlaKwh: 20000,
    },
    vat,
  );
  const twm = bd.totalInvoice; // subtotal 499000 → 598800
  scenarios.push({
    ad: "5) Metot 2 sentetik (rebase: residual mahsup, satış, YEK Farkı+)",
    totalWithMahsup: twm,
    method2: true,
    blok5Mismatch: true,
    cfChecked: false,
    expectS2: -68240, // −(24000 + 44000 + 240)
    expects: { C: 598800, A: 680688 }, // S1 = 224000+154000+5000+182000+2240 = 567240
    payload: basePayload({
      breakdown: bd, vatRate: vat, btvRate: 0.01, invoiceMethodId: 2,
      totalConsumptionKwh: 140000, unitPriceEnergy: 2.0, unitPriceDistribution: 1.3,
      totalWithMahsup: twm,
      onYil: false, usdKur: 0, perakendeEnerjiBedeli: 2.0, dagitimUreticiBedeli: 0.3,
      gesResult: makeGesResult({
        mode: "producer", anlikUretimKullanimi: true, mevcutFatura: twm + 1234, // KASITLI farklı
        mevcutTuketimKwh: 140000, hamTuketimKwh: 150000, gesOlmasaydiFatura: 650000,
        gesOlmasaydiBreakdown: { energyUnitPriceApplied: 1.6 } as unknown as InvoiceBreakdown,
      }),
    }),
  });
}

// 6) METOT 2 — PENGUEN 99980910 · June 2026, MOTOR-TÜREVLİ (fixture tuning YOK).
//    Girdiler canlı DB'den birebir: snapshot (sumPos/wPos/kbk/yekdem/dağıtım/satış
//    parametreleri) + saatlik SQL (w_cn = cn-ağırlıklı çıplak PTF) + subscription_yekdem
//    (diger_degerler = 2730). Billed ve karşı-olgu breakdown'ları calculateInvoiceMethod2
//    üretir — calculateGesOlmasaydi'nin arazi dalı birebir taklit edilir (motor aynı).
//    Senaryo 8 (Penguen Tahakkuk adaptörü) da AYNI payload'ı kullanır → fonksiyon.
function buildPenguenS6() {
  const vat = 0.2, btv = 0.01, kbk = 1.0375, yekdem = 1.0945, unitDist = 1.182457;
  const sumCn = 972913.8000000006;            // total_consumption_kwh
  const sumPos = 490581.8850000028;           // net_positive_draw_kwh
  const sumMahsup = sumCn - sumPos;           // 482331.915 (kimlik)
  const sumGn = 1196780.8499999936;           // veris_kwh
  const sumExcess = 714448.9349999967;        // net_excess_feed_kwh
  const wPos = 1.8636664833208443;            // snapshot w_pos (pos-ağırlıklı çıplak PTF)
  const wCn = 1.22287246911391;               // canlı SQL: cn-ağırlıklı çıplak PTF
  const perakende = 2.909687, satisKesinti = 0.656008; // snapshot
  const diger = 2730;                         // subscription_yekdem.diger_degerler

  const input: MethodInvoiceInput = {
    totalConsumptionKwh: sumCn,
    unitPriceEnergy: 2.4042739367056853, // motor m2'de YOK SAYAR (snapshot değeri, görüntü)
    unitPriceDistribution: unitDist,
    btvRate: btv,
    vatRate: vat,
    tariffType: "single",
    contractPowerKw: 3360,
    monthFinalDemandKw: 0,
    powerPrice: 0,
    powerExcessPrice: 0,
    reactivePenaltyCharge: 0,
    trafoDegeri: 0,
    totalProductionKwh: sumGn,
    onYil: false,
    usdKur: 0,
    perakendeEnerjiBedeli: perakende,
  };
  const miBilled: InvoiceMethodInputs = {
    sumCn, sumGn, sumPos, sumMahsup, sumExcess,
    wPos, kbk, tahminiYekdem: yekdem,
    prevSumPos: null, prevTahminiYekdem: 1.32595, prevGerceklesenYekdem: 1.306103,
    mahsuplasmaUnitPrice: null,
  };
  // Karşı-olgu (arazi dalı, buildNoGesCounterfactualMi ile aynı kurulum): gn=0 → pos=cn.
  const miCf: InvoiceMethodInputs = {
    sumCn, sumGn: 0, sumPos: sumCn, sumMahsup: 0, sumExcess: 0,
    wPos: wCn, kbk, tahminiYekdem: yekdem,
    prevSumPos: null, prevTahminiYekdem: 1.32595, prevGerceklesenYekdem: 1.306103,
    mahsuplasmaUnitPrice: null,
  };
  const billed = calculateInvoiceMethod2(input, null, miBilled);
  const cf = calculateInvoiceMethod2({ ...input, totalProductionKwh: 0 }, null, miCf);

  const twm = billed.totalInvoice + diger; // canlı "Genel Toplam (Ödenecek)" = 3.201.399,78
  const gesOlmasaydi = cf.totalInvoice + diger; // panel/Excel = 4.205.038,41
  const satisNet = sumExcess * (perakende - satisKesinti); // ≈ 1.610.138,56

  // Rebase beklentisi (motor çıktılarından türetilir — el sabiti yok):
  const grossUP = cf.energyUnitPriceApplied!; // = wCn × kbk
  const residual = (sumPos + sumMahsup) * grossUP - billed.energyCharge;
  const yekUP = billed.yekTahminiCharge! / sumPos;
  const expectS2 = -(residual + sumMahsup * yekUP + residual * btv);

  const payload = basePayload({
      breakdown: billed, vatRate: vat, btvRate: btv, invoiceMethodId: 2,
      totalConsumptionKwh: sumCn,
      unitPriceEnergy: 2.4042739367056853, naturalUnitPriceEnergy: 2.4042739367056853,
      unitPriceDistribution: unitDist, effectiveDistributionUnitPrice: unitDist,
      yekdemMahsup: 0, digerDegerler: diger, totalWithMahsup: twm,
      onYil: false, usdKur: 0, perakendeEnerjiBedeli: perakende, dagitimUreticiBedeli: satisKesinti,
      kbk, monthlyPTF: wCn, monthlyYekdem: yekdem,
      tariffType: "single", anlikUretimKullanimi: false,
      facilityLabel: "PENGUEN GIDA SANAYİ A.Ş.", serno: 99980910, monthLabel: "June 2026",
      gesResult: makeGesResult({
        mode: "producer", anlikUretimKullanimi: false,
        mevcutFatura: twm, mevcutTuketimKwh: sumCn, hamTuketimKwh: sumCn,
        gesOlmasaydiFatura: gesOlmasaydi,
        satis: { satisKwh: sumExcess, satisNetGelir: satisNet },
        tasarruf: gesOlmasaydi - twm + satisNet,
        gesOlmasaydiBreakdown: cf as unknown as InvoiceBreakdown,
      }),
  });
  return { payload, twm, expectS2, satisNet };
}

{
  const s6 = buildPenguenS6();
  scenarios.push({
    ad: "6) Metot 2 PENGUEN 99980910 (canlı DB, motor-türevli) → C=3.201.399,78",
    totalWithMahsup: s6.twm,
    method2: true,
    cfChecked: true,
    cfOk: true, // KİMLİK KANITI: A + F ≡ gesOlmasaydiFatura — tutmazsa test KIRIK kalır
    expectS2: s6.expectS2,
    expects: { C: 3201399.78, A: 4202308.41, D1: s6.satisNet },
    payload: s6.payload,
  });
}

// 6b) METOT 2 — PENGUEN Temmuz 2026 (canlı DB, motor-türevli): yekFarkiCharge ≠ 0
//     (prev = Haziran: 490.581,885 × (1,083629 − 1,0945) × 1,0375 ≈ −5.533,12).
//     Tahakkuk kabul rakamlarının kaynağı (bölüm 9): Fiş1 4.736.352,72 · Fiş2
//     2.047.107,21 · Fiş3 5.274.201,83 · Diğer Satıcılar 3.227.094,61 = C.
function buildPenguenTemmuz() {
  const vat = 0.2, btv = 0.01, kbk = 1.0375, yekdem = 0.51789, unitDist = 1.182457;
  const sumCn = 966509.5310000011;            // total_consumption_kwh (2026-07)
  const sumPos = 381282.99000000436;          // net_positive_draw_kwh
  const sumMahsup = sumCn - sumPos;
  const sumGn = 1414493.1000000008;           // veris_kwh
  const sumExcess = 829266.5590000051;        // net_excess_feed_kwh
  const wPos = 3.3715411885822735;            // snapshot w_pos
  const wCn = 2.59321141818204;               // canlı SQL: cn-ağırlıklı çıplak PTF (Temmuz)
  const perakende = 2.909687, satisKesinti = 0.656008;
  const diger = 0;                            // subscription_yekdem 2026-07: boş

  const input: MethodInvoiceInput = {
    totalConsumptionKwh: sumCn,
    unitPriceEnergy: 3.2277677213638682, // motor m2'de YOK SAYAR (snapshot, görüntü)
    unitPriceDistribution: unitDist,
    btvRate: btv,
    vatRate: vat,
    tariffType: "single",
    contractPowerKw: 3360,
    monthFinalDemandKw: 0,
    powerPrice: 0,
    powerExcessPrice: 0,
    reactivePenaltyCharge: 0,
    trafoDegeri: 0,
    totalProductionKwh: sumGn,
    onYil: false,
    usdKur: 0,
    perakendeEnerjiBedeli: perakende,
  };
  const prevs = {
    prevSumPos: 490581.8850000028, // Haziran sumPos — yekFarki ≠ 0 kaynağı
    prevTahminiYekdem: 1.0945,
    prevGerceklesenYekdem: 1.083629,
  };
  const miBilled: InvoiceMethodInputs = {
    sumCn, sumGn, sumPos, sumMahsup, sumExcess,
    wPos, kbk, tahminiYekdem: yekdem, ...prevs, mahsuplasmaUnitPrice: null,
  };
  const miCf: InvoiceMethodInputs = {
    sumCn, sumGn: 0, sumPos: sumCn, sumMahsup: 0, sumExcess: 0,
    wPos: wCn, kbk, tahminiYekdem: yekdem, ...prevs, mahsuplasmaUnitPrice: null,
  };
  const billed = calculateInvoiceMethod2(input, null, miBilled);
  const cf = calculateInvoiceMethod2({ ...input, totalProductionKwh: 0 }, null, miCf);
  const twm = billed.totalInvoice + diger; // 3.227.094,61
  const gesOlmasaydi = cf.totalInvoice + diger;
  const satisNet = sumExcess * (perakende - satisKesinti);
  const grossUP = cf.energyUnitPriceApplied!;
  const residual = (sumPos + sumMahsup) * grossUP - billed.energyCharge;
  const yekUP = billed.yekTahminiCharge! / sumPos;
  const expectS2 = -(residual + sumMahsup * yekUP + residual * btv);

  const payload = basePayload({
      breakdown: billed, vatRate: vat, btvRate: btv, invoiceMethodId: 2,
      totalConsumptionKwh: sumCn,
      unitPriceEnergy: 3.2277677213638682, naturalUnitPriceEnergy: 3.2277677213638682,
      unitPriceDistribution: unitDist, effectiveDistributionUnitPrice: unitDist,
      yekdemMahsup: 0, digerDegerler: diger, totalWithMahsup: twm,
      onYil: false, usdKur: 0, perakendeEnerjiBedeli: perakende, dagitimUreticiBedeli: satisKesinti,
      kbk, monthlyPTF: wCn, monthlyYekdem: yekdem,
      tariffType: "single", anlikUretimKullanimi: false,
      facilityLabel: "PENGUEN GIDA SANAYİ A.Ş.", serno: 99980910, monthLabel: "July 2026",
      periodMonth: 7,
      gesResult: makeGesResult({
        mode: "producer", anlikUretimKullanimi: false,
        mevcutFatura: twm, mevcutTuketimKwh: sumCn, hamTuketimKwh: sumCn,
        gesOlmasaydiFatura: gesOlmasaydi,
        satis: { satisKwh: sumExcess, satisNetGelir: satisNet },
        tasarruf: gesOlmasaydi - twm + satisNet,
        gesOlmasaydiBreakdown: cf as unknown as InvoiceBreakdown,
      }),
  });
  return { payload, twm, expectS2, satisNet };
}

{
  const t = buildPenguenTemmuz();
  scenarios.push({
    ad: "6b) Metot 2 PENGUEN Temmuz 2026 (yekFarki ≠ 0) → C=3.227.094,61",
    totalWithMahsup: t.twm,
    method2: true,
    cfChecked: true,
    cfOk: true,
    expectS2: t.expectS2,
    expects: { C: 3227094.61, D1: t.satisNet },
    payload: t.payload,
  });
}

// 7) KASITLI SAPMA (Metot 1, arazi, öz tüketim 0) — cfCheck TETİKLENMELİ.
//    Senaryo 2 ile aynı breakdown; gesOlmasaydiFatura bilerek A − 1000.
{
  const vat = 0.18;
  const bd = makeBreakdown(
    {
      energyCharge: 13000, netEnergyCharge: 2600, trafoCharge: 0,
      distributionCharge: 4550, distributionBaseKwh: 5000, distributionAdjustment: 1950,
      distributionChargeKwh: 3500, btvCharge: 26, powerBaseCharge: 2000,
      powerExcessCharge: 0, reactivePenaltyCharge: 150,
      verisMahsupKwh: 4000, verisFazlaKwh: 3000, verisMahsupBedeli: 10400, verisKwh: 7000,
    },
    vat,
  );
  const twm = bd.totalInvoice;
  const A = 21780 * (1 + vat); // 25700.4
  scenarios.push({
    ad: "7) Kasıtlı sapma (öz tüketim 0, cf ≠ A) → cfCheck uyarısı",
    totalWithMahsup: twm,
    cfChecked: true,
    cfOk: false,
    payload: basePayload({
      breakdown: bd, vatRate: vat, btvRate: 0.01, lisansliSatis: false,
      totalConsumptionKwh: 5000, unitPriceEnergy: 2.6, unitPriceDistribution: 1.3,
      powerPrice: 200, powerExcessPrice: 300, contractPowerKw: 10, monthFinalDemandKw: 10,
      reactiveUnitPrice: 1.5, totalWithMahsup: twm,
      onYil: true, usdKur: 34, perakendeEnerjiBedeli: 2.0, dagitimUreticiBedeli: 0.35,
      anlikUretimKullanimi: false,
      gesResult: makeGesResult({
        mode: "producer", anlikUretimKullanimi: false, mevcutFatura: twm,
        mevcutTuketimKwh: 5000, hamTuketimKwh: 5000, gesOlmasaydiFatura: A - 1000,
      }),
    }),
  });
}

// ── Koşum ───────────────────────────────────────────────────────
console.log("\n=== Muhasebe Excel — buildMuhasebeReport kabul testi ===\n");

for (const sc of scenarios) {
  console.log(`\n── ${sc.ad} ──`);
  const r = buildMuhasebeReport(sc.payload);
  const s = r.sonuc;

  // Kapanış (Kriter 6 + 11): C = totalWithMahsup
  assertClose("C (A+B+F)  == totalWithMahsup", s.C, sc.totalWithMahsup);
  assertTrue("closingCheck.ok === true", r.closingCheck.ok === true);

  // Invariant (Kriter 12): E2 − E1 == faturaKdvToplami − D2
  assertClose("E2 − E1  == faturaKdvToplami − D2", s.E2 - s.E1, s.faturaKdvToplami - s.D2);
  assertTrue("invariant.ok === true", r.invariant.ok === true);

  // faturaKdvToplami == breakdown.vatCharge
  assertClose("faturaKdvToplami == b.vatCharge", s.faturaKdvToplami, sc.payload.breakdown.vatCharge);

  // İşaret konvansiyonu (Kriter 7)
  const blok2 = r.blocks.find((b) => b.id === "blok2")!;
  assertTrue("BLOK2 subtotalKdvHaric ≤ 0", blok2.subtotalKdvHaric <= TOL);
  const mahsupSinifGelir = blok2.rows.some((row) => row.sinif === "Gelir");
  assertTrue('BLOK2 hiçbir satır sınıfı "Gelir" değil', !mahsupSinifGelir);

  // Satış hiçbir fatura toplamına karışmıyor: C, satıştan bağımsız
  const blok1 = r.blocks.find((b) => b.id === "blok1")!;
  assertClose("A == BLOK1 subtotalKdvDahil", s.A, blok1.subtotalKdvDahil);

  // Kriter 17: |S1 + S2 − subtotalBeforeVat| ≤ 0.005 (tek kaynak mahsup → float epsilon)
  assertClose(
    "|S1+S2 − subtotalBeforeVat|",
    blok1.subtotalKdvHaric + blok2.subtotalKdvHaric,
    sc.payload.breakdown.subtotalBeforeVat,
    0.005,
  );

  // Karşı-olgu tutarsızlık kontrolü (görev C): öz tüketim ≈ 0 → A+yekdem+F ≡ gesOlmasaydi
  const blok5 = r.blocks.find((b) => b.id === "blok5")!;
  const cfRow = blok5.rows.find((row) => row.kalem.includes("Karşı-olgu Tutarsızlığı"));
  const cfWarn = r.warnings.some((w) => w.includes("teyide muhtaçtır"));
  assertTrue(`cfCheck.checked === ${sc.cfChecked}`, r.cfCheck.checked === sc.cfChecked);
  if (sc.cfChecked) {
    assertTrue(`cfCheck.ok === ${sc.cfOk}`, r.cfCheck.ok === sc.cfOk);
    if (sc.cfOk) {
      assertTrue("cfCheck OK → BLOK5 uyarı satırı YOK + warnings temiz", !cfRow && !cfWarn);
    } else {
      assertTrue("cfCheck FAIL → BLOK5 uyarı satırı + warnings VAR", !!cfRow && cfWarn);
      assertTrue("cfCheck FAIL → kapanış yine OK (bloklamaz)", r.closingCheck.ok === true);
    }
  } else {
    assertTrue("öz tüketim var → cfCheck uyarısı yok", !cfRow && !cfWarn);
  }

  if (sc.lisansli) {
    assertClose("Lisanslı: BLOK2 subtotalKdvHaric == 0", blok2.subtotalKdvHaric, 0);
    assertClose("Lisanslı: B == 0", s.B, 0);
  }

  if (sc.method2) {
    // Rebase: BLOK 2'de 3 mahsup satırı (Bilgi köprüleri HARİÇ) negatif "Gider Azaltıcı"
    if (sc.expectS2 != null) assertClose("Metot 2: BLOK2 subtotalKdvHaric (S2)", blok2.subtotalKdvHaric, sc.expectS2, 0.005);
    const m2items = blok2.rows.filter((row) => row.kind === "item" && row.sinif !== "Bilgi");
    assertTrue("Metot 2: BLOK2'de 3 mahsup satırı (Enerji/YEK/BTV)", m2items.length === 3);
    assertTrue("Metot 2: 3 satırın hepsi negatif", m2items.every((row) => (row.tutar ?? 0) < 0));
    assertTrue('Metot 2: 3 satırın sınıfı "Gider Azaltıcı"', m2items.every((row) => row.sinif === "Gider Azaltıcı"));
    // Fatura köprüsü Bilgi satırları: fatura kalemlerine birebir, toplama girmedi
    const bilgi = blok2.rows.filter((row) => row.sinif === "Bilgi");
    assertTrue("Metot 2: BLOK2'de 2 fatura köprüsü Bilgi satırı", bilgi.length === 2);
    assertClose("Bilgi: Fatura Enerji Bedeli == b.energyCharge", bilgi[0]?.tutar ?? NaN, sc.payload.breakdown.energyCharge);
    assertClose("Bilgi: Fatura YEK Bedeli == b.yekTahminiCharge", bilgi[1]?.tutar ?? NaN, sc.payload.breakdown.yekTahminiCharge ?? NaN);
    const blok4 = r.blocks.find((b) => b.id === "blok4")!;
    assertTrue('Metot 2: "Fark (kontrol)" satırı YOK (kapanış tuttu)', !blok4.rows.some((row) => row.kalem === "Fark (kontrol)"));
  }

  if (sc.blok5Mismatch) {
    // gesResult.mevcutFatura ≠ total → C etkilenmez + uyarı üretilir
    assertTrue("BLOK5 uyuşmazlığı closingCheck'i BOZMADI", r.closingCheck.ok === true);
    assertTrue("BLOK5 uyuşmazlığı warnings'e yazıldı", r.warnings.some((w) => w.includes("Mutabakat (BLOK 5)")));
  }

  if (sc.noSale) {
    // Kriter 12b
    assertClose("Satış yok: D1 == 0", s.D1, 0);
    assertClose("Satış yok: D2 == 0", s.D2, 0);
    assertClose("Satış yok: D3 == 0", s.D3, 0);
    assertClose("Satış yok: E2 == C", s.E2, s.C);
    assertClose("Satış yok: E2 − E1 == faturaKdvToplami", s.E2 - s.E1, s.faturaKdvToplami);
  }

  // BLOK 1 bilgi satırı (talep birleştirme) toplama girmiyor
  if (sc.payload.gesAlloc && sc.payload.gesAlloc.role === "assigned") {
    const bilgi = blok1.rows.find((row) => row.sinif === "Bilgi");
    assertTrue("BLOK1 talep birleştirme Bilgi satırı var", !!bilgi);
    assertTrue("Bilgi satırı tutar=null (toplama girmez)", bilgi?.tutar == null);
  }

  // Beklenen kesin değerler
  if (sc.expects) {
    if (sc.expects.A != null) assertClose("A (beklenen)", s.A, sc.expects.A);
    if (sc.expects.B != null) assertClose("B (beklenen)", s.B, sc.expects.B);
    if (sc.expects.C != null) assertClose("C (beklenen)", s.C, sc.expects.C);
    if (sc.expects.E1 != null) assertClose("E1 (beklenen)", s.E1, sc.expects.E1);
    if (sc.expects.E2 != null) assertClose("E2 (beklenen)", s.E2, sc.expects.E2);
    if (sc.expects.D1 != null) assertClose("D1 (beklenen)", s.D1, sc.expects.D1);
  }
}

// ── 8) PENGUEN TAHAKKUK görünümü (saf adaptör) ──────────────────
// Aynı motor-türevli S6 payload'ı; hesap TEK KAYNAK, adaptör yalnız yeniden sınıflandırır.
console.log("\n── 8) Penguen Tahakkuk görünümü (saf adaptör) ──");
{
  const s6 = buildPenguenS6();
  const rep = buildMuhasebeReport(s6.payload);
  const view = buildPenguenTahakkukView(rep, s6.payload);
  assertTrue("Metot 2 → view üretildi (null değil)", view != null);
  if (view) {
    const d = view.degerler;
    assertClose("eUP", d.eUP, 1.933554, 0.000001);
    assertClose("elektrikGideri", d.elektrikGideri, 2447744.21, 0.05);
    assertClose("dagitimBedeli", d.dagitimBedeli, 1150428.73, 0.01);
    assertClose("indirilecekKdv", d.indirilecekKdv, 533111.63, 0.01);
    assertClose("digerDuzeltme", d.digerDuzeltme, 2730, 0.001);
    assertClose("mahsupTutari", d.mahsupTutari, 932614.79, 0.05);
    // KAPANIŞIN KANITI — fixture ayarlaması YASAK; tutmazsa kırık bırakılır:
    assertClose("digerSaticilar == C (rapor)", d.digerSaticilar, rep.sonuc.C, 0.01);
    assertClose("digerSaticilar (beklenen 3.201.399,78)", d.digerSaticilar, 3201399.78, 0.01);
    assertClose("borcToplam (beklenen 4.134.014,57)", d.borcToplam, 4134014.57, 0.05);
    assertClose("borcToplam == mahsup + digerSaticilar", d.borcToplam, d.mahsupTutari + d.digerSaticilar, 0.005);
    assertTrue("kapanis.ok === true", view.kapanis.ok === true);
    assertTrue("view.warnings boş", view.warnings.length === 0);

    for (const fis of view.fisler) {
      assertClose(`${fis.baslik}: Borç == Alacak`, fis.toplamBorc, fis.toplamAlacak, 0.01);
    }
    const fis3 = view.fisler[2];
    const satici = fis3.satirlar.find((r) => r.hesapKodu === "320");
    assertClose("Fiş 3: Diğer Satıcılar (320) alacak == digerSaticilar", satici?.alacak ?? NaN, d.digerSaticilar, 0.001);
    assertTrue("Fiş 3: düzeltme satırı borçta (2.730)", fis3.satirlar.some((r) => r.aciklama.includes("Düzeltmeler") && Math.abs((r.borc ?? 0) - 2730) < 0.001));
    assertTrue("Fiş 3: doldurulabilir fatura alanları işaretli", fis3.editableFaturaAlanlari === true);
    assertTrue("Özet mahsup etiketi dönem ayı (Haziran)", view.ozet[2].kalem.includes("Haziran"));
    // Dayanak bileşen kimliği (Excel'den dayanak bloğu kalktı → denetim kodda)
    const bb = s6.payload.breakdown;
    const bilesenToplam =
      bb.energyCharge + (bb.yekTahminiCharge ?? 0) + (bb.yekFarkiCharge ?? 0) +
      bb.trafoCharge + bb.powerTotalCharge + bb.reactivePenaltyCharge + bb.btvCharge + d.mahsupTutari;
    assertClose("Σbileşen == elektrikGideri", bilesenToplam, d.elektrikGideri, 0.01);
  }

  // Metot 1 payload → null (varyant devre dışı)
  const m1 = scenarios[0];
  const m1rep = buildMuhasebeReport(m1.payload);
  assertTrue("Metot 1 → null", buildPenguenTahakkukView(m1rep, m1.payload) === null);

  // sumPos = 0 guard (tüm ay mahsuba giderse) → null, sıfıra bölme yok
  const zeroBd = makeMethod2Breakdown(
    { sumPos: 0, sumMahsup: 5000, energyCharge: 0, yekTahminiCharge: 0, yekFarkiCharge: 0, distributionCharge: 6000, btvCharge: 0, verisFazlaKwh: 0 },
    0.2,
  );
  const zeroPayload = basePayload({
    breakdown: zeroBd, invoiceMethodId: 2, totalWithMahsup: zeroBd.totalInvoice,
    gesResult: makeGesResult({
      mode: "producer", mevcutFatura: zeroBd.totalInvoice,
      mevcutTuketimKwh: 5000, hamTuketimKwh: 6000, gesOlmasaydiFatura: zeroBd.totalInvoice,
    }),
  });
  const zeroRep = buildMuhasebeReport(zeroPayload);
  assertTrue("sumPos=0 guard → null", buildPenguenTahakkukView(zeroRep, zeroPayload) === null);
}

// ── 9) PENGUEN TAHAKKUK — Temmuz 2026 (yekFarki ≠ 0, kabul rakamları) ────────
console.log("\n── 9) Penguen Tahakkuk — Temmuz 2026 (yekFarki ≠ 0) ──");
{
  const t = buildPenguenTemmuz();
  const rep = buildMuhasebeReport(t.payload);
  const view = buildPenguenTahakkukView(rep, t.payload);
  assertTrue("view != null", view != null);
  if (view) {
    const d = view.degerler;
    assertClose("yekFarkiCharge ≈ −5.533,12", t.payload.breakdown.yekFarkiCharge ?? NaN, -5533.12, 0.05);
    assertClose("Fiş 1 toplamı (beklenen 4.736.352,72)", view.fisler[0].toplamBorc, 4736352.72, 0.05);
    assertClose("Fiş 2 toplamı (beklenen 2.047.107,21)", view.fisler[1].toplamBorc, 2047107.21, 0.05);
    assertClose("Fiş 3 toplamı (beklenen 5.274.201,83)", view.fisler[2].toplamBorc, 5274201.83, 0.05);
    for (const fis of view.fisler) {
      assertClose(`${fis.baslik}: Borç == Alacak`, fis.toplamBorc, fis.toplamAlacak, 0.01);
    }
    assertClose("digerSaticilar == C (rapor)", d.digerSaticilar, rep.sonuc.C, 0.01);
    assertClose("digerSaticilar (beklenen 3.227.094,61)", d.digerSaticilar, 3227094.61, 0.01);
    assertTrue("kapanis.ok === true", view.kapanis.ok === true);
    assertTrue("bileşen kontrolü sessiz (warnings boş)", view.warnings.length === 0);
    assertTrue("Özet mahsup etiketi dönem ayı (Temmuz)", view.ozet[2].kalem.includes("Temmuz"));
  }
}

// ── 10) KASITLI BOZUK FIXTURE — bileşen kontrolü uyarı üretmeli ──────────────
// subtotal'a bileşenlerde karşılığı olmayan +500 eklenir (vat/total tutarlı
// büyütülür, kapanış bozulmaz) → yalnız "Dayanak kontrolü" uyarısı beklenir.
console.log("\n── 10) Kasıtlı bozuk fixture → bileşen kontrolü uyarısı ──");
{
  const s6 = buildPenguenS6();
  const orijinalBd = s6.payload.breakdown;
  const bozukBd = {
    ...orijinalBd,
    subtotalBeforeVat: orijinalBd.subtotalBeforeVat + 500,
    vatCharge: orijinalBd.vatCharge + 100,
    totalInvoice: orijinalBd.totalInvoice + 600,
  };
  const bozukPayload: MuhasebePayload = {
    ...s6.payload,
    breakdown: bozukBd,
    totalWithMahsup: s6.payload.totalWithMahsup + 600,
  };
  const bozukRep = buildMuhasebeReport(bozukPayload);
  const bozukView = buildPenguenTahakkukView(bozukRep, bozukPayload);
  assertTrue("view != null (bloklama yok, Excel üretilir)", bozukView != null);
  if (bozukView) {
    assertTrue(
      '"Dayanak kontrolü" uyarısı üretildi',
      bozukView.warnings.some((w) => w.includes("Dayanak kontrolü")),
    );
    assertTrue("yalnız 1 uyarı (kapanış bozulmadı)", bozukView.warnings.length === 1);
    assertTrue("kapanis.ok === true (tutarlı büyütme)", bozukView.kapanis.ok === true);
  }
}

console.log(`\n${failures === 0 ? "✅ TÜM TESTLER GEÇTİ" : `❌ ${failures} TEST BAŞARISIZ`}\n`);
process.exit(failures === 0 ? 0 : 1);
