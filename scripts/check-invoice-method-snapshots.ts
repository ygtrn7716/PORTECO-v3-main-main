// scripts/check-invoice-method-snapshots.ts
//
// Aşama 2C — fatura metodu snapshot SAĞLIK KONTROLÜ (kalıcı).
// Kullanım: npm run check:method-snapshots
//
// ⚠️ %100 SALT-OKUNUR. Hiçbir koşulda yazma/güncelleme/silme YAPMAZ.
// Onarım yolu tek: ilgili tesisin o ayının fatura sayfasını açmak — InvoiceDetail
// snapshot'ı yeniden hesaplayıp yeni alanlarla damgalar.
//
// Üç kontrol:
//   1) Ana değişmez     — invoice_method IN (2,3) AND w_pos IS NULL  → 0 beklenir.
//   2) Kısmi damga      — w_pos dolu ama motorun gerektirdiği diğer alanlardan biri NULL.
//   3) Metod uyuşmazlığı— 2A ÖNCESİ yazılmış (w_pos NULL) ama firması bugün
//                         metod 2/3'e çözülen snapshot'lar.
//
// (3) bir bozulma DEĞİL: o satırlar Metod 1 ile yazıldı ve bugün Metod 1 ile
// replay ediliyor; yani yalnızca ESKİ SNAPSHOT KAYDIYLA tutarlılar, gerçek
// tedarikçi faturasının yapısıyla değil. Sayfaları açmak onları GERÇEK FATURA
// YAPISINA HİZALAR.
//
// KAPSAM: kontroller yalnız saatlik-net metotlarını (2, 3) hedefler. Metod 1,
// Metod 4 (GES'siz düz fatura) ve Metod 6 (Kepsaş) metod-1 motorundan geçer;
// w_pos/kbk/yekdem_tahmini gibi saatlik-net kolonlarını STAMPLAMAZ → filtreler
// bilerek `IN (2,3)` kalır; bu metotlar bu sağlık kontrolleri açısından kapsam
// dışıdır (normal, eksik damga değil).
//   • Metod 4: yalnız üretimi sıfırlar; ek replay kolonu damgalamaz.
//   • Metod 6: enerji fiyatına gömülen çıplak YEKDEM adder'ını `embedded_yekdem_adder`
//     kolonuna damgalar (mahsup yoksa 0/null → normal). Metod-1 türevi olduğundan
//     `w_pos` DAİMA NULL olmalıdır (net değil); dolu ise anomali (aşağıda kontrol edilir).
// Not: Metod 5 (İpragaz, net) şu an filtrelere dahil DEĞİL — önceden var olan boşluk.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SB_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("HATA: VITE_SUPABASE_URL ve SB_SERVICE_ROLE_KEY gerekli (.env).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const money = (n: unknown) =>
  Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SnapRow = {
  user_id: string;
  subscription_serno: number;
  period_year: number;
  period_month: number;
  invoice_type: string;
  invoice_method: number | null;
  invoice_from: string | null;
  total_with_mahsup: number | null;
  w_pos: number | null;
  kbk: number | null;
  yekdem_tahmini: number | null;
  mahsuplasma_unit_price: number | null;
  w_mahsup: number | null;
};

const SNAP_FIELDS =
  "user_id, subscription_serno, period_year, period_month, invoice_type, invoice_method, " +
  "invoice_from, total_with_mahsup, w_pos, kbk, yekdem_tahmini, mahsuplasma_unit_price, w_mahsup";

const donem = (r: SnapRow) => `${r.period_year}-${String(r.period_month).padStart(2, "0")}`;

async function main() {
  let problems = 0;

  const { data: allSnaps, error: snapErr } = await supabase
    .from("invoice_snapshots")
    .select(SNAP_FIELDS);
  if (snapErr) throw snapErr;
  // SNAP_FIELDS bir değişken olduğu için PostgREST satır tipini çıkaramıyor → unknown üzerinden.
  const snaps = (allSnaps ?? []) as unknown as SnapRow[];

  console.log(`\n═══ Fatura Metodu Snapshot Sağlık Kontrolü ═══`);
  console.log(`Toplam snapshot: ${snaps.length}\n`);

  // ── 1) Ana değişmez ───────────────────────────────────────────────
  const eksikDamga = snaps.filter(
    (r) => (r.invoice_method === 2 || r.invoice_method === 3) && r.w_pos == null
  );
  console.log("① Ana değişmez — invoice_method IN (2,3) AND w_pos IS NULL");
  if (eksikDamga.length === 0) {
    console.log("   ✅ 0 satır (beklenen).\n");
  } else {
    problems += eksikDamga.length;
    console.log(`   ❌ ${eksikDamga.length} satır damgasız:`);
    for (const r of eksikDamga) {
      console.log(`      · serno ${r.subscription_serno} · ${donem(r)} · m${r.invoice_method}`);
    }
    console.log("      → Onarım: bu tesislerin ilgili ay fatura sayfasını aç.\n");
  }

  // ── 2) Kısmi damga anomalisi ──────────────────────────────────────
  // w_pos dolu ama motorun gerektirdiği diğer alanlardan biri eksik →
  // yarım damga; gelecekte sessiz hata adayı.
  const kismiDamga = snaps
    .filter((r) => (r.invoice_method === 2 || r.invoice_method === 3) && r.w_pos != null)
    .map((r) => {
      const eksik: string[] = [];
      if (r.kbk == null) eksik.push("kbk");
      if (r.yekdem_tahmini == null) eksik.push("yekdem_tahmini");
      if (r.invoice_method === 3 && r.mahsuplasma_unit_price == null) {
        eksik.push("mahsuplasma_unit_price");
      }
      // 2I: m3 mahsuplaşma formülünün girdisi — replay determinizmi için damgalanmalı.
      if (r.invoice_method === 3 && r.w_mahsup == null) {
        eksik.push("w_mahsup");
      }
      return { r, eksik };
    })
    .filter((x) => x.eksik.length > 0);

  console.log("② Kısmi damga — w_pos dolu ama diğer metod alanlarından biri NULL");
  if (kismiDamga.length === 0) {
    console.log("   ✅ 0 satır (beklenen).\n");
  } else {
    problems += kismiDamga.length;
    console.log(`   ⚠️  ${kismiDamga.length} satırda yarım damga:`);
    for (const { r, eksik } of kismiDamga) {
      console.log(
        `      · serno ${r.subscription_serno} · ${donem(r)} · m${r.invoice_method} · eksik: ${eksik.join(", ")}`
      );
    }
    console.log("      → Onarım: bu tesislerin ilgili ay fatura sayfasını aç.\n");
  }

  // ── 2b) Metod 6 (Kepsaş) tutarlılığı ──────────────────────────────
  // Metod 6 metod-1 türevidir → w_pos DAİMA NULL olmalı (net değil). Dolu ise
  // metod yanlış yazılmış / firma yanlış eşlenmiş demektir.
  const m6Anomali = snaps.filter((r) => r.invoice_method === 6 && r.w_pos != null);
  console.log("②b Metod 6 tutarlılığı — invoice_method=6 AND w_pos IS NOT NULL");
  if (m6Anomali.length === 0) {
    console.log("   ✅ 0 satır (beklenen).\n");
  } else {
    problems += m6Anomali.length;
    console.log(`   ❌ ${m6Anomali.length} satırda Metod 6 net kolon damgalı (anomali):`);
    for (const r of m6Anomali) {
      console.log(`      · serno ${r.subscription_serno} · ${donem(r)}`);
    }
    console.log("      → Onarım: bu tesislerin ilgili ay fatura sayfasını aç.\n");
  }

  // ── 3) 2A öncesi metod uyuşmazlığı ────────────────────────────────
  // Firma zinciri: owner_subscriptions.provider → user_integrations.provider
  //                → invoice_companies.method_id
  const [osRes, uiRes, icRes] = await Promise.all([
    supabase.from("owner_subscriptions").select("user_id, subscription_serno, provider"),
    supabase.from("user_integrations").select("user_id, provider, invoice_from"),
    supabase.from("invoice_companies").select("key, display_name, method_id"),
  ]);
  if (osRes.error || uiRes.error || icRes.error) {
    throw (osRes.error ?? uiRes.error ?? icRes.error)!;
  }

  const firmaByKey = new Map(
    ((icRes.data as { key: string; display_name: string; method_id: number }[]) ?? []).map((c) => [
      c.key,
      { name: c.display_name, method: Number(c.method_id) },
    ])
  );
  const firmaByUserProvider = new Map<string, { name: string; method: number }>();
  for (const i of ((uiRes.data as { user_id: string; provider: string; invoice_from: string }[]) ?? [])) {
    const f = firmaByKey.get(i.invoice_from);
    if (f) firmaByUserProvider.set(`${i.user_id}|${i.provider}`, f);
  }
  const firmaBySub = new Map<string, { name: string; method: number }>();
  for (const os of ((osRes.data as { user_id: string; subscription_serno: number; provider: string | null }[]) ?? [])) {
    if (!os.provider) continue;
    const f = firmaByUserProvider.get(`${os.user_id}|${os.provider}`);
    if (f) firmaBySub.set(`${os.user_id}|${os.subscription_serno}`, f);
  }

  const uyusmazlik = snaps
    .filter((r) => r.w_pos == null)
    .map((r) => ({ r, hedef: firmaBySub.get(`${r.user_id}|${r.subscription_serno}`) }))
    .filter((x) => x.hedef && (x.hedef.method === 2 || x.hedef.method === 3));

  console.log("③ 2A öncesi metod uyuşmazlığı — Metod 1 ile yazılmış ama firması bugün Metod 2/3");
  if (uyusmazlik.length === 0) {
    console.log("   ✅ 0 satır.\n");
  } else {
    console.log(`   ℹ️  ${uyusmazlik.length} satır — MANUEL DÖNÜŞÜM CHECKLIST'İ:`);
    console.log(
      "      (bozulma değil: bu kayıtlar yalnız eski snapshot'la tutarlı; sayfayı açmak\n" +
        "       onları gerçek fatura yapısına HİZALAR ve tutar değişir)\n"
    );
    console.log(
      `      ${"kullanıcı".padEnd(10)} ${"serno".padStart(10)} ${"dönem".padStart(8)} ` +
        `${"kayıtlı toplam".padStart(16)}  hedef`
    );
    for (const { r, hedef } of uyusmazlik) {
      console.log(
        `      ${String(r.user_id).slice(0, 8).padEnd(10)} ${String(r.subscription_serno).padStart(10)} ` +
          `${donem(r).padStart(8)} ${money(r.total_with_mahsup).padStart(16)}  ` +
          `Metod ${hedef!.method} (${hedef!.name})`
      );
    }
    console.log("\n      → Dönüşüm: her satır için o tesisin o ayının fatura sayfasını aç.\n");
  }

  // ── Özet ──────────────────────────────────────────────────────────
  console.log("═══ Özet ═══");
  console.log(`① damgasız: ${eksikDamga.length}  ② yarım damga: ${kismiDamga.length}  ③ hizalanacak: ${uyusmazlik.length}`);
  if (problems === 0) {
    console.log("✅ Değişmezler sağlam — eksik/yarım damga yok.\n");
  } else {
    console.log(`❌ ${problems} satırda damga sorunu var (yukarıda listelendi).\n`);
  }
  // ③ bir hata değil (bilgi/checklist) → exit koduna girmez.
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`FATAL :: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
