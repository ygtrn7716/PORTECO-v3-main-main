// scripts/check-method-override.ts
//
// Abonelik bazlı fatura metodu (subscription_settings.invoice_method_override) kabul testleri.
//   npm run check:method-override
//
// SORGU YOK. invoiceMethods.ts "@/lib/supabase" import ettiği için betik
// scripts/tsconfig.harness.json ile çalışır (salt-okunur shim; yalnız .env okunur).
//
// Kapsam:
//   1) Resolver: efektif = override ?? şirket metodu; override'da invoiceFrom şirket anahtarı.
//   2) Dispatcher: "dağıtım kendi verişiyle" bayrağı m7'nin GERÇEK motor çağrısına geçer
//      (MEDAŞ bloğu), m7'nin m1 fallback'leri (lisanslı / methodInputs yok / meram yok) ve
//      m2–m6, m8 bayraktan bağımsız; bayrak yokken m7 çıktısı değişmez.

import {
  calculateInvoiceForMethod,
  methodForProvider,
  methodForSubscription,
  parseInvoiceMethodOverride,
  type InvoiceMethodMap,
} from "../src/lib/invoiceMethods";
import type {
  InvoiceMethodInputs,
  MethodInvoiceInput,
} from "../src/components/utils/calculateInvoiceNetMethods";
import { hesaplaDagitimKendiVeris } from "../src/components/utils/dagitimKendiVeris";

let failures = 0;
function assertTrue(label: string, cond: boolean) {
  if (!cond) failures++;
  console.log(`  ${cond ? "✅" : "❌"} ${label}`);
}
function assertClose(label: string, actual: number, expected: number, tol: number) {
  const diff = Math.abs(actual - expected);
  const ok = diff <= tol;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "✅" : "❌"} ${label.padEnd(46)} = ${actual.toFixed(6).padStart(16)}   (beklenen ${expected.toFixed(6)}, Δ ${diff.toExponential(2)})`
  );
}

// Uyarıları sustur (beklenen warn'lar) ama say.
let warns = 0;
const origWarn = console.warn;
console.warn = () => {
  warns++;
};

// ── 1) Resolver ─────────────────────────────────────────────────
console.log("\n── 1) Resolver: efektif = override ?? şirket metodu ──");
{
  const map: InvoiceMethodMap = new Map([
    ["meram", { invoiceFrom: "meram", methodId: 1 }],
    ["vhs_kayseri", { invoiceFrom: "kayseri_osb", methodId: 1 }],
    ["uedas", { invoiceFrom: "uedas", methodId: 2 }],
  ]);

  const none = methodForSubscription(map, "meram", null);
  assertTrue("override null → şirket metodu (meram → 1)", none.methodId === 1 && none.invoiceFrom === "meram" && none.source === "company");
  const same = methodForProvider(map, "meram");
  assertTrue("override null ≡ methodForProvider (bit-identik)", same.methodId === none.methodId && same.invoiceFrom === none.invoiceFrom);

  const ov = methodForSubscription(map, "meram", 7);
  assertTrue("override 7 → 7, invoiceFrom şirket anahtarı ('meram')", ov.methodId === 7 && ov.invoiceFrom === "meram" && ov.source === "override");
  const ovStr = methodForSubscription(map, "meram", "7");
  assertTrue("override '7' (string) → 7", ovStr.methodId === 7);
  const ovKay = methodForSubscription(map, "vhs_kayseri", 1);
  assertTrue("Kayseri override 1 → invoiceFrom 'kayseri_osb' korunur", ovKay.methodId === 1 && ovKay.invoiceFrom === "kayseri_osb");

  warns = 0;
  const bad = methodForSubscription(map, "uedas", 42);
  assertTrue("geçersiz override (42) → şirket metodu + uyarı", bad.methodId === 2 && bad.source === "company" && warns >= 1);
  assertTrue("parseInvoiceMethodOverride: null/''/undefined → null",
    parseInvoiceMethodOverride(null) === null && parseInvoiceMethodOverride("") === null && parseInvoiceMethodOverride(undefined) === null);
  assertTrue("parseInvoiceMethodOverride: 0 / 9 / 'x' → null",
    parseInvoiceMethodOverride(0) === null && parseInvoiceMethodOverride(9) === null && parseInvoiceMethodOverride("x") === null);

  const noProv = methodForSubscription(map, null, 7);
  assertTrue("provider yok + override 7 → 7 (invoiceFrom null)", noProv.methodId === 7 && noProv.invoiceFrom === null);
  const noProvNoOv = methodForSubscription(map, null, null);
  assertTrue("provider yok + override yok → 1 (default)", noProvNoOv.methodId === 1 && noProvNoOv.source === "default");
  const unknown = methodForSubscription(map, "sepas", null);
  assertTrue("entegrasyonu olmayan provider → 1 (default)", unknown.methodId === 1 && unknown.source === "default");
}

// ── 2) Dispatcher × bayrak ───────────────────────────────────────
console.log("\n── 2) Dispatcher: bayrak m7'nin gerçek motoruna, fallback'lere değil ──");
{
  const D = 1.182457;
  const U1 = 0.656008;
  const base = (over: Partial<MethodInvoiceInput>): MethodInvoiceInput => ({
    totalConsumptionKwh: 0,
    unitPriceEnergy: 3.2,
    unitPriceDistribution: D,
    btvRate: 0.01,
    vatRate: 0.2,
    tariffType: "single",
    contractPowerKw: 0,
    monthFinalDemandKw: 0,
    powerPrice: 0,
    powerExcessPrice: 0,
    reactivePenaltyCharge: 0,
    perakendeEnerjiBedeli: 2.909687,
    ...over,
  });
  // 10128583 Eylül (Meram fixture) büyüklükleri — G ≥ C → D/2.
  const C = 177896.25;
  const G = 416571.75;
  const mi: InvoiceMethodInputs = {
    sumCn: C,
    sumGn: 2248.9545,
    sumPos: 175647.2955,
    sumMahsup: 2248.9545,
    sumExcess: 0,
    wPos: 3.111543,
    wMahsup: 2.35,
    kbk: 0.952,
    tahminiYekdem: 0.58114,
    prevSumPos: null,
    prevTahminiYekdem: null,
    prevGerceklesenYekdem: null,
    mahsuplasmaUnitPrice: null,
    meram: {
      ownGnTotal: G,
      trafoKaybiSaatlik: 0,
      trafoKaybiKwh: 0,
      unitPriceAdjustment: 0,
      yekdemIsFinal: false,
      gddk: 0,
    },
  };
  const flag = { dagitimKendiVeris: { ownGnKwh: 1, ureticiBirim: U1 } }; // ownGnKwh m7'de KULLANILMAZ
  const inp = base({ totalConsumptionKwh: C, methodInputs: mi, ...flag });
  const plain = base({ totalConsumptionKwh: C, methodInputs: mi });

  const m7 = calculateInvoiceForMethod(7, inp);
  const kv = hesaplaDagitimKendiVeris({ cKwh: C, gKwh: G, dagitimBedeli: D, ureticiBirim: U1 });
  assertTrue("m7 + bayrak → dagitimKendiVeris bloğu", m7.dagitimKendiVeris != null);
  assertClose("m7 MEDAŞ = (G − C) × uretici_1 (G = meram.ownGnTotal)", m7.dagitimKendiVeris?.medasBedeli ?? NaN, kv.medasBedeli, 0);
  assertClose("m7 dağıtım = helper (D/2)", m7.distributionCharge, kv.dagitimTutari, 0);
  assertClose("m7 dağıtım birimi = 0,591229", m7.effectiveDistributionUnitPrice, 0.591229, 0);
  const m7plain = calculateInvoiceForMethod(7, plain);
  assertTrue("m7 bayraksız: blok yok, dağıtım/toplam aynı",
    m7plain.dagitimKendiVeris === undefined &&
      m7plain.distributionCharge === m7.distributionCharge &&
      m7plain.totalInvoice === m7.totalInvoice);
  assertTrue("m7 bayrak toplamı değiştirmez (MEDAŞ ayrı fatura)", m7.subtotalBeforeVat === m7plain.subtotalBeforeVat);

  // m7'nin m1 fallback'leri bayraktan bağımsız (bayrak girişte silinir).
  const lis = calculateInvoiceForMethod(7, { ...inp, lisansliSatis: true, totalProductionKwh: G });
  const lisPlain = calculateInvoiceForMethod(7, { ...plain, lisansliSatis: true, totalProductionKwh: G });
  assertTrue("m7 lisanslı → m1 yönlendirmesi: bayraktan bağımsız", JSON.stringify(lis) === JSON.stringify(lisPlain) && lis.dagitimKendiVeris === undefined);
  const noMi = calculateInvoiceForMethod(7, { ...inp, methodInputs: undefined });
  const noMiPlain = calculateInvoiceForMethod(7, { ...plain, methodInputs: undefined });
  assertTrue("m7 methodInputs yok → m1 fallback: bayraktan bağımsız", JSON.stringify(noMi) === JSON.stringify(noMiPlain) && noMi.dagitimKendiVeris === undefined);
  const miNoMeram = { ...mi, meram: undefined };
  const noMeram = calculateInvoiceForMethod(7, { ...inp, methodInputs: miNoMeram });
  const noMeramPlain = calculateInvoiceForMethod(7, { ...plain, methodInputs: miNoMeram });
  assertTrue("m7 meram yok → m1 fallback: bayraktan bağımsız", JSON.stringify(noMeram) === JSON.stringify(noMeramPlain) && noMeram.dagitimKendiVeris === undefined);

  // m2/m3/m5 (net) + m4/m6 bayraktan bağımsız.
  const miNet = { ...mi, meram: undefined };
  for (const m of [2, 3, 5] as const) {
    const a = calculateInvoiceForMethod(m, { ...inp, methodInputs: miNet });
    const b = calculateInvoiceForMethod(m, { ...plain, methodInputs: miNet });
    assertTrue(`m${m}: bayraktan bağımsız`, JSON.stringify(a) === JSON.stringify(b) && a.dagitimKendiVeris === undefined);
  }
  for (const m of [4, 6] as const) {
    const a = calculateInvoiceForMethod(m, inp);
    const b = calculateInvoiceForMethod(m, plain);
    assertTrue(`m${m}: bayraktan bağımsız`, JSON.stringify(a) === JSON.stringify(b) && a.dagitimKendiVeris === undefined);
  }
  const m1 = calculateInvoiceForMethod(1, base({ totalConsumptionKwh: C, ...{ dagitimKendiVeris: { ownGnKwh: G, ureticiBirim: U1 } } }));
  assertTrue("m1 + bayrak → blok (mevcut davranış)", m1.dagitimKendiVeris != null);
}

console.warn = origWarn;
console.log(failures === 0 ? "\nTÜM KONTROLLER GEÇTİ ✅" : `\n❌ ${failures} kontrol başarısız`);
process.exit(failures === 0 ? 0 : 1);
