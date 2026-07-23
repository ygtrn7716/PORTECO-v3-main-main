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
import { calculateInvoice } from "../src/components/utils/calculateInvoice";
import {
  calculateInvoiceMethod2,
  calculateInvoiceMethod3,
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
// KBK=1,014 · D=1,182457 · tahminiYekdem=0,581
console.log("\n── Metod 3 (Tredaş) · Tesis 52503 · 2026-06 ──");
{
  const mi: InvoiceMethodInputs = {
    sumCn: 2305781.1,
    sumGn: 929595.6,
    sumPos: 1491606.126,
    sumMahsup: 814174.974,
    sumExcess: 115420.626,
    wPos: 1.647616587663028946289002, // canlı DB'den tam hassasiyet
    kbk: 1.014,
    tahminiYekdem: 0.581,
    // Önceki dönem (Mayıs) verisi YOK → YEK Farkı kalemi 0 (D3 "veri yok" dalı).
    prevSumPos: null,
    prevTahminiYekdem: null,
    prevGerceklesenYekdem: null,
    mahsuplasmaUnitPrice: null, // default → T-0 fiyatı
  };
  const input: MethodInvoiceInput = baseInput({ onYil: false, perakendeEnerjiBedeli: 2.909687 });

  const b = calculateInvoiceMethod3(input, null, mi);
  assertClose("T-0 enerji birim fiyat", b.energyUnitPriceApplied!, 1.67068, 0.00001);
  assertClose("Enerji", b.energyCharge, 2492001, 1);
  assertClose("Dağıtım", b.distributionCharge, 1763760, 1);
  assertClose("Muhtelif-2 dağıtım (+)", b.muhtelif2Dagitim!, 962727, 1);
  assertClose("Muhtelif-2 mahsup kredisi (−)", b.muhtelif2MahsupKredisi!, 1360228, 1);
  assertClose("Önceki YEKDEM Mahsup (veri yok→0)", b.yekFarkiCharge!, 0, 0.0001);
  // 2G: BTV matrahı = Enerji + Tahmini YEKDEM − mahsuplaşma kredisi (btv_enabled=açık, rate %1).
  // (2.492.001,33 + 878.740,90 − 1.360.228,47) × %1 ≈ 20.105,14 (Önceki YEKDEM Mahsup ve
  // Muhtelif-2 dağıtım bileşeni matraha girmez).
  assertClose("BTV (Enerji+YEKDEM−mahsup kredisi)", b.btvCharge, 20105.14, 1);

  // Mahsuplaşma override'ı (gerçek Trepaş faturasındaki 1,82375) → −1.484.851,44
  const bOv = calculateInvoiceMethod3(input, { mahsuplasma: { isExcluded: false, unitPriceOverride: 1.82375, amountOverride: null, payload: null, note: null } }, mi);
  assertClose("Muhtelif-2 kredisi (override 1,82375)", bOv.muhtelif2MahsupKredisi!, 1484851, 1);
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
  // m3 matrah değişikliği yanlışlıkla m2'ye sıçramasın. Enerji × %1 ≈ 9.485,67.
  assertClose("BTV (yalnız enerji, m2 sigortası)", b.btvCharge, 9485.67, 1);
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

console.log(
  failures === 0
    ? "\n✅ TÜM KABUL TESTLERİ GEÇTİ.\n"
    : `\n❌ ${failures} ASSERTION BAŞARISIZ.\n`
);
process.exit(failures === 0 ? 0 : 1);
