// scripts/compare-osb-m8.ts
//
// Metot 8 (Kayseri OSB) CANLI KARŞILAŞTIRMA — Metod 1 (bugün) vs Metod 8.
//
// ⚠️ %100 SALT-OKUNUR. "@/lib/supabase" harness tsconfig'iyle yazma/rpc engelli servis
// shim'ine yönlenir (scripts/shims/supabaseService.ts). Uygulamanın kendi fonksiyonları
// kullanılır (fetchBilledInvoiceInputs → assembleMethodInputs → buildBreakdownFromInputs).
//
// Kullanım:
//   npm run compare:osb-m8 -- [YYYY-MM] [--pending] [--snapshots]
//
//   YYYY-MM      dönem (varsayılan 2026-08)
//   --pending    osb_aylik_fiyatlar'da dönem satırı yoksa ONAY BEKLEYEN değerleri bellek içinde
//                uygular (2026-08: P 3,480765 · YEKDEM fark 0). DB'ye yazmaz.
//   --snapshots  AYTEKS tesisleri için "Kaydet + Snapshot'ı Yeniden Yaz" akışının YAZMADAN
//                önizlemesi (payload + replay kontrolü).

import { supabase } from "@/lib/supabase";
import {
  buildBreakdownFromInputs,
  fetchBilledInvoiceInputs,
  type BilledInvoiceInputs,
} from "@/components/utils/billedInvoiceInputs";
import { assembleMethodInputs } from "@/components/utils/hourlyNetAggregates";
import {
  fetchInvoiceOverrides,
  type InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";
import {
  buildInvoiceSnapshotPayload,
  recomputeSnapshotTotalWithMahsup,
  snapshotParamsFromEngine,
} from "@/components/utils/invoiceSnapshots";
import { methodForSubscription, resolveInvoiceMethods } from "@/lib/invoiceMethods";
import type {
  InvoiceMethodInputs,
  MethodInvoiceBreakdown,
} from "@/components/utils/calculateInvoiceNetMethods";

const args = process.argv.slice(2);
const periodArg = args.find((a) => /^\d{4}-\d{2}$/.test(a)) ?? "2026-08";
const [periodYear, periodMonth] = periodArg.split("-").map(Number);
const usePending = args.includes("--pending");
const showSnapshots = args.includes("--snapshots");

/** Onay bekleyen OSB aylık fiyatları (dönem → P / YEKDEM fark birimi). */
const PENDING_PRICES: Record<string, { p: number; fark: number }> = {
  "2026-08": { p: 3.480765, fark: 0 },
};

const AYTEKS_USER = "0ef490f5-1c96-4d4b-bfa0-bb1ed1c0caa9";
/** OSB Ağustos 2026 bildirimi — yalnız referans. */
const OSB_ACTUAL: Record<number, number> = {
  105013200: 105208.33,
  107183100: 150685.79,
  107196200: 43402.61,
};
/** OSB bildirimindeki YEKDEM fark miktarları (Temmuz net tüketimi, doğrulama 3). */
const OSB_JULY_N: Record<number, number> = {
  105013200: 429.717,
  107183100: 25529.769,
  107196200: 5767.03,
};

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });

type Row = {
  userId: string;
  serno: number;
  title: string;
  hidden: boolean;
  methodToday: string;
  m1Payable: number | null;
  m8Payable: number | null;
  b8: MethodInvoiceBreakdown | null;
  mi8: InvoiceMethodInputs | null;
  note: string;
};

async function main() {
  console.log(
    `\n=== Kayseri OSB · Metod 1 (bugün) vs Metod 8 · ${periodArg}${usePending ? " · bekleyen fiyat bellek içinde" : ""} ===\n`
  );
  const { data: subs, error } = await supabase
    .from("owner_subscriptions")
    .select("user_id, subscription_serno, title, provider")
    .eq("provider", "vhs_kayseri")
    .order("user_id")
    .order("subscription_serno");
  if (error) throw error;
  const { data: sets, error: sErr } = await supabase
    .from("subscription_settings")
    .select("user_id, subscription_serno, is_hidden, active, invoice_method_override")
    .in("subscription_serno", (subs ?? []).map((s) => Number(s.subscription_serno)));
  if (sErr) throw sErr;

  const rows: Row[] = [];
  const previews: string[] = [];
  for (const s of subs ?? []) {
    const userId = String(s.user_id);
    const serno = Number(s.subscription_serno);
    const st = (sets ?? []).find(
      (r) => String(r.user_id) === userId && Number(r.subscription_serno) === serno
    );
    const map = await resolveInvoiceMethods({ context: "admin", userId, supabase });
    // Efektif metod = abonelik override'ı ?? şirket metodu (uygulamayla aynı resolver).
    const resolved = methodForSubscription(map, String(s.provider), st?.invoice_method_override);
    const row: Row = {
      userId,
      serno,
      title: String(s.title ?? "").slice(0, 34),
      hidden: st?.is_hidden === true || st?.active === false,
      methodToday:
        resolved.source === "override"
          ? `m${resolved.methodId} (abonelik override; ${resolved.invoiceFrom ?? "—"})`
          : resolved.invoiceFrom
            ? `m${resolved.methodId} (${resolved.invoiceFrom})`
            : `m${resolved.methodId} (EŞLEŞME YOK — geçişten etkilenmez)`,
      m1Payable: null,
      m8Payable: null,
      b8: null,
      mi8: null,
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
      rows.push({ ...row, note: `girdi yok: ${res.reason}` });
      continue;
    }
    const inputs = res.inputs;
    const overrides = await fetchInvoiceOverrides({
      userId,
      subscriptionSerno: serno,
      periodYear,
      periodMonth,
    });
    row.m1Payable = buildBreakdownFromInputs(inputs, overrides).totalWithMahsup;

    try {
      let mi8 = await assembleMethodInputs({
        supabase,
        userId,
        subscriptionSerno: serno,
        periodYear,
        periodMonth,
        invoiceMethodId: 8,
        kbk: inputs.kbk,
        tahminiYekdem: inputs.monthlyYekdem,
        invoiceFrom: "kayseri_osb",
      });
      const pend = PENDING_PRICES[periodArg];
      if (usePending && mi8?.osb && pend && (mi8.osb.enerjiFiyati == null || mi8.osb.fiyatTahmini)) {
        mi8 = {
          ...mi8,
          osb: {
            ...mi8.osb,
            enerjiFiyati: pend.p,
            yekdemFarkBirim: pend.fark,
            fiyatTahmini: false,
            fiyatDonemi: periodArg,
          },
        };
        row.note += "P bellek içi (bekleyen); ";
      }
      row.mi8 = mi8;
      const r8 = buildBreakdownFromInputs({ ...inputs, invoiceMethodId: 8, methodInputs: mi8 }, overrides);
      row.m8Payable = r8.totalWithMahsup;
      row.b8 = r8.breakdown;
      if (showSnapshots && userId === AYTEKS_USER && r8.breakdown.osb && mi8) {
        previews.push(await snapshotPreview(userId, serno, inputs, mi8, overrides, r8.totalWithMahsup));
      }
    } catch (e) {
      row.note += `m8 HATA: ${(e as Error).message}; `;
    }
    rows.push(row);
  }

  const head = [
    "serno".padEnd(10),
    "tesis".padEnd(34),
    "bugünkü metod".padEnd(28),
    "m1 ödenecek".padStart(14),
    "m8 ödenecek".padStart(14),
    "Δ".padStart(13),
    "OSB bildirimi".padStart(14),
  ].join(" │ ");
  console.log(head);
  console.log("─".repeat(head.length));
  for (const r of rows) {
    const d = r.m1Payable != null && r.m8Payable != null ? r.m8Payable - r.m1Payable : null;
    console.log(
      [
        String(r.serno).padEnd(10),
        (r.title + (r.hidden ? " (gizli)" : "")).slice(0, 34).padEnd(34),
        r.methodToday.slice(0, 28).padEnd(28),
        money(r.m1Payable).padStart(14),
        money(r.m8Payable).padStart(14),
        money(d).padStart(13),
        money(r.userId === AYTEKS_USER ? OSB_ACTUAL[r.serno] ?? null : null).padStart(14),
      ].join(" │ ")
    );
  }

  for (const r of rows) {
    console.log(`\n▸ ${r.serno} ${r.title} [user ${r.userId.slice(0, 8)}]${r.note ? `  [${r.note.trim()}]` : ""}`);
    const b = r.b8;
    const o = b?.osb;
    if (!b || !o) {
      console.log("  (m8 kalemi yok)");
      continue;
    }
    const julyRef = r.userId === AYTEKS_USER ? OSB_JULY_N[r.serno] : undefined;
    console.log(
      `  C ${kwh(o.consKwh)} · M ${kwh(o.mahsupKwh)} · N ${kwh(o.netKwh)} · G ${kwh(o.ownGnKwh)}` +
        ` · RI ${kwh(o.riKwh)} (%${o.riYuzde.toFixed(2)}) · RC ${kwh(o.rcKwh)} (%${o.rcYuzde.toFixed(2)})` +
        ` · üretim tesisi ${o.uretimTesisi ? "EVET" : "hayır"}`
    );
    console.log(
      `  önceki ay N ${kwh(o.oncekiAyNetKwh)}${julyRef != null ? ` (OSB bildirimi ${kwh(julyRef)})` : ""}` +
        ` · P ${o.enerjiFiyati.toFixed(6)}${o.fiyatTahmini ? " (tahmini)" : ""} · fark birim ${o.yekdemFarkBirim}`
    );
    console.log(
      `  Enerji ${money(o.aktifEnerji)} · Endüktif ${money(o.enduktif)} · Kapasitif ${money(o.kapasitif)}` +
        ` · YEKDEM fark ${money(o.yekdemFiyatFarki)} · İletim ${money(o.iletim)} · OSB dağ. ${money(o.osbDagitim)}` +
        ` · Çekiş ${money(o.cekis)} · Veriş dağ. ${money(o.verisDagitim)} · ETV ${money(o.etv)}`
    );
    console.log(
      `  Matrah ${money(b.subtotalBeforeVat)} · KDV ${money(b.vatCharge)} · Toplam ${money(b.totalInvoice)}`
    );
  }

  if (showSnapshots) {
    console.log(
      "\n=== Snapshot'ı m8 olarak YENİDEN YAZMA önizlemesi (yazım YOK) ===\n" +
        "Akış: Admin → Fatura Kalem Düzenleme → kullanıcı → tesis → dönem → önizleme →\n" +
        "\"Kaydet + Snapshot'ı Yeniden Yaz\". Satırlar o butonun yazacağı payload'dır."
    );
    for (const p of previews) console.log(p);
  }
  console.log("\n(salt-okunur — DB'ye yazım yapılmadı)\n");
}

async function snapshotPreview(
  userId: string,
  serno: number,
  inputs: BilledInvoiceInputs,
  mi8: InvoiceMethodInputs,
  overrides: InvoiceOverrides | null,
  liveTotal: number
): Promise<string> {
  const inp: BilledInvoiceInputs = { ...inputs, invoiceMethodId: 8, methodInputs: mi8 };
  const result = buildBreakdownFromInputs(inp, overrides);
  const payload = buildInvoiceSnapshotPayload(
    snapshotParamsFromEngine({
      userId,
      subscriptionSerno: serno,
      inputs: inp,
      result,
      overrides,
      invoiceType: "billed",
    })
  ) as Record<string, unknown>;
  const { data: stored, error } = await supabase
    .from("invoice_snapshots")
    .select("*")
    .eq("user_id", userId)
    .eq("subscription_serno", serno)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .eq("invoice_type", "billed")
    .maybeSingle();
  if (error) throw error;
  const st = (stored ?? {}) as Record<string, unknown>;
  const FIELDS = [
    "invoice_method", "total_consumption_kwh", "net_positive_draw_kwh", "net_excess_feed_kwh",
    "total_production_kwh", "own_gn_kwh", "prev_sum_pos", "reactive_ri_percent", "reactive_rc_percent",
    "reactive_penalty_charge", "w_pos", "unit_price_energy", "osb_enerji_birim_fiyati", "osb_fiyat_tahmini",
    "osb_yekdem_fark_birim", "osb_iletim_birim", "osb_dagitim_birim", "osb_cekis_birim",
    "osb_veris_dagitim_birim", "osb_reaktif_birim", "ges_satis_dagitim_bedeli", "energy_charge",
    "btv_charge", "subtotal_before_vat", "vat_charge", "total_invoice", "yekdem_mahsup", "total_with_mahsup",
  ];
  const fmt = (v: unknown) =>
    v == null ? "—" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(6)) : String(v);
  const lines = [
    `\n▸ ${serno} · ${periodArg} billed — saklı ${stored ? `(metod ${fmt(st.invoice_method)})` : "(YOK — admin butonu yalnız mevcut snapshot'ı yazar)"} → yeni (metod 8)`,
    `  ${"alan".padEnd(26)} ${"saklı".padStart(18)} ${"yeni".padStart(18)}`,
  ];
  for (const f of FIELDS) {
    const a = fmt(st[f]);
    const b = f in payload ? fmt(payload[f]) : "(dokunulmaz)";
    lines.push(`  ${f.padEnd(26)} ${a.padStart(18)} ${b.padStart(18)}${a !== b && b !== "(dokunulmaz)" ? "  ←" : ""}`);
  }
  const replayed = recomputeSnapshotTotalWithMahsup({ ...st, ...payload } as never, overrides);
  const d = replayed - liveTotal;
  lines.push(
    `  replay (yeni satırdan) ${money(replayed)} · canlı m8 ${money(liveTotal)} · Δ ${d.toFixed(4)} ${Math.abs(d) < 0.01 ? "✅" : "❌"}`
  );
  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
