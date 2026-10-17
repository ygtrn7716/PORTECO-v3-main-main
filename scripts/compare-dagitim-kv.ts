// scripts/compare-dagitim-kv.ts
//
// AS İnşaat — Metot 1 "dağıtım kendi verişiyle" (MEDAŞ usulü) CANLI DOĞRULAMA.
//
// ⚠️ %100 SALT-OKUNUR. "@/lib/supabase" harness tsconfig'iyle yazma/rpc engelli servis
// shim'ine yönlenir (scripts/shims/supabaseService.ts). Uygulamanın kendi fonksiyonları
// kullanılır (fetchBilledInvoiceInputs → buildBreakdownFromInputs → loadMedasVerisKesintisi).
//
// Kullanım:
//   npm run compare:dagitim-kv -- [YYYY-MM ...] [--pending]
//
//   YYYY-MM    dönem(ler) (varsayılan 2026-08 ve 2026-09)
//   --pending  9062757 / 10126953 için trafo_kaybi_saatlik = 1,12 BELLEK İÇİNDE (deploy sonrası
//              girilecek değer): trafo = 1,12 × dönem saati, trafo_degeri yok sayılır. DB'ye yazmaz.
//
// Kontroller: C, G, birim_eff, dağıtım, MEDAŞ (beklenen tabloyla), bayrak açık/kapalı aynı canlı
// girdide enerji / tahsis / satış kWh'ının DEĞİŞMEDİĞİ, saklı snapshot'a göre fark, satış kartı
// host kesintisi (havuz p1 10126953 ve lisanslı 10124578).

import { supabase } from "@/lib/supabase";
import {
  buildBreakdownFromInputs,
  fetchBilledInvoiceInputs,
  type BilledInvoiceInputs,
} from "@/components/utils/billedInvoiceInputs";
import { fetchInvoiceOverrides } from "@/components/utils/invoiceOverrides";
import { getInvoiceSnapshot } from "@/components/utils/invoiceSnapshots";
import {
  loadMedasVerisKesintisi,
  medasHostKatkiFromBreakdown,
} from "@/lib/ges/medasVerisKesinti";
import { roundHalfUp } from "@/components/utils/dagitimKendiVeris";

const args = process.argv.slice(2);
const periods = args.filter((a) => /^\d{4}-\d{2}$/.test(a));
if (periods.length === 0) periods.push("2026-08", "2026-09");
const usePending = args.includes("--pending");

const USER = "77a8df85-41f9-4545-a16e-f3f53822be2c";
const SERNOS = [10128583, 10126953, 9062757, 10124578];
const PENDING_T: Record<number, number> = { 9062757: 1.12, 10126953: 1.12 };
/** Satış kartı tesisleri: havuz 2ba5ee2c p1 + lisanslı (atamasız plant). */
const HOSTS = [10126953, 10124578];

/** Beklenen (round6 birim; t = 1,12 varsayımı → --pending ile karşılaştır). */
const EXPECTED: Record<string, { dagitim: Record<number, number>; medas: Record<number, number> }> = {
  "2026-09": {
    dagitim: { 10128583: 105017.26, 10126953: 44780.3, 9062757: 15821.7, 10124578: 504.7 },
    medas: { 10128583: 156750.75, 10124578: 118728.53 },
  },
  "2026-08": {
    dagitim: { 10128583: 143484.54, 10126953: 51479.72, 9062757: 15482.29, 10124578: 468.39 },
    medas: { 10128583: 137706.58, 10124578: 131302.72 },
  },
};
/** Görev metnindeki tablo (yuvarlamasız birimle hesaplanmış) — yalnız referans. */
const SPEC_TABLE: Record<string, Record<number, number>> = {
  "2026-09": { 10128583: 105017.17, 10126953: 44780.31, 9062757: 15821.7, 10124578: 504.7 },
  "2026-08": { 10128583: 143484.42, 10126953: 51479.73, 9062757: 15482.29, 10124578: 468.39 },
};

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
const unit = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("tr-TR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function applyPending(inputs: BilledInvoiceInputs, serno: number, y: number, m: number): BilledInvoiceInputs {
  const t = PENDING_T[serno];
  if (!usePending || t == null || inputs.invoiceMethodId !== 1) return inputs;
  const hours = new Date(Date.UTC(y, m, 0)).getUTCDate() * 24; // TR'de DST yok
  const trafoKwh = Math.round(t * hours * 1e6) / 1e6;
  return { ...inputs, trafoDegeri: trafoKwh, trafoKaybiSaatlik: t, trafoKaybiKwh: trafoKwh };
}

async function main() {
  let fails = 0;
  for (const p of periods) {
    const [y, m] = p.split("-").map(Number);
    console.log(
      `\n=== AS İnşaat · Metot 1 dağıtım kendi verişiyle · ${p}${usePending ? " · t=1,12 bellek içinde (9062757, 10126953)" : ""} ===\n`
    );
    console.log(
      "serno      C (kWh)         G (kWh)         birim_eff   dağıtım        beklenen      Δ       spec(yuv.siz)  MEDAŞ          beklenen      saklı snap dağ.  enerji/tahsis/satış"
    );
    const flagOnBySerno = new Map<number, ReturnType<typeof buildBreakdownFromInputs>>();
    for (const serno of SERNOS) {
      const res = await fetchBilledInvoiceInputs({
        supabase,
        userId: USER,
        subscriptionSerno: serno,
        periodYear: y,
        periodMonth: m,
        methodContext: "admin",
      });
      if (!res.ok) {
        console.log(`${serno}  girdi yok: ${res.reason}`);
        continue;
      }
      const inputs = applyPending(res.inputs, serno, y, m);
      const overrides = await fetchInvoiceOverrides({
        userId: USER,
        subscriptionSerno: serno,
        periodYear: y,
        periodMonth: m,
      });
      const on = buildBreakdownFromInputs(inputs, overrides);
      const off = buildBreakdownFromInputs({ ...inputs, dagitimKendiVeris: null }, overrides);
      flagOnBySerno.set(serno, on);
      const kv = on.breakdown.dagitimKendiVeris;
      const exp = EXPECTED[p]?.dagitim[serno];
      const expM = EXPECTED[p]?.medas[serno] ?? 0;
      const d = on.breakdown.distributionCharge;
      const delta = exp != null ? roundHalfUp(d - exp, 2) : NaN;
      const same =
        on.breakdown.energyCharge === off.breakdown.energyCharge &&
        on.breakdown.netEnergyKwh === off.breakdown.netEnergyKwh &&
        on.breakdown.verisMahsupBedeli === off.breakdown.verisMahsupBedeli &&
        on.breakdown.verisFazlaKwh === off.breakdown.verisFazlaKwh &&
        on.breakdown.trafoCharge === off.breakdown.trafoCharge &&
        on.breakdown.btvCharge === off.breakdown.btvCharge;
      const snap = await getInvoiceSnapshot({
        userId: USER,
        subscriptionSerno: serno,
        periodYear: y,
        periodMonth: m,
        invoiceType: "billed",
      });
      const ok = !kv ? false : Math.abs(delta) <= 0.01 || !usePending;
      if (usePending && (!kv || Math.abs(delta) > 0.01 || Math.abs((kv?.medasBedeli ?? 0) - expM) > 0.01)) fails++;
      if (!same) fails++;
      console.log(
        [
          String(serno).padEnd(10),
          kwh(kv?.cKwh).padStart(14),
          kwh(kv?.gKwh).padStart(14),
          unit(kv?.birimEff).padStart(10),
          money(d).padStart(13),
          money(exp).padStart(13),
          (Number.isFinite(delta) ? delta.toFixed(2) : "—").padStart(7),
          money(SPEC_TABLE[p]?.[serno]).padStart(13),
          money(kv?.medasBedeli).padStart(13),
          money(expM).padStart(13),
          money(snap?.distribution_charge ?? null).padStart(15),
          same ? "  değişmedi ✓" : "  DEĞİŞTİ ✗",
          ok || !usePending ? "" : "  ✗",
        ].join(" ")
      );
      console.log(
        `           trafo ${kwh(inputs.trafoDegeri)} kWh${inputs.trafoKaybiSaatlik != null ? ` (t=${inputs.trafoKaybiSaatlik})` : " (trafo_degeri)"} · tahsis ${kwh(inputs.allocatedGesKwh)} · satış kWh ${kwh(on.breakdown.verisFazlaKwh)} · ödenecek ${money(on.totalWithMahsup)} (bayraksız ${money(off.totalWithMahsup)})`
      );
    }

    console.log("\n  Satış kartı host kesintisi (MEDAŞ veriş faturaları toplamı):");
    for (const host of HOSTS) {
      const on = flagOnBySerno.get(host);
      if (!on) continue;
      if (!(on.breakdown.verisFazlaKwh > 0)) {
        console.log(`  ${host}: satış kWh 0 → kart yok`);
        continue;
      }
      const k = await loadMedasVerisKesintisi({
        supabase,
        userId: USER,
        hostSerno: host,
        periodYear: y,
        periodMonth: m,
        prefer: "live",
        host: medasHostKatkiFromBreakdown(on.breakdown),
      });
      console.log(
        `  ${host}: satış ${kwh(on.breakdown.verisFazlaKwh)} kWh → kesinti ${money(k?.tutar)} TL` +
          (k?.satirlar.length
            ? `  [${k.satirlar.map((r) => `${r.serno}: ${kwh(r.kwh)} kWh × ${r.birim} = ${money(r.bedeli)}`).join(" · ")}]`
            : "") +
          (k?.uyarilar?.length ? `  uyarı: ${k.uyarilar.join(" ")}` : "")
      );
    }
  }
  console.log(fails === 0 ? "\nKONTROLLER GEÇTİ ✅" : `\n❌ ${fails} kontrol başarısız`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
