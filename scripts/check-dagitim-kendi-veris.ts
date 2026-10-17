// scripts/check-dagitim-kendi-veris.ts
//
// Metot 1 "DAĞITIM KENDİ VERİŞİYLE" (MEPAŞ/MEDAŞ usulü) kabul testleri — AS İnşaat.
//   npm run check:dagitim-kv
//
// SORGU YOK. Dispatcher/snapshot modülleri "@/lib/supabase" import ettiği için betik
// scripts/tsconfig.harness.json ile çalışır (salt-okunur shim; yalnız .env okunur,
// hiçbir istek atılmaz).
//
// Kapsam: golden 4 satır (kuruş), half-up/epsilon tuzağı, kenar durumlar, override'lar,
// lisanslı, Kayseri önceliği, trafo önceliği (720/744/to-date), bayrak kapalı → birebir,
// dispatcher m2–m8 yok sayar, GES satış MEDAŞ kesintisi, snapshot payload/replay/guard.

import {
  hesaplaDagitimKendiVeris,
  roundHalfUp,
} from "../src/components/utils/dagitimKendiVeris";
import { calculateInvoice, type InvoiceInput } from "../src/components/utils/calculateInvoice";
import { resolveTrafoKwh } from "../src/components/utils/trafoKaybi";
import {
  calculateGesUretimSatisi,
  gesSatisKesintiArgs,
  type MedasKesinti,
} from "../src/lib/ges/gesUretimSatisi";
import { calculateInvoiceForMethod, type InvoiceMethodId } from "../src/lib/invoiceMethods";
import {
  buildInvoiceSnapshotPayload,
  buildSnapshotBreakdown,
  snapshotParamsFromEngine,
} from "../src/components/utils/invoiceSnapshots";

// ── Harness ─────────────────────────────────────────────────────
let failures = 0;
const money = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
function assertClose(label: string, actual: number, expected: number, tol: number) {
  const diff = Math.abs(actual - expected);
  const ok = diff <= tol;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "✅" : "❌"} ${label.padEnd(44)} = ${money(actual).padStart(16)}   (beklenen ${money(expected)}, Δ ${diff.toFixed(6)}, tol ±${tol})`
  );
}
function assertTrue(label: string, cond: boolean) {
  if (!cond) failures++;
  console.log(`  ${cond ? "✅" : "❌"} ${label}`);
}

const D = 1.182457; // OG / sanayi / tek terim dagitim_bedeli
const U = 0.656008; // dagitim_uretici_1

const baseInput = (over: Partial<InvoiceInput>): InvoiceInput => ({
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
  ...over,
});

// ── 1) Half-up / epsilon ────────────────────────────────────────
console.log("\n── 1) roundHalfUp (epsilon-güvenli) ──");
assertClose("roundHalfUp(1.005, 2)", roundHalfUp(1.005, 2), 1.01, 0);
assertClose("roundHalfUp(2.675, 2)", roundHalfUp(2.675, 2), 2.68, 0);
assertClose("roundHalfUp(-1.005, 2)", roundHalfUp(-1.005, 2), -1.01, 0);
assertClose("roundHalfUp(0.5912285, 6)", roundHalfUp(0.5912285, 6), 0.591229, 0);
{
  // Gerçek float tuzağı: D×(C−C/2)/C bu C'de 0,59122849999999993 çıkar.
  const C = 1001.4248;
  const raw = (D * (C - C / 2)) / C;
  const naive = Math.round(raw * 1e6) / 1e6;
  assertTrue(`tuzak gerçek: raw ${raw.toPrecision(17)} < 0,5912285`, raw < 0.5912285);
  assertClose("naif Math.round → 0,591228 (hatalı)", naive, 0.591228, 0);
  const r = hesaplaDagitimKendiVeris({ cKwh: C, gKwh: C * 3, dagitimBedeli: D, ureticiBirim: U });
  assertClose("helper birimEff → 0,591229", r.birimEff, 0.591229, 0);
}

// ── 2) Golden — Eylül 2026 MEDAŞ faturaları ─────────────────────
console.log("\n── 2) Golden Eylül (MEDAŞ faturaları, kuruş) ──");
type Golden = {
  serno: string;
  cn: number;
  trafo: number;
  g: number;
  lisansli: boolean;
  birim: number;
  dagitim: number;
  medas: number;
};
const goldens: Golden[] = [
  { serno: "10128583", cn: 177896.2466, trafo: 0, g: 416571.75, lisansli: false, birim: 0.591229, dagitim: 105177.42, medas: 156573.04 },
  { serno: "10126953", cn: 39271.9224, trafo: 806.4, g: 4373.28, lisansli: false, birim: 1.117943, dagitim: 44805.28, medas: 0 },
  { serno: "9062757", cn: 12609.7242, trafo: 806.4, g: 0, lisansli: false, birim: 1.182457, dagitim: 15863.99, medas: 0 },
  { serno: "10124578", cn: 856.8084, trafo: 0, g: 181840.06, lisansli: true, birim: 0.591229, dagitim: 506.57, medas: 118726.46 },
];
for (const gd of goldens) {
  const C = gd.cn + gd.trafo;
  const h = hesaplaDagitimKendiVeris({ cKwh: C, gKwh: gd.g, dagitimBedeli: D, ureticiBirim: U });
  assertClose(`${gd.serno} helper birim_eff`, h.birimEff, gd.birim, 0);
  assertClose(`${gd.serno} helper dağıtım`, h.dagitimTutari, gd.dagitim, 0.001);
  assertClose(`${gd.serno} helper MEDAŞ (KDV hariç)`, h.medasBedeli, gd.medas, 0.001);
  assertClose(`${gd.serno} indirim = round2(C×D) − dağıtım`, h.indirimTutari, roundHalfUp(roundHalfUp(C * D, 2) - gd.dagitim, 2), 0);

  // Motor üzerinden: tüketim + trafo + kendi veriş (efektif/tahsisli üretim farklı olsa da).
  const b = calculateInvoice(
    baseInput({
      totalConsumptionKwh: gd.cn,
      trafoDegeri: gd.trafo,
      totalProductionKwh: gd.g * 0.37 + 12345, // tahsis/havuz değeri — dağıtıma GİRMEMELİ
      netPositiveDrawKwh: gd.cn * 0.4,
      netExcessFeedKwh: 5000,
      lisansliSatis: gd.lisansli,
      dagitimKendiVeris: { ownGnKwh: gd.g, ureticiBirim: U },
    })
  );
  assertClose(`${gd.serno} motor distributionCharge`, b.distributionCharge, gd.dagitim, 0.001);
  assertClose(`${gd.serno} motor effectiveDistributionUnitPrice`, b.effectiveDistributionUnitPrice, gd.birim, 0);
  assertClose(`${gd.serno} motor distributionChargeKwh = C`, b.distributionChargeKwh, C, 1e-9);
  assertClose(`${gd.serno} motor medasBedeli`, b.dagitimKendiVeris?.medasBedeli ?? NaN, gd.medas, 0.001);
  // MEDAŞ tutarı perakende toplamına GİRMEZ.
  const expectedSubtotal =
    b.energyCharge + b.trafoCharge + b.distributionCharge + b.btvCharge + b.powerTotalCharge +
    b.reactivePenaltyCharge - b.verisMahsupBedeli;
  assertClose(`${gd.serno} subtotal MEDAŞ'sız`, b.subtotalBeforeVat, expectedSubtotal, 1e-6);
}
assertClose("MEDAŞ kWh 10128583 = G − C", hesaplaDagitimKendiVeris({ cKwh: 177896.2466, gKwh: 416571.75, dagitimBedeli: D, ureticiBirim: U }).medasKwh, 238675.5034, 1e-6);

// ── 3) Kenar durumlar ───────────────────────────────────────────
console.log("\n── 3) Kenar durumlar ──");
{
  const eq = hesaplaDagitimKendiVeris({ cKwh: 5000, gKwh: 5000, dagitimBedeli: D, ureticiBirim: U });
  assertClose("G = C → birim D/2 (half-up)", eq.birimEff, 0.591229, 0);
  assertClose("G = C → MEDAŞ 0", eq.medasBedeli, 0, 0);
  const g0 = hesaplaDagitimKendiVeris({ cKwh: 5000, gKwh: 0, dagitimBedeli: D, ureticiBirim: U });
  assertClose("G = 0 → birim D", g0.birimEff, D, 0);
  assertClose("G = 0 → dağıtım round2(C×D)", g0.dagitimTutari, roundHalfUp(5000 * D, 2), 0);
  assertClose("G = 0 → indirim 0", g0.indirimTutari, 0, 0);
  const c0 = hesaplaDagitimKendiVeris({ cKwh: 0, gKwh: 1000, dagitimBedeli: D, ureticiBirim: U });
  assertClose("C = 0 → birim 0", c0.birimEff, 0, 0);
  assertClose("C = 0 → dağıtım 0", c0.dagitimTutari, 0, 0);
  assertClose("C = 0 → MEDAŞ kWh = G", c0.medasKwh, 1000, 0);
  assertClose("C = 0 → MEDAŞ = round2(G×u)", c0.medasBedeli, roundHalfUp(1000 * U, 2), 0);
  const neg = hesaplaDagitimKendiVeris({ cKwh: -5, gKwh: Number.NaN, dagitimBedeli: D, ureticiBirim: U });
  assertTrue("negatif/NaN girdiler 0'a kırpılır", neg.birimEff === 0 && neg.medasKwh === 0 && neg.dagitimTutari === 0);
}

// ── 4) Override, Kayseri, lisanslı ──────────────────────────────
console.log("\n── 4) Override / Kayseri / lisanslı ──");
{
  const inp = baseInput({
    totalConsumptionKwh: 10000,
    trafoDegeri: 806.4,
    dagitimKendiVeris: { ownGnKwh: 4000, ureticiBirim: U },
  });
  const C = 10806.4;
  const ovUnit = calculateInvoice(inp, {
    dagitim: { isExcluded: false, unitPriceOverride: 1.0, amountOverride: null, payload: null, note: null },
  });
  assertClose("dagitim birim override → D = 1,0", ovUnit.effectiveDistributionUnitPrice, roundHalfUp((1.0 * (C - 2000)) / C, 6), 0);
  const ovAmt = calculateInvoice(inp, {
    dagitim: { isExcluded: false, unitPriceOverride: null, amountOverride: 123, payload: null, note: null },
  });
  assertClose("dagitim tutar override → 123", ovAmt.distributionCharge, 123, 0);
  assertTrue("tutar override'da blok doğal tutarı korur", (ovAmt.dagitimKendiVeris?.dagitimTutari ?? 0) > 123);
  const ovEx = calculateInvoice(inp, {
    dagitim: { isExcluded: true, unitPriceOverride: null, amountOverride: null, payload: null, note: null },
  });
  assertClose("dagitim hariç → 0", ovEx.distributionCharge, 0, 0);

  const kay = calculateInvoice({ ...inp, excludeDistributionCharge: true });
  assertClose("Kayseri önceliği: dağıtım 0", kay.distributionCharge, 0, 0);
  assertTrue("Kayseri'de dagitimKendiVeris bloğu YOK", kay.dagitimKendiVeris === undefined);

  const lisFlag = calculateInvoice({ ...inp, lisansliSatis: true });
  assertClose("lisanslı + bayrak: taban trafo DAHİL", lisFlag.distributionBaseKwh, C, 1e-9);
  assertTrue("lisanslı + bayrak: yarılanma var (birim < D)", lisFlag.effectiveDistributionUnitPrice < D);
  const lisNoFlag = calculateInvoice({ ...inp, lisansliSatis: true, dagitimKendiVeris: undefined });
  assertClose("lisanslı bayraksız: taban trafo HARİÇ (eski)", lisNoFlag.distributionBaseKwh, 10000, 0);
  assertClose("lisanslı bayraksız: D × tüketim (eski)", lisNoFlag.distributionCharge, D * 10000, 1e-9);
  assertClose("bayrak enerji/BTV'yi değiştirmez (energy)", lisFlag.energyCharge, lisNoFlag.energyCharge, 0);
  assertClose("bayrak enerji/BTV'yi değiştirmez (btv)", lisFlag.btvCharge, lisNoFlag.btvCharge, 0);
  assertClose("bayrak veriş fazlası kWh'ı değiştirmez", lisFlag.verisFazlaKwh, lisNoFlag.verisFazlaKwh, 0);
}

// ── 5) Trafo önceliği ───────────────────────────────────────────
console.log("\n── 5) Trafo: trafo_kaybi_saatlik > trafo_degeri ──");
{
  const NOW = Date.parse("2026-10-11T09:00:00Z");
  const sep = resolveTrafoKwh({
    trafoKaybiSaatlik: 1.12,
    trafoDegeri: 806,
    startIso: "2026-08-31T21:00:00.000Z",
    endIso: "2026-09-30T21:00:00.000Z",
    lastTs: "2026-09-30T20:00:00.000Z",
    nowMs: NOW,
  });
  assertClose("Eylül 1,12 × 720 = 806,4", sep.trafoKwh, 806.4, 0);
  assertClose("Eylül saat = 720", sep.saat, 720, 0);
  const aug = resolveTrafoKwh({
    trafoKaybiSaatlik: 1.12,
    trafoDegeri: 833,
    startIso: "2026-07-31T21:00:00.000Z",
    endIso: "2026-08-31T21:00:00.000Z",
    lastTs: "2026-08-25T00:00:00.000Z", // eksik saatler trafoyu azaltmaz (tam ay)
    nowMs: NOW,
  });
  assertClose("Ağustos 1,12 × 744 = 833,28", aug.trafoKwh, 833.28, 0);
  // To-date: 01.10 00:00 TR → cutoff 10.10 23:00 TR (dahil); son veri 10.10 13:00 TR;
  // now 10.10 15:00 TR → ızgara 10.10 14:00'te kapanır → 9×24 + 14 = 230 saat.
  const td = resolveTrafoKwh({
    trafoKaybiSaatlik: 1.12,
    trafoDegeri: 806,
    startIso: "2026-09-30T21:00:00.000Z",
    endIso: "2026-10-10T20:00:00.000Z",
    endInclusive: true,
    lastTs: "2026-10-10T10:00:00.000Z",
    nowMs: Date.parse("2026-10-10T12:00:00Z"),
  });
  assertClose("to-date saat = 230", td.saat, 230, 0);
  assertClose("to-date 1,12 × 230 = 257,6", td.trafoKwh, 257.6, 0);
  const noT = resolveTrafoKwh({
    trafoKaybiSaatlik: null,
    trafoDegeri: 806,
    startIso: "2026-08-31T21:00:00.000Z",
    endIso: "2026-09-30T21:00:00.000Z",
    lastTs: null,
    nowMs: NOW,
  });
  assertClose("t yok → trafo_degeri aynen (806)", noT.trafoKwh, 806, 0);
  assertTrue("t yok → saatlik null", noT.saatlik === null);
  const none = resolveTrafoKwh({
    trafoKaybiSaatlik: 0,
    trafoDegeri: null,
    startIso: "2026-08-31T21:00:00.000Z",
    endIso: "2026-09-30T21:00:00.000Z",
    lastTs: null,
    nowMs: NOW,
  });
  assertClose("ikisi de yok → 0", none.trafoKwh, 0, 0);
}

// ── 6) Bayrak kapalı → bugünkü m1 birebir ───────────────────────
console.log("\n── 6) Bayrak kapalı → mevcut m1 çıktısı birebir ──");
{
  const cases: Array<[string, InvoiceInput]> = [
    ["F4 (100k kWh, çift terim)", baseInput({ totalConsumptionKwh: 100000, tariffType: "dual", contractPowerKw: 500, monthFinalDemandKw: 600, powerPrice: 50, powerExcessPrice: 100 })],
    ["net üretici (saatlik net)", baseInput({ totalConsumptionKwh: 20000, trafoDegeri: 500, totalProductionKwh: 50000, netPositiveDrawKwh: 8000, netExcessFeedKwh: 38000 })],
    ["net tüketici (aylık)", baseInput({ totalConsumptionKwh: 20000, trafoDegeri: 500, totalProductionKwh: 5000 })],
    ["lisanslı", baseInput({ totalConsumptionKwh: 900, trafoDegeri: 100, totalProductionKwh: 180000, lisansliSatis: true, onYil: true, usdKur: 48.49 })],
    ["2K tavan", baseInput({ totalConsumptionKwh: 20000, totalProductionKwh: 15000, netPositiveDrawKwh: 9000, netExcessFeedKwh: 4000, perakendeEnerjiBedeli: 2.5, applyVerisMahsupPerakendeCap: true })],
  ];
  for (const [label, inp] of cases) {
    const a = calculateInvoice(inp);
    const b = calculateInvoice({ ...inp, dagitimKendiVeris: undefined });
    assertTrue(`${label}: JSON birebir + blok yok`, JSON.stringify(a) === JSON.stringify(b) && a.dagitimKendiVeris === undefined);
  }
  assertClose("F4 distributionCharge (golden 118245,7)", calculateInvoice(cases[0][1]).distributionCharge, 118245.7, 1e-6);
  const np = calculateInvoice(cases[1][1]);
  assertClose("net üretici: (C+t)·D/2 (eski formül)", np.distributionCharge, (20500 * D) / 2, 1e-6);
}

// ── 7) Dispatcher: bayrak yalnız Metot 1 ────────────────────────
console.log("\n── 7) Dispatcher: m2–m8 bayrağı yok sayar ──");
{
  const inp = baseInput({
    totalConsumptionKwh: 12000,
    trafoDegeri: 300,
    totalProductionKwh: 30000,
    lisansliSatis: true, // m2/3/5/7/8 → m1 yönlendirmesi (yine de bayrak SİLİNMELİ)
    dagitimKendiVeris: { ownGnKwh: 30000, ureticiBirim: U },
  });
  const plain = { ...inp, dagitimKendiVeris: undefined };
  for (const m of [2, 3, 4, 5, 6, 7, 8] as InvoiceMethodId[]) {
    const a = calculateInvoiceForMethod(m, inp);
    const b = calculateInvoiceForMethod(m, plain);
    assertTrue(`m${m}: çıktı bayraktan bağımsız`, JSON.stringify(a) === JSON.stringify(b) && a.dagitimKendiVeris === undefined);
  }
  // Lisanssız + methodInputs yok → net metotlar m1'e DÜŞER (fallback); bayrak yine silinmeli.
  const origWarn = console.warn;
  console.warn = () => {};
  for (const m of [2, 3, 5, 7] as InvoiceMethodId[]) {
    const a = calculateInvoiceForMethod(m, { ...inp, lisansliSatis: false });
    const b = calculateInvoiceForMethod(m, { ...plain, lisansliSatis: false });
    assertTrue(`m${m} (lisanssız, m1 fallback): bayraktan bağımsız`, JSON.stringify(a) === JSON.stringify(b) && a.dagitimKendiVeris === undefined);
  }
  console.warn = origWarn;
  const m1 = calculateInvoiceForMethod(1, inp);
  assertTrue("m1: bayrak uygulanır (blok var)", m1.dagitimKendiVeris !== undefined);
}

// ── 8) GES satış kartı — MEDAŞ kesintisi ────────────────────────
console.log("\n── 8) GES satış: MEDAŞ kesintisi ──");
{
  const base = { satisKwh: 200000, onYil: false, usdKur: 0, perakendeEnerjiBedeli: 2.5, dagitimBedeli: U };
  const old = calculateGesUretimSatisi(base);
  assertClose("eski: kesinti = satış × oran", old.satisDagitimKesintisi, 200000 * U, 1e-6);
  assertTrue("eski: medasKesinti/kesintiKwh anahtarı yok", !("medasKesinti" in old) && !("kesintiKwh" in old));
  const medas: MedasKesinti = {
    tutar: 156750.75,
    satirlar: [{ serno: 10128583, label: "Tesis 10128583", kwh: 238946.4, birim: U, bedeli: 156750.75 }],
  };
  const neu = calculateGesUretimSatisi({ ...base, medasKesinti: medas });
  assertClose("MEDAŞ: kesinti = Σ veriş faturaları", neu.satisDagitimKesintisi, 156750.75, 0);
  assertClose("MEDAŞ: net = brüt − kesinti", neu.satisNetGelir, neu.satisBrutGelir - 156750.75, 1e-9);
  const tredasBd = { tredasGesDagitim: { kwh: 1000, birim: 0.5 } };
  const argsOld = gesSatisKesintiArgs(tredasBd, U);
  assertTrue("Trepaş yolu değişmedi", argsOld.kesintiKwh === 1000 && argsOld.dagitimBedeli === 0.5 && argsOld.medasKesinti === undefined);
  const argsMedas = gesSatisKesintiArgs({}, U, medas);
  assertTrue("MEDAŞ args: oran + medasKesinti", argsMedas.dagitimBedeli === U && argsMedas.medasKesinti === medas);
  const err = calculateGesUretimSatisi({ ...base, medasKesinti: { tutar: 0, satirlar: [], hata: "x" } });
  assertTrue("hata: kesinti 0, oran kesintisine DÜŞMEZ", err.satisDagitimKesintisi === 0 && err.medasKesinti?.hata === "x");
}

// ── 9) Snapshot: payload / replay / guard ───────────────────────
console.log("\n── 9) Snapshot payload / replay / guard ──");
{
  const inp = baseInput({
    totalConsumptionKwh: 177896.2466,
    trafoDegeri: 0,
    totalProductionKwh: 200000,
    netPositiveDrawKwh: 60000,
    netExcessFeedKwh: 80000,
    dagitimKendiVeris: { ownGnKwh: 416571.75, ureticiBirim: U },
  });
  const bd = calculateInvoice(inp);
  const common = {
    userId: "u1",
    subscriptionSerno: 10128583,
    periodYear: 2026,
    periodMonth: 9,
    totalConsumptionKwh: inp.totalConsumptionKwh,
    unitPriceEnergy: inp.unitPriceEnergy,
    unitPriceDistribution: D,
    btvRate: inp.btvRate,
    vatRate: inp.vatRate,
    tariffType: inp.tariffType,
    contractPowerKw: 0,
    monthFinalDemandKw: 0,
    hasDemandData: false,
    powerPrice: 0,
    powerExcessPrice: 0,
    reactiveRiPercent: 0,
    reactiveRcPercent: 0,
    reactivePenaltyCharge: 0,
    hasYekdemMahsup: false,
    yekdemMahsup: 0,
    totalWithMahsup: bd.totalInvoice,
    trafoCharge: bd.trafoCharge,
    digerDegerler: 0,
    totalProductionKwh: 200000,
    netPositiveDrawKwh: 60000,
    netExcessFeedKwh: 80000,
    invoiceMethod: 1 as InvoiceMethodId,
    invoiceFrom: "meram",
  };
  const payload = buildInvoiceSnapshotPayload({
    ...common,
    breakdown: bd,
    trafoDegeri: 806.4,
    trafoKaybiSaatlik: 1.12,
    trafoKaybiKwh: 806.4,
  });
  assertTrue("payload: dagitim_kendi_veris = true", payload.dagitim_kendi_veris === true);
  assertClose("payload: medas_veris_bedeli", Number(payload.medas_veris_bedeli), 156573.04, 0.001);
  assertClose("payload: medas_veris_birim", Number(payload.medas_veris_birim), U, 0);
  assertClose("payload: own_gn_kwh = G", Number((payload as Record<string, unknown>).own_gn_kwh), 416571.75, 0);
  assertTrue(
    "payload: trafo_kaybi_* damgalı",
    (payload as Record<string, unknown>).trafo_kaybi_saatlik === 1.12 &&
      (payload as Record<string, unknown>).trafo_kaybi_kwh === 806.4
  );

  // Replay (trafo 0 ile yazılmış satır — golden C).
  const payload0 = buildInvoiceSnapshotPayload({ ...common, breakdown: bd, trafoDegeri: 0 });
  const replay = buildSnapshotBreakdown(payload0 as never);
  assertClose("replay distributionCharge = golden", replay.distributionCharge, 105177.42, 0.001);
  assertClose("replay medasBedeli", replay.dagitimKendiVeris?.medasBedeli ?? NaN, 156573.04, 0.001);
  assertTrue("payload0: trafo_kaybi_* anahtarı YOK", !("trafo_kaybi_saatlik" in payload0));

  const bdOff = calculateInvoice({ ...inp, dagitimKendiVeris: undefined });
  const payloadOff = buildInvoiceSnapshotPayload({ ...common, breakdown: bdOff, trafoDegeri: 0 });
  assertTrue(
    "bayraksız: dagitim_kendi_veris=false, medas null, own_gn_kwh anahtarı yok",
    payloadOff.dagitim_kendi_veris === false &&
      payloadOff.medas_veris_bedeli === null &&
      !("own_gn_kwh" in payloadOff)
  );
  const legacy = { ...payload0, dagitim_kendi_veris: null };
  const replayLegacy = buildSnapshotBreakdown(legacy as never);
  assertTrue(
    "eski satır (null) → eski m1 yolu",
    replayLegacy.dagitimKendiVeris === undefined &&
      JSON.stringify(replayLegacy) === JSON.stringify(calculateInvoice({ ...inp, dagitimKendiVeris: undefined }))
  );

  // snapshotParamsFromEngine uyuşmazlık guard'ı (Ağu 2026 10128583 hatası).
  const fakeInputs = {
    userId: "u1",
    subscriptionSerno: 10126953,
    periodYear: 2026,
    periodMonth: 8,
  } as never;
  const fakeResult = { breakdown: bd, riPercent: 0, rcPercent: 0 } as never;
  let threw = false;
  try {
    snapshotParamsFromEngine({ userId: "u1", subscriptionSerno: 10128583, inputs: fakeInputs, result: fakeResult, invoiceType: "billed" });
  } catch {
    threw = true;
  }
  assertTrue("snapshotParamsFromEngine: başka tesisin girdisi → throw", threw);
  let threwSame = false;
  try {
    snapshotParamsFromEngine({ userId: "u1", subscriptionSerno: 10126953, inputs: fakeInputs, result: fakeResult, invoiceType: "billed" });
  } catch {
    threwSame = true;
  }
  assertTrue("snapshotParamsFromEngine: eşleşen girdi → throw yok", !threwSame);
}

console.log(failures === 0 ? "\nTÜM KONTROLLER GEÇTİ ✅" : `\n❌ ${failures} kontrol başarısız`);
process.exit(failures === 0 ? 0 : 1);
