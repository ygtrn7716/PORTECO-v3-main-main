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

import type { InvoiceInput } from "../src/components/utils/calculateInvoice";
import { calculateInvoice, isM1MahsupCapPeriod } from "../src/components/utils/calculateInvoice";
import {
  calculateInvoiceMethod2,
  calculateInvoiceMethod3,
  calculateInvoiceMethod5,
  calculateYekFarki,
  resolveYekFarkiWithOverride,
  type InvoiceMethodInputs,
  type MethodInvoiceInput,
  type MethodInvoiceBreakdown,
} from "../src/components/utils/calculateInvoiceNetMethods";
// type-only → tsx'te silinir, @/lib/supabase zincirine girmez.
import type { InvoiceOverrides } from "../src/components/utils/invoiceOverrides";

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

console.log(
  failures === 0
    ? "\n✅ TÜM KABUL TESTLERİ GEÇTİ.\n"
    : `\n❌ ${failures} ASSERTION BAŞARISIZ.\n`
);
process.exit(failures === 0 ? 0 : 1);
