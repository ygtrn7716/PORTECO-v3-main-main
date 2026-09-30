// scripts/compare-meram-m7.ts
//
// Metot 7 (Meram / MEPAŞ) CANLI KARŞILAŞTIRMA — Metod 1 (bugün) vs Metod 7.
//
// ⚠️ %100 SALT-OKUNUR. DB'ye hiçbir şey yazmaz: "@/lib/supabase" harness tsconfig'iyle
// scripts/shims/supabaseService.ts'e yönlenir (servis istemcisi; insert/update/upsert/
// delete/rpc throw eder). Uygulamanın kendi fonksiyonları kullanılır
// (fetchBilledInvoiceInputs → assembleMethodInputs → buildBreakdownFromInputs) —
// paralel hesap yolu yok.
//
// Kullanım:
//   npx tsx --tsconfig scripts/tsconfig.harness.json scripts/compare-meram-m7.ts [YYYY-MM] [--pending]
//
//   YYYY-MM    dönem (varsayılan 2026-08)
//   --pending  As Beton için ONAY BEKLEYEN ayarları (KBK 0,952 · trafo_kaybi_saatlik 1,12 ·
//              yekdem_gddk) DB'ye yazmadan, bellek içinde uygular. Bayraksız → DB'deki
//              ayarlar aynen (ayarlar yazıldıktan sonraki doğrulama).
//   --snapshots  As Beton'un 3 tesisi için "Kaydet + Snapshot'ı Yeniden Yaz" (InvoiceOverridesAdmin)
//              akışının YAZMADAN önizlemesi: aynı yol (taslak GDDK tek kaynak → buildBreakdownFromInputs
//              → snapshotParamsFromEngine → buildInvoiceSnapshotPayload); saklı satırla alan alan
//              karşılaştırma + yeni satırdan replay kontrolü.

import { supabase } from "@/lib/supabase";
import {
  buildBreakdownFromInputs,
  fetchBilledInvoiceInputs,
  type BilledInvoiceInputs,
} from "@/components/utils/billedInvoiceInputs";
import {
  assembleMethodInputs,
  loadHourlyNetAggregates,
} from "@/components/utils/hourlyNetAggregates";
import { fetchGesMahsupContext } from "@/components/utils/gesAllocation";
import {
  fetchInvoiceOverrides,
  type InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";
import {
  buildInvoiceSnapshotPayload,
  recomputeSnapshotTotalWithMahsup,
  snapshotParamsFromEngine,
} from "@/components/utils/invoiceSnapshots";
import type {
  InvoiceMethodInputs,
  MethodInvoiceBreakdown,
} from "@/components/utils/calculateInvoiceNetMethods";

const args = process.argv.slice(2);
const periodArg = args.find((a) => /^\d{4}-\d{2}$/.test(a)) ?? "2026-08";
const [periodYear, periodMonth] = periodArg.split("-").map(Number);
const usePending = args.includes("--pending");
const showSnapshots = args.includes("--snapshots");

/** As Beton için onay bekleyen ayarlar (validasyon adımı 2). */
const PENDING: Record<number, { kbk: number; t: number; gddk: number }> = {
  10126953: { kbk: 0.952, t: 1.12, gddk: 82.26 },
  10128583: { kbk: 0.952, t: 0, gddk: 1180.11 },
  9062757: { kbk: 0.952, t: 1.12, gddk: 51.54 },
};

/** Gerçek MEPAŞ faturaları (Ağustos 2026) — yalnız referans. */
const MERAM_ACTUAL: Record<number, number> = {
  10126953: 197435.24,
  10128583: 1231516.78,
  9062757: 30074.21,
};

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const unit = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(6);

/** Onay bekleyen ayarları BELLEK İÇİNDE uygulayarak m7 girdisi kurar (assembleMeramInputs aynası:
 *  t'li yükleyici + t'li tahsis bağlamı; Y = final ?? value; adj; GDDK doğrudan). */
async function pendingMeramInputs(
  inputs: BilledInvoiceInputs,
  userId: string,
  serno: number,
  pending: Record<number, { kbk: number; t: number; gddk: number }>
): Promise<InvoiceMethodInputs | null> {
  const p = pending[serno];
  const ctx = await fetchGesMahsupContext(supabase, userId);
  // Havuzdaki TÜM bekleyen t'ler bağlama girer (kapasite havuz genelidir).
  const trafoKaybiBySerno = new Map(ctx.trafoKaybiBySerno);
  for (const [s, v] of Object.entries(pending)) {
    if (v.t > 0 && ctx.assignedSernos.has(Number(s))) trafoKaybiBySerno.set(Number(s), v.t);
  }
  const agg = await loadHourlyNetAggregates({
    supabase,
    userId,
    subscriptionSerno: serno,
    periodYear,
    periodMonth,
    ctx: { ...ctx, trafoKaybiBySerno },
    trafoKaybiSaatlik: p.t,
  });
  if (!agg) return null;
  const { data: yk, error } = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value, yekdem_final")
    .eq("user_id", userId)
    .eq("subscription_serno", serno)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();
  if (error) throw error;
  const final = yk?.yekdem_final != null ? Number(yk.yekdem_final) : null;
  return {
    sumCn: agg.sumCn,
    sumGn: agg.sumGn,
    sumPos: agg.sumPos,
    sumMahsup: agg.sumMahsup,
    sumExcess: agg.sumExcess,
    wPos: agg.wPos,
    wMahsup: agg.wMahsup,
    kbk: p.kbk,
    tahminiYekdem: final ?? inputs.monthlyYekdem,
    prevSumPos: null,
    prevTahminiYekdem: null,
    prevGerceklesenYekdem: null,
    mahsuplasmaUnitPrice: null,
    meram: {
      ownGnTotal: agg.sumOwnGn,
      trafoKaybiSaatlik: p.t,
      trafoKaybiKwh: agg.trafoKaybiKwh,
      unitPriceAdjustment: inputs.unitPriceAdjustment,
      yekdemIsFinal: final != null,
      gddk: p.gddk,
    },
  };
}

/** InvoiceOverridesAdmin.handleSaveAndRewriteSnapshot'ın YAZMADAN aynası. Admin sayfası
 *  girdideki meram.gddk'yı null'lar (taslak tek kaynak) ve GDDK'yı override olarak taşır. */
async function snapshotRewritePreview(p: {
  userId: string;
  serno: number;
  inputs: BilledInvoiceInputs;
  mi7: InvoiceMethodInputs;
  overrides: InvoiceOverrides | null;
  liveTotalWithMahsup: number;
}): Promise<string> {
  const gddk = usePending ? PENDING[p.serno]?.gddk : p.mi7.meram?.gddk;
  const adminInputs: BilledInvoiceInputs = {
    ...p.inputs,
    invoiceMethodId: 7,
    methodInputs: p.mi7.meram ? { ...p.mi7, meram: { ...p.mi7.meram, gddk: null } } : p.mi7,
  };
  const adminOverrides: InvoiceOverrides = {
    ...(p.overrides ?? {}),
    ...(gddk != null && !p.overrides?.yekdem_gddk
      ? {
          yekdem_gddk: {
            isExcluded: false,
            unitPriceOverride: null,
            amountOverride: gddk,
            payload: null,
            note: null,
          },
        }
      : {}),
  };
  const result = buildBreakdownFromInputs(adminInputs, adminOverrides);
  const payload = buildInvoiceSnapshotPayload(
    snapshotParamsFromEngine({
      userId: p.userId,
      subscriptionSerno: p.serno,
      inputs: adminInputs,
      result,
      overrides: adminOverrides,
      invoiceType: "billed",
    })
  );
  const { data: stored, error } = await supabase
    .from("invoice_snapshots")
    .select("*")
    .eq("user_id", p.userId)
    .eq("subscription_serno", p.serno)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .eq("invoice_type", "billed")
    .maybeSingle();
  if (error) throw error;

  const FIELDS = [
    "invoice_method", "kbk", "trafo_degeri", "total_consumption_kwh", "net_positive_draw_kwh",
    "net_excess_feed_kwh", "total_production_kwh", "w_pos", "w_mahsup", "yekdem_tahmini",
    "unit_price_adjustment", "trafo_kaybi_saatlik", "trafo_kaybi_kwh", "own_gn_kwh", "yekdem_gddk",
    "yekdem_is_final", "energy_charge", "distribution_charge", "btv_charge", "subtotal_before_vat",
    "vat_charge", "total_invoice", "has_yekdem_mahsup", "yekdem_mahsup", "total_with_mahsup",
  ];
  const fmt = (v: unknown) =>
    v == null ? "—" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(6)) : String(v);
  const pl = payload as Record<string, unknown>;
  const st = (stored ?? {}) as Record<string, unknown>;
  const lines = [
    `\n▸ ${p.serno} · ${periodArg} billed — saklı ${stored ? `(metod ${fmt(st.invoice_method)})` : "(YOK — admin butonu yalnız mevcut snapshot'ı yazar)"} → yeni (metod 7)`,
    `  ${"alan".padEnd(24)} ${"saklı".padStart(18)} ${"yeni".padStart(18)}`,
  ];
  for (const f of FIELDS) {
    const a = fmt(st[f]);
    const b = f in pl ? fmt(pl[f]) : "(dokunulmaz)";
    lines.push(`  ${f.padEnd(24)} ${a.padStart(18)} ${b.padStart(18)}${a !== b && b !== "(dokunulmaz)" ? "  ←" : ""}`);
  }
  // Replay: yazılacak satır (saklı satırın üzerine payload) + aynı override'lar → canlı sonuçla aynı mı?
  const replayed = recomputeSnapshotTotalWithMahsup({ ...st, ...pl } as never, adminOverrides);
  const d = replayed - p.liveTotalWithMahsup;
  lines.push(
    `  replay (yeni satırdan) ödenecek ${money(replayed)} · canlı m7 ${money(p.liveTotalWithMahsup)} · Δ ${d.toFixed(4)} ${Math.abs(d) < 0.01 ? "✅" : "❌"}`
  );
  return lines.join("\n");
}

type Row = {
  serno: number;
  title: string;
  hidden: boolean;
  lisansli: boolean;
  m1Invoice: number | null;
  m1Payable: number | null;
  m7Invoice: number | null;
  m7Payable: number | null;
  b1: MethodInvoiceBreakdown | null;
  m1YekdemMahsup: number;
  b7: MethodInvoiceBreakdown | null;
  mi7: InvoiceMethodInputs | null;
  note: string;
};

async function main() {
  console.log(
    `\n=== Meram · Metod 1 (bugün) vs Metod 7 · ${periodArg}${usePending ? " · As Beton ONAY BEKLEYEN ayarlar bellek içinde" : " · DB ayarları"} ===\n`
  );

  const { data: subs, error: subsErr } = await supabase
    .from("owner_subscriptions")
    .select("user_id, subscription_serno, title")
    .eq("provider", "meram")
    .order("user_id")
    .order("subscription_serno");
  if (subsErr) throw subsErr;

  const { data: settingsRows, error: setErr } = await supabase
    .from("subscription_settings")
    .select("user_id, subscription_serno, is_hidden, active")
    .in("subscription_serno", (subs ?? []).map((s) => Number(s.subscription_serno)));
  if (setErr) throw setErr;

  const rows: Row[] = [];
  const previews: string[] = [];
  for (const s of subs ?? []) {
    const userId = String(s.user_id);
    const serno = Number(s.subscription_serno);
    const st = (settingsRows ?? []).find(
      (r) => String(r.user_id) === userId && Number(r.subscription_serno) === serno
    );
    const base: Row = {
      serno,
      title: String(s.title ?? "").slice(0, 38),
      hidden: st?.is_hidden === true || st?.active === false,
      lisansli: false,
      m1Invoice: null,
      m1Payable: null,
      m7Invoice: null,
      m7Payable: null,
      b1: null,
      m1YekdemMahsup: 0,
      b7: null,
      mi7: null,
      note: "",
    };

    const res = await fetchBilledInvoiceInputs({
      supabase,
      userId,
      subscriptionSerno: serno,
      periodYear,
      periodMonth,
      methodContext: "admin",
    });
    if (!res.ok) {
      rows.push({ ...base, note: `girdi yok: ${res.reason}` });
      continue;
    }
    const inputs = res.inputs;
    base.lisansli = inputs.lisansliSatis;
    const overrides = await fetchInvoiceOverrides({
      userId,
      subscriptionSerno: serno,
      periodYear,
      periodMonth,
    });

    const r1 = buildBreakdownFromInputs(inputs, overrides);
    base.m1Invoice = r1.breakdown.totalInvoice;
    base.m1Payable = r1.totalWithMahsup;
    base.b1 = r1.breakdown;
    base.m1YekdemMahsup = r1.yekdemMahsup;
    if (inputs.invoiceMethodId !== 1) base.note += `bugünkü metod ${inputs.invoiceMethodId}; `;

    const mi7 =
      usePending && PENDING[serno]
        ? await pendingMeramInputs(inputs, userId, serno, PENDING)
        : await assembleMethodInputs({
            supabase,
            userId,
            subscriptionSerno: serno,
            periodYear,
            periodMonth,
            invoiceMethodId: 7,
            kbk: inputs.kbk,
            tahminiYekdem: inputs.monthlyYekdem,
          });
    const r7 = buildBreakdownFromInputs(
      { ...inputs, invoiceMethodId: 7, methodInputs: mi7 },
      overrides
    );
    base.m7Invoice = r7.breakdown.totalInvoice;
    base.m7Payable = r7.totalWithMahsup;
    base.b7 = r7.breakdown;
    base.mi7 = mi7;
    if (inputs.lisansliSatis) base.note += "lisanslı → m7 dispatcher m1'e yönlendirir; ";
    if (!r7.breakdown.meram && !inputs.lisansliSatis) base.note += "m7 girdisi yok → m1 fallback; ";
    rows.push(base);

    if (showSnapshots && PENDING[serno] && r7.breakdown.meram && mi7) {
      previews.push(
        await snapshotRewritePreview({ userId, serno, inputs, mi7, overrides, liveTotalWithMahsup: r7.totalWithMahsup })
      );
    }
  }

  // ── Özet tablo
  const head = [
    "serno".padEnd(9),
    "tesis".padEnd(38),
    "m1 ödenecek".padStart(15),
    "m7 ödenecek".padStart(15),
    "Δ (m7−m1)".padStart(13),
    "Δ%".padStart(7),
    "Meram fatura".padStart(15),
  ].join(" │ ");
  console.log(head);
  console.log("─".repeat(head.length));
  for (const r of rows) {
    const d = r.m7Payable != null && r.m1Payable != null ? r.m7Payable - r.m1Payable : null;
    const pct = d != null && r.m1Payable ? (d / r.m1Payable) * 100 : null;
    console.log(
      [
        String(r.serno).padEnd(9),
        (r.title + (r.hidden ? " (gizli)" : "")).slice(0, 38).padEnd(38),
        money(r.m1Payable).padStart(15),
        money(r.m7Payable).padStart(15),
        money(d).padStart(13),
        (pct == null ? "—" : pct.toFixed(2)).padStart(7),
        money(MERAM_ACTUAL[r.serno] ?? null).padStart(15),
      ].join(" │ ")
    );
  }

  // ── Tesis detayları (m7)
  for (const r of rows) {
    console.log(`\n▸ ${r.serno} ${r.title}${r.note ? `  [${r.note.trim()}]` : ""}`);
    const a = r.b1;
    if (a) {
      console.log(
        `  m1: Enerji ${money(a.energyCharge)} · Trafo ${money(a.trafoCharge)} · Dağıtım ${money(a.distributionCharge)}` +
          ` · Veriş mahsup −${money(a.verisMahsupBedeli)} (${kwh(a.verisMahsupKwh)} kWh) · BTV ${money(a.btvCharge)}` +
          ` · KDV ${money(a.vatCharge)} · Toplam ${money(a.totalInvoice)} · YEKDEM mahsubu ${money(r.m1YekdemMahsup)}`
      );
    }
    const b = r.b7;
    const m = b?.meram;
    if (!b || !m) {
      console.log("  (m7 kalemi yok)");
      continue;
    }
    console.log(
      `  N ${kwh(b.netEnergyKwh)} · M ${kwh(m.mahsupKwh)} · C ${kwh(m.consKwh)} · G_own ${kwh(m.ownGnKwh)}` +
        ` · trafo ${kwh(m.trafoKaybiKwh)} kWh (t ${m.trafoKaybiSaatlik})`
    );
    console.log(
      `  wNet ${unit(b.wPosApplied)} · wM ${unit(m.wMahsup)} · Y ${unit(m.yekdem)}${m.yekdemIsFinal ? "" : " (tahmini)"}` +
        ` · KBK ${r.mi7?.kbk} · U ${unit(b.energyUnitPriceApplied)}`
    );
    console.log(
      `  Enerji ${money(b.energyCharge)} · F ${money(m.mahsuplasmaFarki)} · GDDK ${money(m.gddk)}` +
        ` · Satır2 ${money(m.satir2)} · Dağıtım ${money(b.distributionCharge)}${m.dagitimYarim ? " (½)" : ""}` +
        ` · Reaktif ${money(b.reactivePenaltyCharge)} · Güç ${money(b.powerTotalCharge)}`
    );
    console.log(
      `  BTV ${money(b.btvCharge)} · Matrah ${money(b.subtotalBeforeVat)} · KDV ${money(b.vatCharge)}` +
        ` · Toplam ${money(b.totalInvoice)} · m1 toplam ${money(r.m1Invoice)} / ödenecek ${money(r.m1Payable)}`
    );
  }
  if (showSnapshots) {
    console.log(
      "\n=== Ağustos snapshot'ı m7 olarak YENİDEN YAZMA önizlemesi (yazım YOK) ===\n" +
        "Akış (tesis tesis): Admin → Fatura Kalem Düzenleme (/dashboard/admin/faturalar) → kullanıcı →\n" +
        "tesis → dönem → YEKDEM GDDK satırını kontrol et → önizleme → \"Kaydet + Snapshot'ı Yeniden Yaz\".\n" +
        "Aşağıdaki satırlar o butonun yazacağı payload'ın aynısıdır."
    );
    for (const p of previews) console.log(p);
  }
  console.log("\n(salt-okunur — DB'ye yazım yapılmadı)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
