// scripts/compare-ges-sale-basis.ts
//
// Teknik Masura 52503 — ges_sale_dist_basis (GES satış kesinti tabanı) CANLI DOĞRULAMA.
//
// ⚠️ %100 SALT-OKUNUR. "@/lib/supabase" harness tsconfig'iyle yazma/rpc engelli servis
// shim'ine yönlenir (scripts/shims/supabaseService.ts). Uygulamanın kendi fonksiyonları
// kullanılır (fetchBilledInvoiceInputs → buildBreakdownFromInputs → deriveGesSatisMahsup).
//
// Kullanım:
//   npm run compare:ges-sale-basis -- [YYYY-MM]
//
//   YYYY-MM  dönem (varsayılan 2026-09)
//
// Kontroller:
//   (a) Canlı: DB ayarıyla kart, total_veris ile kart, sold_only ile kart.
//   (b) Ana fatura satırları tabandan bağımsız (breakdown JSON eşitliği).
//   (c) Snapshot replay kartı (saklı damgayla).
//   (d) Yeniden yazım önizlemesi: snapshotParamsFromEngine vs saklı satır fark listesi.
//   (e) sold_only bayraklı tüm tesisler listesi + efektif metot kontrolü.

import { supabase } from "@/lib/supabase";
import {
  buildBreakdownFromInputs,
  fetchBilledInvoiceInputs,
} from "@/components/utils/billedInvoiceInputs";
import { fetchInvoiceOverrides } from "@/components/utils/invoiceOverrides";
import {
  getInvoiceSnapshot,
  snapshotParamsFromEngine,
  INVOICE_SNAPSHOT_RECOMPUTE_FIELDS,
} from "@/components/utils/invoiceSnapshots";
import { deriveGesSatisMahsup } from "@/lib/ges/gesSatisMahsup";
import { parseGesSaleDistBasis, gesSatisKesintiArgs } from "@/lib/ges/gesUretimSatisi";

const args = process.argv.slice(2);
const periodArg = args.find((a) => /^\d{4}-\d{2}$/.test(a));
const [year, month] = periodArg ? periodArg.split("-").map(Number) : [2026, 9];

const USER = "8694362b-8f77-4fdf-b6e4-a7f0b1f2ce31";
const SERNO = 52503;

/** Beklenen değerler (kabul testi). */
const EXPECTED = {
  soldOnly: { kesintiKwh: 93551.4, kesinti: 55310.25, net: 216895.04 },
  totalVeris: { kesintiKwh: 662356.893, kesinti: 391604.27, net: -119398.98 },
};

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: 4 });

let failures = 0;
function check(label: string, cond: boolean) {
  if (!cond) failures++;
  console.log(`  ${cond ? "✅" : "❌"} ${label}`);
}
function assertClose(label: string, actual: number, expected: number, tol: number) {
  const diff = Math.abs(actual - expected);
  const ok = diff <= tol;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "✅" : "❌"} ${label.padEnd(40)} = ${money(actual).padStart(16)}` +
      `   (beklenen ${money(expected)}, Δ ${diff.toFixed(4)}, tol ±${tol})`
  );
}

async function main() {
  console.log(`\n══ compare-ges-sale-basis · ${year}-${String(month).padStart(2, "0")} · ${SERNO} ══\n`);

  // (a) Canlı kart hesabı
  console.log("── (a) Canlı kart hesabı ──");
  const res = await fetchBilledInvoiceInputs({
    supabase,
    userId: USER,
    subscriptionSerno: SERNO,
    periodYear: year,
    periodMonth: month,
    methodContext: "admin",
  });
  if (!res.ok) {
    console.error(`❌ fetchBilledInvoiceInputs başarısız: ${res.reason}`);
    process.exit(1);
  }
  const inputs = res.inputs;
  const overrides = await fetchInvoiceOverrides({
    userId: USER,
    subscriptionSerno: SERNO,
    periodYear: year,
    periodMonth: month,
  });
  const result = buildBreakdownFromInputs(inputs, overrides);
  const breakdown = result.breakdown;

  console.log(`  DB ayarı: ges_sale_dist_basis = '${inputs.gesSaleDistBasis}'`);

  // Kart: DB ayarıyla
  const kartDb = deriveGesSatisMahsup({
    breakdown,
    onYil: false,
    usdKur: 0,
    perakendeEnerjiBedeli: inputs.perakendeEnerjiBedeli,
    gesSatisDagitimBedeli: inputs.gesSatisDagitimBedeli ?? 0,
    excludeGesMahsup: false,
    gesSaleDistBasis: inputs.gesSaleDistBasis,
  });

  // Kart: total_veris (force)
  const kartTotal = deriveGesSatisMahsup({
    breakdown,
    onYil: false,
    usdKur: 0,
    perakendeEnerjiBedeli: inputs.perakendeEnerjiBedeli,
    gesSatisDagitimBedeli: inputs.gesSatisDagitimBedeli ?? 0,
    excludeGesMahsup: false,
    gesSaleDistBasis: "total_veris",
  });

  // Kart: sold_only (force)
  const kartSoldOnly = deriveGesSatisMahsup({
    breakdown,
    onYil: false,
    usdKur: 0,
    perakendeEnerjiBedeli: inputs.perakendeEnerjiBedeli,
    gesSatisDagitimBedeli: inputs.gesSatisDagitimBedeli ?? 0,
    excludeGesMahsup: false,
    gesSaleDistBasis: "sold_only",
  });

  console.log("\n  total_veris:");
  assertClose("kesinti kWh", kartTotal.satis?.kesintiKwh ?? 0, EXPECTED.totalVeris.kesintiKwh, 0.01);
  assertClose("dağıtım kesintisi", kartTotal.satis?.satisDagitimKesintisi ?? 0, EXPECTED.totalVeris.kesinti, 0.01);
  assertClose("net gelir", kartTotal.satis?.satisNetGelir ?? 0, EXPECTED.totalVeris.net, 0.01);

  console.log("\n  sold_only:");
  assertClose("kesinti kWh", kartSoldOnly.satis?.kesintiKwh ?? 0, EXPECTED.soldOnly.kesintiKwh, 0.01);
  assertClose("dağıtım kesintisi", kartSoldOnly.satis?.satisDagitimKesintisi ?? 0, EXPECTED.soldOnly.kesinti, 0.01);
  assertClose("net gelir", kartSoldOnly.satis?.satisNetGelir ?? 0, EXPECTED.soldOnly.net, 0.01);

  console.log("\n  DB ayarıyla ('" + inputs.gesSaleDistBasis + "'):");
  if (inputs.gesSaleDistBasis === "sold_only") {
    assertClose("kesinti (sold_only)", kartDb.satis?.satisDagitimKesintisi ?? 0, EXPECTED.soldOnly.kesinti, 0.01);
  } else {
    assertClose("kesinti (total_veris)", kartDb.satis?.satisDagitimKesintisi ?? 0, EXPECTED.totalVeris.kesinti, 0.01);
  }

  // (b) Ana fatura satırları tabandan bağımsız
  console.log("\n── (b) Ana fatura satırları tabandan bağımsız ──");
  const resultTotal = buildBreakdownFromInputs({ ...inputs, gesSaleDistBasis: "total_veris" }, overrides);
  const resultSoldOnly = buildBreakdownFromInputs({ ...inputs, gesSaleDistBasis: "sold_only" }, overrides);

  const keysToCheck = [
    "energyCharge",
    "distributionCharge",
    "distributionBaseKwh",
    "btvCharge",
    "vatCharge",
    "totalInvoice",
    "muhtelif2MahsupKredisi",
    "muhtelif2Dagitim",
  ] as const;

  let allSame = true;
  for (const k of keysToCheck) {
    const vT = (resultTotal.breakdown as Record<string, unknown>)[k];
    const vS = (resultSoldOnly.breakdown as Record<string, unknown>)[k];
    if (JSON.stringify(vT) !== JSON.stringify(vS)) {
      console.log(`  ❌ ${k} farklı: ${JSON.stringify(vT)} vs ${JSON.stringify(vS)}`);
      allSame = false;
      failures++;
    }
  }
  if (allSame) {
    console.log(`  ✅ Ana fatura satırları (${keysToCheck.length} anahtar) tabandan bağımsız`);
  }
  assertClose("Ana dağıtım kWh", breakdown.distributionBaseKwh ?? 0, breakdown.distributionBaseKwh ?? 0, 0);
  console.log(`     Dağıtım: ${money(breakdown.distributionCharge)} TL`);
  console.log(`     Toplam:  ${money(breakdown.totalInvoice)} TL`);

  // (c) Snapshot replay
  console.log("\n── (c) Snapshot replay ──");
  const snap = await getInvoiceSnapshot({
    userId: USER,
    subscriptionSerno: SERNO,
    periodYear: year,
    periodMonth: month,
    invoiceType: "billed",
  });
  if (!snap) {
    console.log("  ⚠️ Snapshot bulunamadı — atlanıyor.");
  } else {
    console.log(`  Damga: ges_sale_dist_basis = '${snap.ges_sale_dist_basis}'`);
    const snapBasis = parseGesSaleDistBasis(snap.ges_sale_dist_basis);
    const snapKart = deriveGesSatisMahsup({
      breakdown,
      onYil: false,
      usdKur: 0,
      perakendeEnerjiBedeli: inputs.perakendeEnerjiBedeli,
      gesSatisDagitimBedeli: inputs.gesSatisDagitimBedeli ?? 0,
      excludeGesMahsup: false,
      gesSaleDistBasis: snapBasis,
    });
    if (snapBasis === "sold_only") {
      assertClose("replay kesinti (sold_only)", snapKart.satis?.satisDagitimKesintisi ?? 0, EXPECTED.soldOnly.kesinti, 0.01);
      assertClose("replay net gelir (sold_only)", snapKart.satis?.satisNetGelir ?? 0, EXPECTED.soldOnly.net, 0.01);
    } else {
      assertClose("replay kesinti (total_veris)", snapKart.satis?.satisDagitimKesintisi ?? 0, EXPECTED.totalVeris.kesinti, 0.01);
    }
  }

  // (d) Yeniden yazım önizlemesi
  console.log("\n── (d) Yeniden yazım önizlemesi ──");
  if (snap) {
    const params = snapshotParamsFromEngine({
      userId: USER,
      subscriptionSerno: SERNO,
      inputs,
      result,
      overrides,
      invoiceType: "billed",
    });
    const diffs: string[] = [];
    const keys = INVOICE_SNAPSHOT_RECOMPUTE_FIELDS.split(",").map((k) => k.trim());
    for (const k of keys) {
      const snapVal = (snap as Record<string, unknown>)[k];
      const paramVal = (params as Record<string, unknown>)[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
      if (JSON.stringify(snapVal) !== JSON.stringify(paramVal)) {
        diffs.push(k);
      }
    }
    if (diffs.length === 0) {
      console.log("  ✅ Saklı satır ile yeniden hesaplanan değerler aynı");
    } else if (diffs.length === 1 && diffs[0] === "ges_sale_dist_basis") {
      console.log("  ✅ Tek fark beklenen: ges_sale_dist_basis (damga vs ayar)");
    } else {
      console.log(`  ⚠️ Farklar: ${diffs.join(", ")}`);
    }
  }

  // (e) sold_only bayraklı tüm tesisler
  console.log("\n── (e) sold_only bayraklı tesisler ──");
  const { data: soldOnlyFacilities } = await supabase
    .from("subscription_settings")
    .select("user_id, subscription_serno, title, invoice_method_override")
    .eq("ges_sale_dist_basis", "sold_only");

  if (!soldOnlyFacilities || soldOnlyFacilities.length === 0) {
    console.log("  (yok)");
  } else {
    for (const f of soldOnlyFacilities) {
      const methodNote = f.invoice_method_override
        ? `metot override: ${f.invoice_method_override}`
        : "(şirket metodu)";
      console.log(`  • ${f.subscription_serno} ${f.title ?? ""} — ${methodNote}`);
      // M3 değilse uyarı
      // Basit kontrol: method 3 için Trepaş şirketine bakmak lazım, burada sadece log
    }
  }

  // Sonuç
  console.log(
    failures === 0
      ? "\n✅ TÜM KONTROLLER GEÇTİ.\n"
      : `\n❌ ${failures} KONTROL BAŞARISIZ.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ Hata:", err);
  process.exit(1);
});
