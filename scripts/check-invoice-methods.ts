// scripts/check-invoice-methods.ts
// Aşama 2B kabul testi — Metod 2 (Uedaş) ve Metod 3 (Tredaş) motorları.
// Kullanım: npm run check:invoice-methods
//
// SAF fonksiyon testidir (D1): girdiler sabit fixture; DB'ye HİÇBİR ŞEY yazmaz,
// DB'den HİÇBİR ŞEY okumaz. Değerler iki gerçek fatura + canlı DB agregalarından
// bağımsız doğrulandı (bkz. plan dosyası).
//
// Not: bu iki motor dosyası yalnız `import type` yaptığı için tsx altında relative
// import ile sorunsuz yüklenir (@/lib/supabase zincirine girmez).
//
// F12 (Metot 7 · Meram) disk fixture'ları okur: docs/talep-birlestirme/Niğde As Beton.xlsx
// + scripts/fixtures/ptf-2026-08.json. gesAllocation / hourlyNetAggregates zinciri
// yalnız `import type` + saf modüller içerir (check-ges-allocation-modes.ts'te denendi).

import { readFileSync, existsSync } from "node:fs";
import * as XLSX from "xlsx";
import type { InvoiceInput } from "../src/components/utils/calculateInvoice";
import {
  calculateInvoice,
  calculateYekdemMahsup,
  isM1MahsupCapPeriod,
} from "../src/components/utils/calculateInvoice";
import {
  calculateInvoiceMethod2,
  calculateInvoiceMethod3,
  calculateInvoiceMethod5,
  calculateInvoiceMethod7,
  calculateYekFarki,
  resolveYekFarkiWithOverride,
  embedYekdemMahsupIntoEnergy,
  isIpragazYekBirlesikPeriod,
  type InvoiceMethodInputs,
  type MethodInvoiceInput,
  type MethodInvoiceBreakdown,
} from "../src/components/utils/calculateInvoiceNetMethods";
// type-only → tsx'te silinir, @/lib/supabase zincirine girmez.
import type { InvoiceOverrides } from "../src/components/utils/invoiceOverrides";
import {
  allocateSaatlikOransal,
  buildPoolSrcSeries,
  type HourlySeries,
} from "../src/components/utils/gesAllocationModes";
import type { FacilityAllocationView } from "../src/components/utils/gesAllocation";
import { computeHourlyNetAggregates } from "../src/components/utils/hourlyNetAggregates";
import {
  addTrafoKaybiToRows,
  addTrafoKaybiToSeries,
  hourGridKeys,
  normalizeTrafoKaybi,
  trafoGridCapIso,
} from "../src/components/utils/trafoKaybi";

// ── Test harness ────────────────────────────────────────────────
let failures = 0;
const money = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function assertClose(label: string, actual: number, expected: number, tol: number) {
  const diff = Math.abs(actual - expected);
  const ok = diff <= tol;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "✅" : "❌"} ${label.padEnd(34)} = ${money(actual).padStart(16)}` +
      `   (beklenen ${money(expected)}, Δ ${diff.toFixed(4)}, tol ±${tol})`
  );
}

// Fixture'larda güç/trafo yok (iki pilot da tek_terim, trafo girilmemiş) → metod 1 semantiği
// gereği güç=0, trafo=0. Ortak taban InvoiceInput alanları.
const baseInput = (over: Partial<InvoiceInput>): InvoiceInput => ({
  totalConsumptionKwh: 0,
  unitPriceEnergy: 0,
  unitPriceDistribution: 1.182457,
  btvRate: 0.01,
  vatRate: 0.2,
  tariffType: "single",
  contractPowerKw: 0,
  monthFinalDemandKw: 0,
  powerPrice: 0,
  powerExcessPrice: 0,
  reactivePenaltyCharge: 0,
  ...over,
});

// ── FIXTURE 1: Tesis 52503 — Metod 3 (Tredaş), 2026-06 ───────────
// KBK=1,014 · D=1,182457 · perakende=2,909691 · wMahsup=0,489954 · tahminiYekdem=0,58099
// 2I: mahsuplaşma birim fiyatı EPİAŞ satış makası formülünden gelir (default, T-0 kalktı):
//   perakende − (wMahsup + tahminiYekdem) × KBK = 2,909691 − (0,489954+0,58099)×1,014 ≈ 1,823754
//   → × sumMahsup 814.174,974 ≈ 1.484.852 (gerçek fatura 1.484.851,44) → Muhtelif-2 net ≈ −522.125
//   (gerçek −522.124,55, İLK KEZ override'sız birebir).
// tahminiYekdem 0,58099 = gerçek çıplak yekdem_value (tam hassasiyet; kuruş doğrulaması için).
console.log("\n── Metod 3 (Tredaş) · Tesis 52503 · 2026-06 ──");
{
  const mi: InvoiceMethodInputs = {
    sumCn: 2305781.1,
    sumGn: 929595.6,
    sumPos: 1491606.126,
    sumMahsup: 814174.974,
    sumExcess: 115420.626,
    wPos: 1.647616587663028946289002, // canlı DB'den tam hassasiyet
    wMahsup: 0.489954, // mahsup-ağırlıklı çıplak PTF (52503 Haziran)
    kbk: 1.014,
    tahminiYekdem: 0.58099,
    // Önceki dönem (Mayıs) verisi YOK → YEK Farkı kalemi 0 (D3 "veri yok" dalı).
    prevSumPos: null,
    prevTahminiYekdem: null,
    prevGerceklesenYekdem: null,
    mahsuplasmaUnitPrice: null, // default → EPİAŞ makas formülü (perakende − (wMahsup+YEKDEM)×KBK)
  };
  const input: MethodInvoiceInput = baseInput({ onYil: false, perakendeEnerjiBedeli: 2.909691 });

  const b = calculateInvoiceMethod3(input, null, mi);
  assertClose("T-0 enerji birim fiyat", b.energyUnitPriceApplied!, 1.67068, 0.00001);
  assertClose("Enerji", b.energyCharge, 2492001, 1);
  assertClose("Dağıtım", b.distributionCharge, 1763760, 1);
  assertClose("Muhtelif-2 dağıtım (+)", b.muhtelif2Dagitim!, 962727, 1);
  // 2I: mahsuplaşma birim fiyatı ARTIK formülden — kredi ve net gerçek faturayla birebir.
  assertClose("Mahsuplaşma birim (EPİAŞ makas)", b.mahsuplasmaUnitPriceApplied!, 1.823754, 0.001);
  assertClose("Muhtelif-2 mahsup kredisi (−)", b.muhtelif2MahsupKredisi!, 1484852, 5);
  assertClose("Muhtelif-2 net (dağıtım − kredisi)", b.muhtelif2Net!, -522125, 5);
  assertClose("Önceki YEKDEM Mahsup (veri yok→0)", b.yekFarkiCharge!, 0, 0.0001);
  // 2G BTV matrahı = Enerji + Tahmini YEKDEM − mahsuplaşma kredisi. 2I ile kredi büyüdüğü için
  // BTV düştü (20.105 → ~18.859) — yeni matrahın kolateral sonucu.
  assertClose("BTV (Enerji+YEKDEM−mahsup kredisi)", b.btvCharge, 18858.9, 2);

  // Override kaçış kapısı: girilince FORMÜLÜ ezer (davranış aynı). 1,82375 ≈ formülle (tesadüf).
  const bOv = calculateInvoiceMethod3(input, { mahsuplasma: { isExcluded: false, unitPriceOverride: 1.82375, amountOverride: null, payload: null, note: null } }, mi);
  assertClose("Muhtelif-2 kredisi (override 1,82375)", bOv.muhtelif2MahsupKredisi!, 1484851, 1);
  // Override'ın formülü ezdiği NET görünsün: bariz farklı bir değer (2,5) → uygulanan = 2,5.
  const bOv2 = calculateInvoiceMethod3(input, { mahsuplasma: { isExcluded: false, unitPriceOverride: 2.5, amountOverride: null, payload: null, note: null } }, mi);
  assertClose("Override formülü ezer (birim=2,5)", bOv2.mahsuplasmaUnitPriceApplied!, 2.5, 0.0001);

  // m3 sigortası: 'yek' override'ı SATIRI değiştirir ama m3 BTV matrahı DOĞAL
  // yek ile hesaplanır → BTV bit-identik kalır (metod 5 farkı m3'e sıçramasın).
  const bYekOv = calculateInvoiceMethod3(
    input,
    { yek: { isExcluded: false, unitPriceOverride: 0.9, amountOverride: null, payload: null, note: null } },
    mi
  );
  assertClose("m3 yek override → satır override'lı", bYekOv.yekTahminiCharge!, mi.sumPos * 0.9, 0.01);
  assertClose("m3 yek override → BTV değişmez", bYekOv.btvCharge, b.btvCharge, 1e-9);
}

// ── FIXTURE 2: Tesis 99980910 — Metod 2 (Uedaş), 2026-06 ─────────
// GERÇEK TESİS DEĞERLERİ (2026-06 Uludağ faturasından türetildi):
//  • tahminiYekdem ≈ 1,0945 = faturadaki 557.059,46 (YEK Bedeli) ÷ 490.581,885 (sumPos)
//    ÷ KBK 1,0375. Tam hassasiyet 1,0944652 kullanılır (kaba 1,0945 NET tabanla ±5
//    dışına, ~557.077'ye taşardı).
//  • KBK = 1,0375 = canlı tesis değeri (yekdem_final 1,083629 ile ~%1 tutarlı).
// Not: YEK Bedeli tabanı D2'de NET'e çekildi (eski brüt sumCn × sahte 0,56466/1,014
// kombinasyonu 557k'ya "iki hata birbirini götürerek" oturuyordu).
console.log("\n── Metod 2 (Uedaş) · Tesis 99980910 · 2026-06 ──");
{
  const mi: InvoiceMethodInputs = {
    sumCn: 972913.8,
    sumGn: 1196780.85,
    sumPos: 490581.885,
    sumMahsup: 482331.915,
    sumExcess: 714448.935,
    wPos: 1.863666483320883322057438,
    kbk: 1.0375,
    tahminiYekdem: 1.0944652, // ≈1,0945; 557059.46 / 490581.885 / 1.0375
    prevSumPos: null,
    prevTahminiYekdem: null,
    prevGerceklesenYekdem: null,
    mahsuplasmaUnitPrice: null,
  };
  const input: MethodInvoiceInput = baseInput({ onYil: false, perakendeEnerjiBedeli: 2.909687 });

  const b = calculateInvoiceMethod2(input, null, mi);
  assertClose("Enerji birim fiyat", b.energyUnitPriceApplied!, 1.933554, 0.00001);
  assertClose("Dağıtım (brüt taban)", b.distributionCharge, 1150429, 1);
  // YEK Bedeli tabanı NET (sumPos). Tam-hassasiyetli girdi gerçek faturayı üretir
  // (490.581,885 × 1,0944652 × 1,0375 ≈ 557.059,5) → ±5 TL tolerans.
  assertClose("YEK Bedeli (net taban)", b.yekTahminiCharge!, 557059, 5);
  assertClose("YEK Farkı (veri yok→0)", b.yekFarkiCharge!, 0, 0.0001);
  // 2G sigortası: m2 BTV YALNIZ enerji bedelinden kesilir (YEKDEM matraha GİRMEZ) —
  // m3/m5 matrah farkları yanlışlıkla m2'ye sıçramasın. Enerji × %1 ≈ 9.485,67.
  assertClose("BTV (yalnız enerji, m2 sigortası)", b.btvCharge, 9485.67, 1);

  // m2 sigortası (metod 5 eklentisi): 'yek' override'ı satırı değiştirir ama
  // m2 BTV matrahında yek zaten yok → BTV bit-identik kalır.
  const yekExcludedOv = { yek: { isExcluded: true, unitPriceOverride: null, amountOverride: null, payload: null, note: null } };
  const bYekEx = calculateInvoiceMethod2(input, yekExcludedOv, mi);
  assertClose("m2 yek exclude → satır 0", bYekEx.yekTahminiCharge!, 0, 1e-9);
  assertClose("m2 yek exclude → BTV değişmez", bYekEx.btvCharge, b.btvCharge, 1e-9);
}

// ── FIXTURE 2B: Metod 5 (İpragaz) — m2 kopyası, BTV matrahında YEK ──────────
// Kullanıcı doğrulama örneği (2026-08): 517.762 kWh net · 1.016.800 kWh brüt ·
// 499.038 kWh GES mahsubu (kimlik: sumCn − sumPos = 499.038 ✓).
// Birim fiyatlar hedef tutarlardan türetilir (kbk=1):
//   wPos = 1.750.847,13/517.762 · tahminiYekdem = 223.587,24/517.762
//   D    = 1.323.283,11/1.016.800 (KDV-hariç kimliğinden: 3.317.461,82 −
//          1.750.847,13 − 223.587,24 − 19.744,34)
// ⚠ Örnekteki "Ödenecek 4.130.325,38" motor DIŞI +149.371,20 içerir (diğer
// değerler / toplam-sonrası kalemler). Motor assert'i KDV dahil totalInvoice'tır:
//   4.130.325,38 − 149.371,20 = 3.980.954,18 = 3.317.461,82 × 1,20.
console.log("\n── Metod 5 (İpragaz) · BTV matrahında YEK ──");
{
  const mi: InvoiceMethodInputs = {
    sumCn: 1016800,
    sumGn: 499038,
    sumPos: 517762,
    sumMahsup: 499038,
    sumExcess: 0,
    wPos: 1750847.13 / 517762,
    wMahsup: null,
    kbk: 1,
    tahminiYekdem: 223587.24 / 517762,
    prevSumPos: null,
    prevTahminiYekdem: null,
    prevGerceklesenYekdem: null,
    mahsuplasmaUnitPrice: null,
  };
  const input: MethodInvoiceInput = baseInput({
    onYil: false,
    perakendeEnerjiBedeli: 2.909691,
    unitPriceDistribution: 1323283.11 / 1016800,
  });

  const b = calculateInvoiceMethod5(input, null, mi);
  assertClose("Enerji (net taban)", b.energyCharge, 1750847.13, 0.01);
  assertClose("YEK Bedeli (net taban)", b.yekTahminiCharge!, 223587.24, 0.01);
  assertClose("BTV = (Enerji + YEK) × %1", b.btvCharge, 19744.34, 0.01);
  assertClose("KDV Hariç Toplam", b.subtotalBeforeVat, 3317461.82, 0.05);
  assertClose("KDV (%20)", b.vatCharge, 663492.36, 0.02);
  assertClose("Genel Toplam (KDV Dahil)", b.totalInvoice, 3980954.18, 0.05);

  // m5 ↔ m2 aynı girdiyle: TEK fark BTV (ve KDV'ye yansıması) — kalemler bit-identik.
  const b2 = calculateInvoiceMethod2(input, null, mi);
  assertClose("m5 enerji ≡ m2 enerji", b.energyCharge, b2.energyCharge, 1e-9);
  assertClose("m5 YEK ≡ m2 YEK", b.yekTahminiCharge!, b2.yekTahminiCharge!, 1e-9);
  assertClose("m5 dağıtım ≡ m2 dağıtım (brüt taban)", b.distributionCharge, b2.distributionCharge, 1e-9);
  assertClose("m5 BTV − m2 BTV = YEK × %1", b.btvCharge - b2.btvCharge, (b.yekTahminiCharge ?? 0) * 0.01, 1e-6);

  // 'yek' override etkileşimi — m5'te BTV matrahı EFEKTİF yek kullanır.
  const bEx = calculateInvoiceMethod5(
    input,
    { yek: { isExcluded: true, unitPriceOverride: null, amountOverride: null, payload: null, note: null } },
    mi
  );
  assertClose("m5 yek exclude → satır 0", bEx.yekTahminiCharge!, 0, 1e-9);
  assertClose("m5 yek exclude → BTV = Enerji × %1", bEx.btvCharge, b.energyCharge * 0.01, 0.01);
  {
    const list = bEx.appliedOverrides?.excludedItems ?? [];
    const ok = list.includes("yek");
    if (!ok) failures++;
    console.log(`  ${ok ? "✅" : "❌"} m5 yek exclude → appliedOverrides.excludedItems = ${JSON.stringify(list)}`);
  }

  const bOv = calculateInvoiceMethod5(
    input,
    { yek: { isExcluded: false, unitPriceOverride: 0.5, amountOverride: null, payload: null, note: null } },
    mi
  );
  assertClose("m5 yek birim override → satır", bOv.yekTahminiCharge!, 517762 * 0.5, 0.01);
  assertClose("m5 yek birim override → BTV matraha girer", bOv.btvCharge, (b.energyCharge + 517762 * 0.5) * 0.01, 0.01);

  const bAmt = calculateInvoiceMethod5(
    input,
    { yek: { isExcluded: false, unitPriceOverride: null, amountOverride: 100000, payload: null, note: null } },
    mi
  );
  assertClose("m5 yek tutar override → satır", bAmt.yekTahminiCharge!, 100000, 1e-9);
  assertClose("m5 yek tutar override → BTV matraha girer", bAmt.btvCharge, (b.energyCharge + 100000) * 0.01, 0.01);

  // ── İpragaz 2026-08+ birleşik-YEK formatı: YEK enerji satırına katlanır ──────
  // Toplam/BTV/KDV bayraksızla BİT-IDENTİK; yalnız satır yapısı değişir.
  console.log("\n── Metod 5 (İpragaz) · birleşik YEK (2026-08+) ──");
  {
    const okP = !isIpragazYekBirlesikPeriod(2026, 7) && isIpragazYekBirlesikPeriod(2026, 8)
      && isIpragazYekBirlesikPeriod(2027, 1) && !isIpragazYekBirlesikPeriod(NaN, 8);
    if (!okP) failures++;
    console.log(`  ${okP ? "✅" : "❌"} isIpragazYekBirlesikPeriod: 2026-07 false · 2026-08 true · 2027-01 true · NaN false`);

    const inputB: MethodInvoiceInput = { ...input, ipragazYekBirlesik: true };
    const bb = calculateInvoiceMethod5(inputB, null, mi);
    assertClose("birleşik enerji = enerji + YEK", bb.energyCharge, b.energyCharge + b.yekTahminiCharge!, 1e-9);
    assertClose("birleşik YEK satırı = 0", bb.yekTahminiCharge!, 0, 1e-12);
    assertClose("birleşik yekGomuluTutar = eski YEK", bb.yekGomuluTutar!, b.yekTahminiCharge!, 1e-9);
    assertClose("birleşik BTV ≡ eski BTV", bb.btvCharge, b.btvCharge, 1e-9);
    assertClose("birleşik KDV hariç ≡ eski", bb.subtotalBeforeVat, b.subtotalBeforeVat, 1e-9);
    assertClose("birleşik KDV ≡ eski", bb.vatCharge, b.vatCharge, 1e-9);
    assertClose("birleşik toplam ≡ eski", bb.totalInvoice, b.totalInvoice, 1e-9);
    assertClose("birleşik trafo ≡ eski (çıplak fiyat)", bb.trafoCharge, b.trafoCharge, 1e-12);
    assertClose("birleşik verisMahsupBedeli ≡ eski", bb.verisMahsupBedeli, b.verisMahsupBedeli, 1e-9);
    assertClose("birleşik energyUnitPriceApplied çıplak", bb.energyUnitPriceApplied!, b.energyUnitPriceApplied!, 1e-12);
    assertClose("birleşik energyUnitPriceShown = (PTF+YEKDEM)×KBK", bb.energyUnitPriceShown!, (mi.wPos + mi.tahminiYekdem) * mi.kbk, 1e-9);
    {
      const ok = bb.yekEnerjiyeGomulu === true && !("yekEnerjiyeGomulu" in b) && !("yekGomuluTutar" in b) && !("energyUnitPriceShown" in b);
      if (!ok) failures++;
      console.log(`  ${ok ? "✅" : "❌"} bayrak alanları sparse: birleşikte var, bayraksızda HİÇ yok`);
    }

    // Bayrak m2'de ETKİSİZ (yalnız m5 okur).
    const b2b = calculateInvoiceMethod2(inputB, null, mi);
    assertClose("m2 bayrağı yok sayar → enerji", b2b.energyCharge, b2.energyCharge, 1e-12);
    assertClose("m2 bayrağı yok sayar → YEK", b2b.yekTahminiCharge!, b2.yekTahminiCharge!, 1e-12);
    {
      const ok = !("yekEnerjiyeGomulu" in b2b);
      if (!ok) failures++;
      console.log(`  ${ok ? "✅" : "❌"} m2 bayrakla → yekEnerjiyeGomulu anahtarı yok`);
    }

    // Override etkileşimi: çözümleme aynen, sonra katlama.
    const bbEx = calculateInvoiceMethod5(
      inputB,
      { yek: { isExcluded: true, unitPriceOverride: null, amountOverride: null, payload: null, note: null } },
      mi
    );
    assertClose("birleşik yek exclude → enerji çıplak", bbEx.energyCharge, b.energyCharge, 1e-9);
    assertClose("birleşik yek exclude → BTV = enerji × %1", bbEx.btvCharge, bEx.btvCharge, 1e-9);
    assertClose("birleşik yek exclude → toplam ≡ bayraksız exclude", bbEx.totalInvoice, bEx.totalInvoice, 1e-9);
    const bbAmt = calculateInvoiceMethod5(
      inputB,
      { yek: { isExcluded: false, unitPriceOverride: null, amountOverride: 100000, payload: null, note: null } },
      mi
    );
    assertClose("birleşik yek tutar override → enerji + 100000", bbAmt.energyCharge, b.energyCharge + 100000, 1e-9);
    assertClose("birleşik yek tutar override → toplam ≡ bayraksız", bbAmt.totalInvoice, bAmt.totalInvoice, 1e-9);
    const bbEn = calculateInvoiceMethod5(
      inputB,
      { enerji: { isExcluded: false, unitPriceOverride: null, amountOverride: 1000000, payload: null, note: null } },
      mi
    );
    const bEn = calculateInvoiceMethod5(
      input,
      { enerji: { isExcluded: false, unitPriceOverride: null, amountOverride: 1000000, payload: null, note: null } },
      mi
    );
    assertClose("birleşik enerji tutar override → 1.000.000 + YEK", bbEn.energyCharge, 1000000 + b.yekTahminiCharge!, 1e-9);
    assertClose("birleşik enerji tutar override → toplam ≡ bayraksız", bbEn.totalInvoice, bEn.totalInvoice, 1e-9);
  }
}

// ── FIXTURE 3 (SENTETİK): Önceki YEKDEM Mahsup / YEK Farkı aritmetiği ─────
// Pilotlarda bu kalem 0 çıktığı için madde matematiği bu fixture ile test edilir.
// prevSumPos=1.540.509 · çıplak fark=0,703593 · KBK=1,014 → ≈1.099.065,83
// (gerçek Trepaş faturasındaki "Önceki Yekdem Mahsup Bedeli 1.099.065,83" satırından).
console.log("\n── Sentetik · Önceki YEKDEM farkı aritmetiği ──");
{
  const prevSumPos = 1540509.0;
  const prevTahmini = 0.5;
  const prevGerceklesen = 1.203593; // fark = 0,703593 (çıkarma yolunu da test eder)
  const kbk = 1.014;

  const direct = calculateYekFarki({ prevSumPos, prevTahminiYekdem: prevTahmini, prevGerceklesenYekdem: prevGerceklesen, kbk });
  assertClose("calculateYekFarki() doğrudan", direct, 1099065.83, 1);

  // Motora aktığında yekFarkiCharge olarak da görünmeli (metod 3 üzerinden).
  const mi: InvoiceMethodInputs = {
    sumCn: 1000, sumGn: 0, sumPos: 1000, sumMahsup: 0, sumExcess: 0,
    wPos: 1, kbk, tahminiYekdem: 0,
    prevSumPos, prevTahminiYekdem: prevTahmini, prevGerceklesenYekdem: prevGerceklesen,
    mahsuplasmaUnitPrice: null,
  };
  const b = calculateInvoiceMethod3(baseInput({}), null, mi);
  assertClose("Motor yekFarkiCharge", b.yekFarkiCharge!, 1099065.83, 1);
}

// ── FIXTURE 5 (2C): Manuel YEKDEM override köprüsü — MANUEL KAZANIR ───────
// Manuel değerler F3 ile aynı: 1.540.509 × 0,703593 × 1,014 = 1.099.065,83.
// Doğal (otomatik) senaryo BİLİNÇLİ farklı: 1.000.000 × 0,5 × 1,014 = 507.000
// → hangi kaynağın kazandığı tek bakışta görünür.
console.log("\n── 2C · Manuel YEKDEM override köprüsü ──");
{
  const kbk = 1.014;
  const MANUAL = 1099065.83;
  const NATURAL = 507000.0;

  const ov = (
    payload: { total_kwh?: number; diff_yekdem?: number } | null,
    isExcluded = false
  ): InvoiceOverrides => ({
    yekdem_mahsup: {
      isExcluded,
      unitPriceOverride: null,
      amountOverride: null,
      payload,
      note: null,
    },
  });

  // Otomatik (doğal) önceki dönem verisi VAR.
  const miWith: InvoiceMethodInputs = {
    sumCn: 1000, sumGn: 0, sumPos: 1000, sumMahsup: 0, sumExcess: 0,
    wPos: 1, kbk, tahminiYekdem: 0,
    prevSumPos: 1000000, prevTahminiYekdem: 0.5, prevGerceklesenYekdem: 1.0,
    mahsuplasmaUnitPrice: null,
  };
  // Otomatik veri YOK.
  const miNone: InvoiceMethodInputs = {
    ...miWith, prevSumPos: null, prevTahminiYekdem: null, prevGerceklesenYekdem: null,
  };
  const input = baseInput({});

  // (0) Regresyon: override yok → doğal (bit-identik) + alakasız override dokunmaz.
  assertClose("(0) override yok → doğal", calculateInvoiceMethod3(input, null, miWith).yekFarkiCharge!, NATURAL, 0.01);
  assertClose(
    "(0) alakasız override → doğal",
    calculateInvoiceMethod3(
      input,
      { enerji: { isExcluded: false, unitPriceOverride: 2, amountOverride: null, payload: null, note: null } },
      miWith
    ).yekFarkiCharge!,
    NATURAL, 0.01
  );

  // (i) K1(c): OTOMATİK VERİ VAR + MANUEL GİRİLDİ → MANUEL KAZANIR.
  const bMan = calculateInvoiceMethod3(input, ov({ total_kwh: 1540509, diff_yekdem: 0.703593 }), miWith);
  assertClose("(i) manuel öncelik (m3)", bMan.yekFarkiCharge!, MANUAL, 1);
  assertClose(
    "(i) manuel öncelik (m2)",
    calculateInvoiceMethod2(input, ov({ total_kwh: 1540509, diff_yekdem: 0.703593 }), miWith).yekFarkiCharge!,
    MANUAL, 1
  );
  // Kalem KDV ÖNCESİ matraha girdiği için ara toplam da aynı kadar artmalı.
  const bNat = calculateInvoiceMethod3(input, null, miWith);
  assertClose("(i) matraha yansıma", bMan.subtotalBeforeVat - bNat.subtotalBeforeVat, MANUAL - NATURAL, 1);
  {
    const list = bMan.appliedOverrides?.amountOverriddenItems ?? [];
    const ok = list.includes("yekdem_mahsup");
    if (!ok) failures++;
    console.log(`  ${ok ? "✅" : "❌"} (i) appliedOverrides.amountOverriddenItems = ${JSON.stringify(list)}`);
  }

  // (ii) Otomatik veri YOK + manuel girildi → manuel.
  assertClose("(ii) otomatik yok → doğal 0", calculateInvoiceMethod3(input, null, miNone).yekFarkiCharge!, 0, 0.0001);
  assertClose(
    "(ii) otomatik yok + manuel",
    calculateInvoiceMethod3(input, ov({ total_kwh: 1540509, diff_yekdem: 0.703593 }), miNone).yekFarkiCharge!,
    MANUAL, 1
  );

  // (iii) forceZero — checkbox kalemi kapatır (otomatik veri OLMASINA rağmen).
  const bZero = calculateInvoiceMethod3(input, ov(null, true), miWith);
  assertClose("(iii) isExcluded → 0", bZero.yekFarkiCharge!, 0, 0.0001);
  assertClose("(iii) matrah düşüşü", bNat.subtotalBeforeVat - bZero.subtotalBeforeVat, NATURAL, 0.01);
  {
    const list = bZero.appliedOverrides?.excludedItems ?? [];
    const ok = list.includes("yekdem_mahsup");
    if (!ok) failures++;
    console.log(`  ${ok ? "✅" : "❌"} (iii) appliedOverrides.excludedItems = ${JSON.stringify(list)}`);
  }

  // (iv) Kısmi: yalnız diff_yekdem → taban doğaldan (1.540.509) tamamlanır.
  const miPartial: InvoiceMethodInputs = {
    ...miWith, prevSumPos: 1540509, prevTahminiYekdem: 0.5, prevGerceklesenYekdem: 0.6,
  };
  assertClose("(iv) kısmi doğal (fark 0,1)", calculateInvoiceMethod3(input, null, miPartial).yekFarkiCharge!, 156207.61, 1);
  assertClose(
    "(iv) yalnız fark manuel",
    calculateInvoiceMethod3(input, ov({ diff_yekdem: 0.703593 }), miPartial).yekFarkiCharge!,
    MANUAL, 1
  );

  // (v) Kısmi: yalnız total_kwh → fark doğaldan (0,703593) tamamlanır.
  const miPartial2: InvoiceMethodInputs = {
    ...miWith, prevSumPos: 100000, prevTahminiYekdem: 0.5, prevGerceklesenYekdem: 1.203593,
  };
  assertClose("(v) kısmi doğal (taban 100k)", calculateInvoiceMethod3(input, null, miPartial2).yekFarkiCharge!, 71344.33, 1);
  assertClose(
    "(v) yalnız taban manuel",
    calculateInvoiceMethod3(input, ov({ total_kwh: 1540509 }), miPartial2).yekFarkiCharge!,
    MANUAL, 1
  );

  // (vi) Saf fonksiyon doğrudan.
  const direct = resolveYekFarkiWithOverride({
    prevSumPos: 1000000, prevTahminiYekdem: 0.5, prevGerceklesenYekdem: 1.0, kbk,
    override: {
      isExcluded: false, unitPriceOverride: null, amountOverride: null,
      payload: { total_kwh: 1540509, diff_yekdem: 0.703593 }, note: null,
    },
  });
  assertClose("(vi) resolveYekFarkiWithOverride()", direct.amount, MANUAL, 1);
  {
    const ok = direct.overridden === true && direct.excluded === false;
    if (!ok) failures++;
    console.log(`  ${ok ? "✅" : "❌"} (vi) overridden=${direct.overridden} excluded=${direct.excluded}`);
  }
}

// ── FIXTURE 4: Metod 1 regresyonu (golden snapshot) ──────────────
// calculateInvoice.ts'e dokunulmadığının kanıtı. Bilinen girdi → bilinen toplam.
// (Dispatcher'ın metod 1 dalı literal olarak `return calculateInvoice(...)` — değişmedi.)
console.log("\n── Metod 1 regresyonu (golden) ──");
{
  const input = baseInput({
    totalConsumptionKwh: 100000,
    unitPriceEnergy: 2.5,
    tariffType: "dual",
    contractPowerKw: 1000,
    monthFinalDemandKw: 1200,
    powerPrice: 50,
    powerExcessPrice: 75,
    reactivePenaltyCharge: 1234.5,
    totalProductionKwh: 0,
  });
  const b = calculateInvoice(input);
  // Golden değerler ilk çalıştırmada üretildi; calculateInvoice.ts değişirse bunlar kayar.
  assertClose("energyCharge", b.energyCharge, 250000, 0.01);
  assertClose("distributionCharge", b.distributionCharge, 118245.7, 0.5);
  assertClose("powerTotalCharge", b.powerTotalCharge, 65000, 0.01);
  assertClose("reactivePenaltyCharge", b.reactivePenaltyCharge, 1234.5, 0.01);
  // subtotal = 250000 + 118245.7 + btv + 65000 + 1234.5 (üretim 0 → veriş 0)
  console.log(`     (subtotalBeforeVat = ${money(b.subtotalBeforeVat)}, totalInvoice = ${money(b.totalInvoice)})`);
}

// ── FIXTURE 6 (SENTETİK, 2E): Çift terim net-metod güç bedeli ─────────────
// Alt-terim kartı tek→çift senaryosunda net motora dual güç girdisi besler.
// Gerçek OG sanayi çift-terim tarifesi: guc_bedeli=35,575915 · guc_bedeli_asim=71,15183.
// Sözleşme gücü 3.360 kW (99980910 guc_bedel_limit), demand 3.500 kW → aşım 140 kW.
//   base   = 35,575915 × 3.360            = 119.535,0744
//   aşım   = (3.500 − 3.360) × 71,15183   =   9.961,2562
//   toplam = base + aşım                  = 129.496,3306
// (Sözleşme gücü ile demand ARTIK ayrı → aşım gerçek hesaplanır; eskiden ikisi eşitti, aşım hep 0'dı.)
console.log("\n── Sentetik · Çift terim net-metod güç bedeli (2E) ──");
{
  const mi: InvoiceMethodInputs = {
    sumCn: 1000, sumGn: 0, sumPos: 1000, sumMahsup: 0, sumExcess: 0,
    wPos: 1, kbk: 1, tahminiYekdem: 0,
    prevSumPos: null, prevTahminiYekdem: null, prevGerceklesenYekdem: null,
    mahsuplasmaUnitPrice: null,
  };
  const dual = calculateInvoiceMethod2(
    baseInput({
      tariffType: "dual",
      contractPowerKw: 3360,
      monthFinalDemandKw: 3500,
      powerPrice: 35.575915,
      powerExcessPrice: 71.15183,
    }),
    null,
    mi
  );
  assertClose("Güç bedeli base (fiyat×sözleşme)", dual.powerBaseCharge, 119535.07, 0.5);
  assertClose("Güç aşımı ((demand−söz)×aşım)", dual.powerExcessCharge, 9961.26, 0.5);
  assertClose("Güç bedeli toplam (base+aşım)", dual.powerTotalCharge, 129496.33, 0.5);

  // Tek terim tarafta güç bedeli yok (alt = tek terim senaryosu).
  const single = calculateInvoiceMethod2(
    baseInput({
      tariffType: "single",
      contractPowerKw: 3360,
      monthFinalDemandKw: 3500,
      powerPrice: 35.575915,
      powerExcessPrice: 71.15183,
    }),
    null,
    mi
  );
  assertClose("Tek terim güç bedeli (yok→0)", single.powerTotalCharge, 0, 0.01);
}

// ── FIXTURE 7 (SENTETİK, 2E): lisansli_satis dispatcher yönlendirme ───────
// Dispatcher (calculateInvoiceForMethod) lisansli_satis=true net-metod tesisini metod 1'e
// yönlendirir — guard literal: `if (input.lisansliSatis) return calculateInvoice(...)`.
// Bu test dosyası @/lib/supabase zincirine girmemek için dispatcher'ı import ETMEZ; guard
// mantığını birebir yansıtır ve iki yolun AYRIŞTIĞINI (yani yönlendirmenin gerçekten fark
// yarattığını) kanıtlar. Net motor lisansli_satis'i yok sayar → yönlendirme olmasa yanlış hesap.
console.log("\n── Sentetik · lisansli_satis dispatcher yönlendirme (2E) ──");
{
  const mi: InvoiceMethodInputs = {
    sumCn: 200000, sumGn: 120000, sumPos: 100000, sumMahsup: 100000, sumExcess: 20000,
    wPos: 1.5, kbk: 1.0, tahminiYekdem: 0.5,
    prevSumPos: null, prevTahminiYekdem: null, prevGerceklesenYekdem: null,
    mahsuplasmaUnitPrice: null,
  };
  const input = baseInput({
    totalConsumptionKwh: 200000,
    unitPriceEnergy: 2.5,
    lisansliSatis: true,
    totalProductionKwh: 120000,
  });

  // Dispatcher guard'ının seçtiği yol (lisansliSatis=true → metod 1):
  const routed = input.lisansliSatis
    ? calculateInvoice(input, null)
    : calculateInvoiceMethod2(input, null, mi);
  const method1 = calculateInvoice(input, null); // yönlendirme hedefi
  const netEngine = calculateInvoiceMethod2(input, null, mi); // yönlendirme OLMASA çalışacak yol

  // 1) Yönlendirilen sonuç metod 1 ile birebir (aynı çekirdek).
  assertClose("Yönlendirilen = Metod 1 (toplam)", routed.totalInvoice, method1.totalInvoice, 0.01);
  // 2) Net motor lisansli'yi yok sayar → AYRI sonuç → yönlendirme gerçekten gerekli.
  const divergence = Math.abs(method1.totalInvoice - netEngine.totalInvoice);
  console.log(
    `     (metod1 = ${money(method1.totalInvoice)}, net motor = ${money(netEngine.totalInvoice)}, ayrışma = ${money(divergence)})`
  );
  if (divergence <= 1) {
    failures++;
    console.log("  ❌ Yönlendirme testi anlamsız: iki yol ayrışmıyor.");
  } else {
    console.log("  ✅ Metod 1 ile net motor ayrışıyor → yönlendirme gözlemlenebilir.");
  }
  // 3) Kalem şekli farkı: net-metod YEK Bedeli üretir, metod 1 üretmez.
  assertClose(
    "Metod 1'de yekTahminiCharge yok",
    (method1 as MethodInvoiceBreakdown).yekTahminiCharge ?? 0,
    0,
    0.01
  );
}

// ── FIXTURE 8 (SENTETİK, 2F): Metod 4 — GES'siz düz fatura (m1 vs m4) ─────
// Metod 4 = metod-1 motoru + üretim girdileri sıfırlanmış (mahsup yok, dağıtım = D×brüt,
// üretimin tamamı satışa gider). Dispatcher (@/lib/supabase zinciri) import EDİLEMEZ →
// dispatcher'ın metod-4 dalı satır-içi aynalanır:
//   m4 = calculateInvoice({ ...input, totalProductionKwh:0, netPositiveDrawKwh:undefined, netExcessFeedKwh:undefined })
console.log("\n── Sentetik · Metod 4 düz fatura (m1 vs m4) (2F) ──");
{
  const toM4 = (inp: InvoiceInput): InvoiceInput => ({
    ...inp,
    totalProductionKwh: 0,
    netPositiveDrawKwh: undefined,
    netExcessFeedKwh: undefined,
  });

  // (A) Üretimsiz senaryo: m1 ve m4 birebir aynı (trafo dahil).
  {
    const input = baseInput({
      totalConsumptionKwh: 200000,
      unitPriceEnergy: 2.5,
      unitPriceDistribution: 1.182457,
      trafoDegeri: 5000,
      totalProductionKwh: 0,
    });
    const m1 = calculateInvoice(input);
    const m4 = calculateInvoice(toM4(input));
    assertClose("(A) enerji m1==m4", m4.energyCharge, m1.energyCharge, 0.001);
    assertClose("(A) dağıtım m1==m4", m4.distributionCharge, m1.distributionCharge, 0.001);
    assertClose("(A) BTV m1==m4", m4.btvCharge, m1.btvCharge, 0.001);
    assertClose("(A) trafo m1==m4", m4.trafoCharge, m1.trafoCharge, 0.001);
    assertClose("(A) ara toplam m1==m4", m4.subtotalBeforeVat, m1.subtotalBeforeVat, 0.001);
    assertClose("(A) veriş mahsup (ikisi de 0)", m4.verisMahsupBedeli, 0, 0.001);
  }

  // (B) Üretimli senaryo: cn=200.000, gn=120.000, D=1,182457, trafo=5.000, enerji=2,5.
  //   m4 dağıtım = 1,182457 × 205.000 = 242.403,685 · m4 BTV = (500.000+12.500)×%1 = 5.125.
  {
    const input = baseInput({
      totalConsumptionKwh: 200000,
      unitPriceEnergy: 2.5,
      unitPriceDistribution: 1.182457,
      trafoDegeri: 5000,
      totalProductionKwh: 120000,
    });
    const m1 = calculateInvoice(input);
    const m4 = calculateInvoice(toM4(input));

    assertClose("(B) enerji m1==m4 (brüt)", m4.energyCharge, m1.energyCharge, 0.001);
    assertClose("(B) m1 veriş mahsup > 0 (sanity)", m1.verisMahsupBedeli, 300000, 0.5);
    assertClose("(B) m4 veriş mahsup = 0", m4.verisMahsupBedeli, 0, 0.001);
    assertClose("(B) m4 dağıtım = D×(cn+trafo)", m4.distributionCharge, 242403.685, 0.01);
    assertClose(
      "(B) m4 dağıtım = m1 + gn/2 kredisi",
      m4.distributionCharge,
      m1.distributionCharge + m1.distributionAdjustment,
      0.001
    );
    assertClose("(B) m4 BTV = (enerji+trafo)×%1", m4.btvCharge, 5125, 0.01);
    console.log(
      `     (m1 dağıtım = ${money(m1.distributionCharge)}, m4 dağıtım = ${money(m4.distributionCharge)}, gn/2 kredisi = ${money(m1.distributionAdjustment)})`
    );
  }
}

// ── FIXTURE 9 (2H): Alternatif Terim dış-mahsup taşıma invaryantı ────────
// Karş-olgusal (override'sız) toplam + ana faturanın yekFarki'sinin KDV'li katkısı,
// override'lı (matrah-içi) toplamı BİREBİR üretir → post-total "TL taşıma" == matrah-içi;
// çift sayım/yeni yuvarlama yok. 52503 gibi: doğal yekFarki 0, manuel override dolu (~1,1M).
// Böylece (ana Ödenecek − alt Ödenecek) yalnız dağıtım+güç ekseninden gelir.
console.log("\n── Sentetik · Alternatif Terim dış-mahsup taşıma (2H) ──");
{
  const miNone: InvoiceMethodInputs = {
    sumCn: 2000, sumGn: 1000, sumPos: 1200, sumMahsup: 800, sumExcess: 0,
    wPos: 1.5, kbk: 1.014, tahminiYekdem: 0.4,
    prevSumPos: null, prevTahminiYekdem: null, prevGerceklesenYekdem: null,
    mahsuplasmaUnitPrice: null,
  };
  const input: MethodInvoiceInput = baseInput({ onYil: false, perakendeEnerjiBedeli: 2.909687 });
  const ovYek: InvoiceOverrides = {
    yekdem_mahsup: {
      isExcluded: false,
      unitPriceOverride: null,
      amountOverride: null,
      payload: { total_kwh: 1540509, diff_yekdem: 0.703593 },
      note: null,
    },
  };

  const bMain = calculateInvoiceMethod3(input, ovYek, miNone); // matrah-içi yekFarki (override)
  const bAlt = calculateInvoiceMethod3(input, null, miNone);   // override yok → yekFarki 0
  const V = bMain.yekFarkiCharge!;
  const carried = (V - (bAlt.yekFarkiCharge ?? 0)) * (1 + 0.2); // altVatRate = KDV %20

  assertClose("Karş-olgusal kendi yekFarki'si (override yok→0)", bAlt.yekFarkiCharge ?? 0, 0, 0.0001);
  assertClose("Ana yekFarki (override, matrah-içi)", V, 1099065.83, 1);
  // İnvaryant: post-total taşıma, matrah-içi sonucu birebir üretir (delta = yekFarki×(1+KDV)).
  assertClose("Taşınan yekFarki + karş-olgusal = ana toplam", bAlt.totalInvoice + carried, bMain.totalInvoice, 0.5);
}

// ── FIXTURE 10 (2K): Metod 1 Veriş Mahsup perakende tavanı (Sepaş 2026-07) ──
// Kural: dönem ≥ 2026-07 && m1 && !vhs_kayseri → mahsupBirim = min(U, perakende).
// Kapı çağıranda çözülür (bayrak); motor dönem bilmez. Bayraksız çağrı = eski davranış
// → mevcut tüm fixture'lar tanım gereği etkilenmez.
console.log("\n── 2K · Metod 1 Veriş Mahsup perakende tavanı ──");
{
  // Kapı helper'ı — sınır dönemler (y×12+m ordinal aritmetiği).
  const gateCases: ReadonlyArray<readonly [string, boolean, boolean]> = [
    ["kapı 2025-12 → tavan yok", isM1MahsupCapPeriod(2025, 12), false],
    ["kapı 2026-06 → tavan yok", isM1MahsupCapPeriod(2026, 6), false],
    ["kapı 2026-07 → tavan var", isM1MahsupCapPeriod(2026, 7), true],
    ["kapı 2027-01 → tavan var", isM1MahsupCapPeriod(2027, 1), true],
    ["kapı NaN dönem → tavan yok (fail-safe)", isM1MahsupCapPeriod(NaN, 7), false],
  ];
  for (const [label, actual, expected] of gateCases) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  }

  // Aylık yol: veriş 100.000 < tüketim 200.000 → mahsup = 100.000 kWh.
  const mk = (over: Partial<InvoiceInput>): InvoiceInput =>
    baseInput({ totalConsumptionKwh: 200000, totalProductionKwh: 100000, ...over });

  // (a) U < P, dönem 2026-07 (bayrak açık) → bayraksızla TAM AYNI breakdown (tavan pasif).
  {
    const inp = mk({ unitPriceEnergy: 2.5, perakendeEnerjiBedeli: 2.909691 });
    const off = calculateInvoice(inp);
    const on = calculateInvoice({ ...inp, applyVerisMahsupPerakendeCap: true });
    const same = JSON.stringify(on) === JSON.stringify(off);
    if (!same) failures++;
    console.log(`  ${same ? "✅" : "❌"} (a) U ≤ P → breakdown bit-identik (tavan pasif)`);
    assertClose("(a) uygulanan birim = U", on.verisMahsupBirimFiyat!, 2.5, 1e-12);
  }

  // (b) U=3,4 > P=2,909691 → kredi 290.969,10 (eski 340.000); BTV matrahı büyür.
  {
    const inp = mk({ unitPriceEnergy: 3.4, perakendeEnerjiBedeli: 2.909691 });
    const off = calculateInvoice(inp);
    const on = calculateInvoice({ ...inp, applyVerisMahsupPerakendeCap: true });
    assertClose("(b) eski kredi (sanity)", off.verisMahsupBedeli, 340000, 0.01);
    assertClose("(b) tavanlı kredi = kWh × P", on.verisMahsupBedeli, 290969.1, 0.01);
    assertClose("(b) uygulanan birim = P", on.verisMahsupBirimFiyat!, 2.909691, 1e-9);
    const capped = on.verisMahsupCapUygulandi === true;
    if (!capped) failures++;
    console.log(`  ${capped ? "✅" : "❌"} (b) verisMahsupCapUygulandi === true`);
    // BTV artışı = Δkredi × oran = 100.000 × (3,4 − 2,909691) × 0,01 = 490,309.
    assertClose("(b) BTV artışı = Δkredi × btv", on.btvCharge - off.btvCharge, 490.309, 0.001);
    assertClose("(b) enerji kalemi DEĞİŞMEZ", on.energyCharge, off.energyCharge, 1e-9);
    assertClose("(b) dağıtım (gn/2) DEĞİŞMEZ", on.distributionCharge, off.distributionCharge, 1e-9);
    // Ara toplam farkı = kredi azalması (49.030,90) + BTV artışı (490,309).
    assertClose("(b) ara toplam farkı", on.subtotalBeforeVat - off.subtotalBeforeVat, 49030.9 + 490.309, 0.01);
  }

  // (c) U > P ama dönem 2026-06 → kapı kapalı (çağıran bayrağı AÇMAZ) → eski sonuç birebir.
  {
    const inp = mk({ unitPriceEnergy: 3.4, perakendeEnerjiBedeli: 2.909691 });
    const capPeriod = isM1MahsupCapPeriod(2026, 6); // false — geçmiş koruması
    const b = calculateInvoice(capPeriod ? { ...inp, applyVerisMahsupPerakendeCap: true } : inp);
    assertClose("(c) 2026-06 kredi tavansız (eski)", b.verisMahsupBedeli, 340000, 0.01);
  }

  // (d) Perakende yok (num(x,0) gerçeği: 0 gelir) + bayrak açık → tavansız devam + warn.
  {
    const warns: string[] = [];
    const origWarn = console.warn;
    let b: ReturnType<typeof calculateInvoice> | null = null;
    try {
      console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(" ")); };
      b = calculateInvoice(mk({
        unitPriceEnergy: 3.4,
        perakendeEnerjiBedeli: 0,
        applyVerisMahsupPerakendeCap: true,
      }));
    } finally {
      console.warn = origWarn;
    }
    assertClose("(d) perakende yok → kredi tavansız", b!.verisMahsupBedeli, 340000, 0.01);
    const warned = warns.some((w) => w.includes("perakende"));
    if (!warned) failures++;
    console.log(`  ${warned ? "✅" : "❌"} (d) console.warn basıldı (${warns.length} adet)`);
    const sparse = !("verisMahsupCapUygulandi" in b!);
    if (!sparse) failures++;
    console.log(`  ${sparse ? "✅" : "❌"} (d) capUygulandi anahtarı eklenmedi (sparse)`);
  }
}

// ── FIXTURE 11 (2L-R): Metod 6 (Kepsaş) — Metod 4 tabanı + gömülü YEKDEM ──────
// Metod 6 TABANI = Metod 4 gibi (üretim etkileri sıfır → veriş mahsup yok, dağıtım
// = D×(brüt+trafo)); önceki dönem YEKDEM mahsubu ÇIPLAK tutar olarak enerji birim
// fiyatına gömülür. Dispatcher'ın yaptığı input dönüşümü burada birebir taklit edilir.
console.log("\n── FIXTURE 11 (2L-R): Metod 6 (Kepsaş) — m4 tabanı + gömülü YEKDEM ──");
{
  const btvRate = 0.01;
  const vatRate = 0.2;
  // invoiceMethods.ts metod-6 dalının input dönüşümü (üretim etkilerini sıfırla).
  const m6Base = (inp: InvoiceInput) =>
    calculateInvoice({ ...inp, totalProductionKwh: 0, netPositiveDrawKwh: undefined, netExcessFeedKwh: undefined });

  const prevKwh = 80000;
  const kbk = 1.02;
  const yekdemOld = 0.5;
  const yekdemNew = 0.7;
  const bareAdder = (yekdemNew - yekdemOld) * kbk * prevKwh; // 16 320
  const m1Mahsup = calculateYekdemMahsup({ totalKwh: prevKwh, kbk, btvRate, vatRate, yekdemOld, yekdemNew });
  assertClose("çıplak→vergi-dahil ilişki", bareAdder * (1 + btvRate) * (1 + vatRate), m1Mahsup, 0.001);

  // ── T1: EŞDEĞERLİK (üretimsiz + trafosuz) — m6 ödenecek == m1 "YEKDEM Mahsubu Dahil" ──
  {
    const grossKwh = 100000;
    const inp = baseInput({ totalConsumptionKwh: grossKwh, unitPriceEnergy: 2.5, trafoDegeri: 0, totalProductionKwh: 0, btvRate, vatRate });
    const m1base = calculateInvoice(inp); // üretim yok → m4 tabanı ile çakışır
    const base6 = m6Base(inp);
    const emb = embedYekdemMahsupIntoEnergy(base6, bareAdder, btvRate, vatRate, grossKwh);
    assertClose("(T1) m6 == m1 totalWithMahsup", emb.totalInvoice, m1base.totalInvoice + m1Mahsup, 0.01);
    assertClose("(T1) enerji = m1 + çıplak", emb.energyCharge, base6.energyCharge + bareAdder, 0.01);
    assertClose("(T1) gösterilen birim fiyat", emb.energyUnitPriceShown ?? -1, emb.energyCharge / grossKwh, 1e-9);
  }

  // ── T2: ÜRETİMLİ — veriş mahsup YOK; dağıtım = D×(brüt+trafo); bileşen çözümü ──
  {
    const grossKwh = 100000;
    const trafo = 5000;
    const D = 1.182457;
    const inp = baseInput({ totalConsumptionKwh: grossKwh, unitPriceEnergy: 2.5, unitPriceDistribution: D, trafoDegeri: trafo, totalProductionKwh: 20000, btvRate, vatRate });
    const m1base = calculateInvoice(inp);  // üretim KORUNUR (veriş mahsup + gn/2 kredisi)
    const base6 = m6Base(inp);             // üretim SIFIR
    assertClose("(T2) veriş mahsup bedeli = 0", base6.verisMahsupBedeli, 0, 1e-9);
    assertClose("(T2) veriş mahsup kWh = 0", base6.verisMahsupKwh, 0, 1e-9);
    assertClose("(T2) dağıtım = D×(brüt+trafo)", base6.distributionCharge, D * (grossKwh + trafo), 0.01);
    assertClose("(T2) BTV = (enerji+trafo)×oran", base6.btvCharge, (2.5 * grossKwh + 2.5 * trafo) * btvRate, 0.01);
    // Cebirsel: m6 KDV-hariç, m1'den (veriş kredisi + dağıtım gn/2 kredisi + BTV farkı) kadar FAZLA.
    const verisKredi = m1base.verisMahsupBedeli;
    const gn2Kredi = m1base.distributionAdjustment;
    const btvFark = base6.btvCharge - m1base.btvCharge;
    assertClose("(T2) bileşen çözümü", base6.subtotalBeforeVat - m1base.subtotalBeforeVat, verisKredi + gn2Kredi + btvFark, 0.01);
    console.log(`     bileşenler: verişKredi=${money(verisKredi)} · gn2Kredi=${money(gn2Kredi)} · btvFark=${money(btvFark)}`);
  }

  // ── T3: M=0 → m6 == "m4 tabanı + trafo" (bit-identik) ──
  {
    const grossKwh = 100000;
    const inp = baseInput({ totalConsumptionKwh: grossKwh, unitPriceEnergy: 2.5, trafoDegeri: 5000, totalProductionKwh: 20000, btvRate, vatRate });
    const base6 = m6Base(inp);
    const emb0 = embedYekdemMahsupIntoEnergy(base6, 0, btvRate, vatRate, grossKwh);
    assertClose("(T3) M=0 → totalInvoice = m6 tabanı", emb0.totalInvoice, base6.totalInvoice, 1e-9);
    assertClose("(T3) M=0 → enerji = m6 tabanı", emb0.energyCharge, base6.energyCharge, 1e-9);
    const zeroAdder = (emb0.embeddedYekdemAdderTL ?? -1) === 0;
    if (!zeroAdder) failures++;
    console.log(`  ${zeroAdder ? "✅" : "❌"} (T3) M=0 → embeddedYekdemAdderTL = 0`);
  }

  // ── T4: NEGATİF M → birim fiyat DÜŞER, eşdeğerlik korunur ──
  {
    const grossKwh = 100000;
    const inp = baseInput({ totalConsumptionKwh: grossKwh, unitPriceEnergy: 2.5, totalProductionKwh: 0, btvRate, vatRate });
    const m1base = calculateInvoice(inp);
    const base6 = m6Base(inp);
    const m1MahsupNeg = calculateYekdemMahsup({ totalKwh: prevKwh, kbk, btvRate, vatRate, yekdemOld: yekdemNew, yekdemNew: yekdemOld });
    const embNeg = embedYekdemMahsupIntoEnergy(base6, -bareAdder, btvRate, vatRate, grossKwh);
    assertClose("(T4) negatif eşdeğerlik", embNeg.totalInvoice, m1base.totalInvoice + m1MahsupNeg, 0.01);
    const dropped = (embNeg.energyUnitPriceShown ?? Infinity) < base6.energyCharge / grossKwh;
    if (!dropped) failures++;
    console.log(`  ${dropped ? "✅" : "❌"} (T4) negatif mahsupta birim fiyat düştü`);
  }
}

// ════════════════════════════════════════════════════════════════
// F12) Metot 7 (Meram / MEPAŞ) — Niğde As Beton, 2026-08
// ════════════════════════════════════════════════════════════════
// Üç gerçek MEPAŞ faturası (docs/talep-birlestirme/MEP2026001103027/105368/106751)
// + Meram mahsup exceli ("Niğde As Beton.xlsx") + epias_ptf_hourly 2026-08
// (scripts/fixtures/ptf-2026-08.json, bir kez export). Excel'de H ve K kolonları
// trafo kaybı DAHİL, E'de trafo yok → fixture t=0, değerler cons olarak verilir.
// Zincir üretimdekiyle aynı SAF fonksiyonlar: allocateSaatlikOransal (havuz) →
// computeHourlyNetAggregates → calculateInvoiceMethod7. Tutarlar ±0,20 TL, U 6 hane.
console.log("\n── F12) Metot 7 · Niğde As Beton 2026-08 (3 MEPAŞ faturası) ──");
{
  const AB_FIXTURE = "docs/talep-birlestirme/Niğde As Beton.xlsx";
  const PTF_FIXTURE = "scripts/fixtures/ptf-2026-08.json";
  const HOUR = 3_600_000;
  const TOL_TL = 0.2;

  const assertEq6 = (label: string, actual: number, expected: number) => {
    const ok = Math.abs(actual - expected) <= 5e-7;
    if (!ok) failures++;
    console.log(
      `  ${ok ? "✅" : "❌"} ${label.padEnd(34)} = ${actual.toFixed(6).padStart(16)}   (beklenen ${expected.toFixed(6)})`
    );
  };
  const assertTrue = (label: string, cond: boolean) => {
    if (!cond) failures++;
    console.log(`  ${cond ? "✅" : "❌"} ${label}`);
  };

  if (!existsSync(AB_FIXTURE) || !existsSync(PTF_FIXTURE)) {
    failures++;
    console.log(`  ❌ Fixture bulunamadı: ${AB_FIXTURE} / ${PTF_FIXTURE}`);
  } else {
    const ptfFx = JSON.parse(readFileSync(PTF_FIXTURE, "utf8")) as {
      startTs: string;
      hours: number;
      ptf_tl_mwh: number[];
    };
    const t0 = new Date(ptfFx.startTs).getTime();
    const tsAt = (i: number) => new Date(t0 + i * HOUR).toISOString();
    const keyAt = (i: number) => tsAt(i).slice(0, 13);
    const ptfMap = new Map<string, number>();
    ptfFx.ptf_tl_mwh.forEach((mwh, i) => ptfMap.set(keyAt(i), mwh / 1000));
    assertTrue(`PTF fixture 744 saat (gerçek: ${ptfFx.ptf_tl_mwh.length})`, ptfFx.ptf_tl_mwh.length === 744);

    const wb = XLSX.read(readFileSync(AB_FIXTURE), { type: "buffer", cellDates: false });
    const ws = wb.Sheets["NİĞDE AS BETON"] as Record<string, { v?: unknown }>;
    const col = (c: string): number[] => {
      const out: number[] = [];
      for (let r = 2; r <= 745; r++) {
        const v = Number(ws[c + r]?.v);
        out.push(Number.isFinite(v) ? v : 0);
      }
      return out;
    };
    // A2 = Excel seri tarihi 2026-08-01 00:00 (TR) = startTs (UTC 21:00, önceki gün).
    const a2Ms = Math.round((Number(ws.A2?.v) - 25569) * 86_400_000) - 3 * HOUR;
    assertTrue("Excel A2 ≡ PTF startTs (saat hizası)", a2Ms === t0);

    const zeros = new Array<number>(744).fill(0);
    const FAC = [
      {
        serno: 10126953, prio: 1, cons: col("H"), gn: col("C"), gddk: 82.26,
        exp: { C: 46225.1971, N: 30509.33, G: 4967.52, U: 3.661029, enerji: 111695.54, F: -87.72,
          satir2: -5.46, dagitim: 51722.39, etv: 1116.9, matrah: 164529.37, kdv: 32905.87, toplam: 197435.24, yarim: false },
      },
      {
        serno: 10128583, prio: 2, cons: col("E"), gn: col("B"), gddk: 1180.11,
        exp: { C: 243564.3042, N: 240504.24, G: 452604.6, U: 3.62191, enerji: 871084.7, F: 1261.63,
          satir2: 2441.74, dagitim: 144002.28, etv: 8735.26, matrah: 1026263.98, kdv: 205252.8, toplam: 1231516.78, yarim: true },
      },
      {
        serno: 9062757, prio: 3, cons: col("K"), gn: zeros, gddk: 51.54,
        exp: { C: 13160.5208, N: 3145.67, G: 0, U: 3.680513, enerji: 11577.7, F: -2223.21,
          satir2: -2171.67, dagitim: 15561.75, etv: 94.06, matrah: 25061.84, kdv: 5012.37, toplam: 30074.21, yarim: false },
      },
    ];

    const Y = 0.395303;
    const KBK = 0.952;
    const PERAKENDE = 2.909687;
    const D = 1.182457;

    type Fac = (typeof FAC)[number];
    const seriesOf = (cons: number[], gn: number[]): HourlySeries => {
      const m: HourlySeries = new Map();
      cons.forEach((c, i) => m.set(keyAt(i), { cn: c, gn: gn[i] }));
      return m;
    };
    const rowsOf = (cons: number[], gn: number[]) =>
      cons.map((c, i) => ({ ts: tsAt(i), cn: c, gn: gn[i] }));
    const runPool = (seriesBySerno: Map<number, HourlySeries>) => {
      const assignments = FAC.map((f) => ({ subscription_serno: f.serno, priority: f.prio }));
      const listed = new Set(FAC.map((f) => f.serno));
      return allocateSaatlikOransal({
        assignments,
        seriesBySerno,
        srcSeries: buildPoolSrcSeries({ assignments, seriesBySerno }),
        isSourceSerno: (s) => listed.has(s),
      });
    };
    const viewOf = (f: Fac, res: ReturnType<typeof runPool>): FacilityAllocationView => {
      const a = res.perSerno.get(f.serno)!;
      return {
        role: "assigned",
        priority: f.prio,
        allocByHour: a.allocByHour,
        allocTotal: a.allocTotal,
        excessTotal: f.prio === 1 ? res.excessTotal : 0,
        isSource: true, // havuz modu: listedeki herkes (own_gn=0)
        mode: "saatlik_oransal",
        ownGnTotal: f.gn.reduce((s, x) => s + x, 0),
      };
    };
    const meramInputs = (
      agg: ReturnType<typeof computeHourlyNetAggregates>,
      gddk: number | null,
      extra?: Partial<NonNullable<InvoiceMethodInputs["meram"]>>
    ): InvoiceMethodInputs => ({
      sumCn: agg.sumCn,
      sumGn: agg.sumGn,
      sumPos: agg.sumPos,
      sumMahsup: agg.sumMahsup,
      sumExcess: agg.sumExcess,
      wPos: agg.wPos,
      wMahsup: agg.wMahsup,
      kbk: KBK,
      tahminiYekdem: Y,
      prevSumPos: null,
      prevTahminiYekdem: null,
      prevGerceklesenYekdem: null,
      mahsuplasmaUnitPrice: null,
      meram: {
        ownGnTotal: agg.sumOwnGn,
        trafoKaybiSaatlik: 0,
        trafoKaybiKwh: agg.trafoKaybiKwh,
        unitPriceAdjustment: 0,
        yekdemIsFinal: true,
        gddk,
        ...extra,
      },
    });
    const m7Input = (agg: ReturnType<typeof computeHourlyNetAggregates>, over?: Partial<MethodInvoiceInput>): MethodInvoiceInput => ({
      ...baseInput({
        totalConsumptionKwh: agg.sumCn,
        unitPriceDistribution: D,
        perakendeEnerjiBedeli: PERAKENDE,
      }),
      ...over,
    });

    const pool = runPool(new Map(FAC.map((f) => [f.serno, seriesOf(f.cons, f.gn)])));
    assertClose("havuz tahsisi 10126953 (Excel I)", pool.perSerno.get(10126953)!.allocTotal, 15715.88, 0.01);
    assertClose("havuz tahsisi 10128583 (Excel F)", pool.perSerno.get(10128583)!.allocTotal, 3060.06, 0.01);
    assertClose("havuz tahsisi 9062757 (Excel L)", pool.perSerno.get(9062757)!.allocTotal, 10014.85, 0.01);

    const natural = new Map<number, MethodInvoiceBreakdown>();
    const aggBySerno = new Map<number, ReturnType<typeof computeHourlyNetAggregates>>();

    for (const f of FAC) {
      console.log(`\n  ▸ ${f.serno}`);
      const agg = computeHourlyNetAggregates({ rows: rowsOf(f.cons, f.gn), view: viewOf(f, pool), ptfMap });
      aggBySerno.set(f.serno, agg);

      // wNet / wM kimliği: spec tanımıyla bağımsız hesap (eff = havuz tahsisi).
      const alloc = pool.perSerno.get(f.serno)!.allocByHour;
      let vN = 0, N = 0, vM = 0, M = 0;
      for (let i = 0; i < 744; i++) {
        const eff = alloc.get(keyAt(i)) ?? 0;
        const mah = Math.min(f.cons[i], eff);
        const net = f.cons[i] - mah;
        const p = ptfMap.get(keyAt(i))!;
        N += net; M += mah; vN += net * p; vM += mah * p;
      }
      assertEq6("wPos ≡ Σ net·PTF / N (wNet)", agg.wPos, vN / N);
      assertEq6("wMahsup ≡ Σ mahsup·PTF / M (wM)", agg.wMahsup, vM / M);
      assertClose("ptfMissingPosKwh = 0", agg.ptfMissingPosKwh, 0, 1e-9);
      assertClose("ptfCoveredMahsupKwh = M", agg.ptfCoveredMahsupKwh, agg.sumMahsup, 1e-6);
      assertClose("Σ mahsup_h = M (kimlik)", M, agg.sumMahsup, 1e-6);
      assertClose("C (dağıtım kWh)", agg.sumCn, f.exp.C, 0.01);
      assertClose("N (enerji kWh)", agg.sumPos, f.exp.N, 0.01);
      assertClose("G_own (sumOwnGn)", agg.sumOwnGn, f.exp.G, 0.01);

      const b = calculateInvoiceMethod7(m7Input(agg), null, meramInputs(agg, f.gddk));
      natural.set(f.serno, b);
      assertEq6("U (6 hane)", Math.round((b.energyUnitPriceApplied ?? 0) * 1e6) / 1e6, f.exp.U);
      assertClose("Enerji (N × U)", b.energyCharge, f.exp.enerji, TOL_TL);
      assertClose("F (mahsuplaşma farkı)", b.meram!.mahsuplasmaFarki, f.exp.F, TOL_TL);
      assertClose("Satır 2 (F + GDDK)", b.meram!.satir2, f.exp.satir2, TOL_TL);
      assertClose("Dağıtım", b.distributionCharge, f.exp.dagitim, TOL_TL);
      assertClose("ETV (BTV)", b.btvCharge, f.exp.etv, TOL_TL);
      assertClose("KDV matrahı", b.subtotalBeforeVat, f.exp.matrah, TOL_TL);
      assertClose("KDV", b.vatCharge, f.exp.kdv, TOL_TL);
      assertClose("Toplam", b.totalInvoice, f.exp.toplam, TOL_TL);
      assertTrue(`dağıtım yarım kuralı = ${f.exp.yarim}`, b.meram!.dagitimYarim === f.exp.yarim);
      assertClose("distributionChargeKwh = C", b.distributionChargeKwh, agg.sumCn, 1e-9);
      assertClose("trafo kalemi 0", b.trafoCharge, 0, 0);
      assertClose("YEK / YEK Farkı 0", (b.yekTahminiCharge ?? 0) + (b.yekFarkiCharge ?? 0), 0, 0);
    }

    // ── Trafo kaybı t: ham (t'siz) seri + ön-dönüşüm ≡ Excel'in trafo-dahil değerleri.
    console.log("\n  ▸ trafo kaybı t = 1,12 (10126953, 9062757) — ön-dönüşüm eşdeğerliği");
    {
      const T = 1.12;
      const keys = hourGridKeys(tsAt(0), tsAt(744));
      assertTrue(`Ağustos ızgarası 744 saat (gerçek: ${keys.length})`, keys.length === 744);
      const tOf = (serno: number) => (serno === 10128583 ? 0 : T);
      const rawCons = (f: Fac) => f.cons.map((c) => c - tOf(f.serno));

      const tSeries = new Map<number, HourlySeries>();
      for (const f of FAC) {
        tSeries.set(f.serno, addTrafoKaybiToSeries(seriesOf(rawCons(f), f.gn), tOf(f.serno), keys));
      }
      const tPool = runPool(tSeries);
      for (const f of FAC) {
        assertClose(
          `tahsis t'li ≡ fixture (${f.serno})`,
          tPool.perSerno.get(f.serno)!.allocTotal,
          pool.perSerno.get(f.serno)!.allocTotal,
          1e-6
        );
        const aug = addTrafoKaybiToRows(rowsOf(rawCons(f), f.gn), tOf(f.serno), keys);
        const agg = computeHourlyNetAggregates({
          rows: aug.rows,
          view: viewOf(f, tPool),
          ptfMap,
          trafoKaybiKwh: aug.trafoKwh,
        });
        if (tOf(f.serno) > 0) {
          // Faturadaki TRFKYB toplamı: 381,92 + 173,60 + 277,76 = 833,28 = 1,12 × 744
          assertClose(`trafo kWh = TRFKYB 833,28 (${f.serno})`, agg.trafoKaybiKwh, 833.28, 1e-6);
        }
        const b = calculateInvoiceMethod7(
          m7Input(agg),
          null,
          meramInputs(agg, f.gddk, { trafoKaybiSaatlik: tOf(f.serno) })
        );
        assertClose(`toplam t'li ≡ fixture (${f.serno})`, b.totalInvoice, natural.get(f.serno)!.totalInvoice, 1e-6);
      }
    }

    // ── trafoKaybi.ts birimleri
    console.log("\n  ▸ trafoKaybi.ts birimleri");
    {
      const r = addTrafoKaybiToRows(
        [
          { ts: tsAt(0), cn: 5, gn: 1 },
          { ts: tsAt(0), cn: 2, gn: 0 }, // aynı saatin 2. satırı → t EKLENMEZ
          { ts: tsAt(2), cn: 3, gn: 0 },
          { ts: tsAt(9), cn: 4, gn: 0 }, // ızgara dışı → aynen
        ],
        1,
        [keyAt(0), keyAt(1), keyAt(2)]
      );
      const sumCn = r.rows.reduce((s, x) => s + Number(x.cn), 0);
      assertTrue("eksik saat açıldı (5 satır)", r.rows.length === 5);
      assertClose("Σcn = 14 + 3×t (çift satıra tek ekleme)", sumCn, 17, 1e-12);
      assertClose("trafoKwh = t × saat", r.trafoKwh, 3, 1e-12);
      const filled = r.rows.find((x) => String(x.ts).slice(0, 13) === keyAt(1));
      assertTrue("eksik saat {cn: t, gn: 0}", filled != null && Number(filled.cn) === 1 && Number(filled.gn) === 0);
      const same = addTrafoKaybiToRows([{ ts: tsAt(0), cn: 5, gn: 1 }], 0, [keyAt(0), keyAt(1)]);
      assertTrue("t = 0 → satırlar aynen, trafoKwh 0", same.rows.length === 1 && Number(same.rows[0].cn) === 5 && same.trafoKwh === 0);
      const s0: HourlySeries = new Map([[keyAt(0), { cn: 2, gn: 7 }]]);
      assertTrue("seri: t = 0 → aynı örnek", addTrafoKaybiToSeries(s0, 0, [keyAt(0)]) === s0);
      const s1 = addTrafoKaybiToSeries(s0, 1.5, [keyAt(0), keyAt(1)]);
      assertTrue(
        "seri: cn += t, eksik saat {t, 0}, gn aynen, girdi değişmez",
        s1.get(keyAt(0))!.cn === 3.5 && s1.get(keyAt(0))!.gn === 7 && s1.get(keyAt(1))!.cn === 1.5 &&
          s1.get(keyAt(1))!.gn === 0 && s0.get(keyAt(0))!.cn === 2
      );
      assertTrue("ızgara kapağı (capIso) 10 saat", hourGridKeys(tsAt(0), tsAt(744), { capIso: tsAt(10) }).length === 10);
      assertTrue("endInclusive ızgara 745 saat", hourGridKeys(tsAt(0), tsAt(744), { endInclusive: true }).length === 745);
      assertTrue(
        "tamamlanmış dönem → kapak yok",
        trafoGridCapIso({ startIso: tsAt(0), endIso: tsAt(744), lastTs: tsAt(700), nowMs: t0 + 800 * HOUR }) === null
      );
      assertTrue(
        "cari dönem → son veri saati + 1",
        trafoGridCapIso({ startIso: tsAt(0), endIso: tsAt(744), lastTs: tsAt(5), nowMs: t0 + 7.5 * HOUR }) === tsAt(6)
      );
      assertTrue(
        "cari dönem, veri yok → ızgara boş",
        trafoGridCapIso({ startIso: tsAt(0), endIso: tsAt(744), lastTs: null, nowMs: t0 + 7 * HOUR }) === tsAt(0)
      );
      assertTrue("normalizeTrafoKaybi(null/−1/'1,12'/1.12)",
        normalizeTrafoKaybi(null) === 0 && normalizeTrafoKaybi(-1) === 0 && normalizeTrafoKaybi("x") === 0 &&
          normalizeTrafoKaybi("1.12") === 1.12);
    }

    // ── Override öncelikleri ve m7'de etkisiz kalemler (10126953 üzerinden)
    console.log("\n  ▸ override öncelikleri (10126953)");
    {
      const agg = aggBySerno.get(10126953)!;
      const nat = natural.get(10126953)!;
      const line = (o: Partial<{ isExcluded: boolean; unitPriceOverride: number | null; amountOverride: number | null }>) => ({
        isExcluded: false, unitPriceOverride: null, amountOverride: null, payload: null, note: null, ...o,
      });
      const run = (ov: InvoiceOverrides | null, over?: Partial<MethodInvoiceInput>, extra?: Partial<NonNullable<InvoiceMethodInputs["meram"]>>) =>
        calculateInvoiceMethod7(m7Input(agg, over), ov, meramInputs(agg, 82.26, extra));

      const gOv = run({ yekdem_gddk: line({ amountOverride: 100 }) });
      assertClose("GDDK override kazanır (satır2 = F + 100)", gOv.meram!.satir2, nat.meram!.mahsuplasmaFarki + 100, 1e-9);
      assertTrue("appliedOverrides: yekdem_gddk", gOv.appliedOverrides?.amountOverriddenItems.includes("yekdem_gddk") === true);
      assertClose("GDDK override BTV'ye akar", gOv.btvCharge, (gOv.energyCharge + gOv.meram!.satir2) * 0.01, 1e-9);
      const gEx = run({ yekdem_gddk: line({ isExcluded: true }) });
      assertClose("GDDK isExcluded → 0", gEx.meram!.gddk, 0, 0);
      const gNone = calculateInvoiceMethod7(m7Input(agg), null, meramInputs(agg, null));
      assertClose("GDDK yok → 0", gNone.meram!.gddk, 0, 0);

      const eOv = run({ enerji: line({ unitPriceOverride: 3.5 }) });
      assertClose("enerji birim override (N × 3,5)", eOv.energyCharge, agg.sumPos * 3.5, 1e-6);
      const dOv = run({ dagitim: line({ unitPriceOverride: 1 }) });
      assertClose("dağıtım birim override (C − G_own/2)", dOv.distributionCharge, agg.sumCn - agg.sumOwnGn / 2, 1e-6);
      const mOv = run({ mahsuplasma: line({ unitPriceOverride: 0.5 }) });
      assertClose("mahsuplaşma birim override (F = −M × 0,5)", mOv.meram!.mahsuplasmaFarki, -agg.sumMahsup * 0.5, 1e-6);
      const adj = run(null, undefined, { unitPriceAdjustment: 0.1 });
      assertClose("unit_price_adjustment U'ya eklenir", adj.energyUnitPriceApplied ?? 0, (nat.energyUnitPriceApplied ?? 0) + 0.1, 1e-12);

      const ignored = run(
        {
          trafo: line({ amountOverride: 999 }),
          yek: line({ amountOverride: 999 }),
          yekdem_mahsup: { ...line({}), payload: { total_kwh: 1000, diff_yekdem: 1 } },
        },
        { trafoDegeri: 833 }
      );
      assertClose("trafo/yek/yekdem_mahsup override + trafo_degeri etkisiz", ignored.totalInvoice, nat.totalInvoice, 1e-9);
      assertTrue("etkisiz kalemler appliedOverrides'ta yok", ignored.appliedOverrides == null);
    }
  }
}

console.log(
  failures === 0
    ? "\n✅ TÜM KABUL TESTLERİ GEÇTİ.\n"
    : `\n❌ ${failures} ASSERTION BAŞARISIZ.\n`
);
process.exit(failures === 0 ? 0 : 1);
