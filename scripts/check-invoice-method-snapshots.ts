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
// Metod 7 (Meram, net): ayrı kontrol ②c — w_pos + m7 replay kolonları (trafo_kaybi_kwh,
// own_gn_kwh, yekdem_gddk, yekdem_is_final, unit_price_adjustment) dolu olmalı.
// Metod 8 (Kayseri OSB, net DEĞİL): kontrol ②d — osb_* birimleri + own_gn_kwh dolu, w_pos NULL.
// Dağıtım kendi verişiyle (MEDAŞ usulü, Metot 1 ve 7): kontrol ②f — dagitim_kendi_veris=true
// satırda metod 1 veya 7 + own_gn_kwh + medas_veris_birim/bedeli dolu (replay G'yi own_gn_kwh'tan okur).
// ③ efektif metodu abonelik override'ı ?? firma metodu olarak çözer
// (subscription_settings.invoice_method_override — src/lib/invoiceMethods.ts methodForSubscription).

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
  trafo_kaybi_kwh: number | null;
  own_gn_kwh: number | null;
  yekdem_gddk: number | null;
  yekdem_is_final: boolean | null;
  unit_price_adjustment: number | null;
  lisansli_satis: boolean | null;
  osb_enerji_birim_fiyati: number | null;
  osb_iletim_birim: number | null;
  osb_dagitim_birim: number | null;
  osb_cekis_birim: number | null;
  osb_veris_dagitim_birim: number | null;
  osb_reaktif_birim: number | null;
  dagitim_kendi_veris: boolean | null;
  medas_veris_birim: number | null;
  medas_veris_bedeli: number | null;
};

const SNAP_FIELDS =
  "user_id, subscription_serno, period_year, period_month, invoice_type, invoice_method, " +
  "invoice_from, total_with_mahsup, w_pos, kbk, yekdem_tahmini, mahsuplasma_unit_price, w_mahsup, " +
  "trafo_kaybi_kwh, own_gn_kwh, yekdem_gddk, yekdem_is_final, unit_price_adjustment, lisansli_satis, " +
  "osb_enerji_birim_fiyati, osb_iletim_birim, osb_dagitim_birim, osb_cekis_birim, " +
  "osb_veris_dagitim_birim, osb_reaktif_birim, dagitim_kendi_veris, medas_veris_birim, medas_veris_bedeli";

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

  // ── 2c) Metod 7 (Meram) damga bütünlüğü ──────────────────────────
  // m7 replay'i w_pos/w_mahsup/kbk/yekdem_tahmini (= Y) + m7 kolonlarına dayanır; biri
  // NULL ise replay Metod 1'e düşer (dispatcher uyarısı). Lisanslı m7 tesisi m1'e
  // yönlendirildiği için kapsam dışı.
  const m7Eksik = snaps
    .filter((r) => r.invoice_method === 7 && r.lisansli_satis !== true)
    .map((r) => {
      const eksik: string[] = [];
      if (r.w_pos == null) eksik.push("w_pos");
      if (r.w_mahsup == null) eksik.push("w_mahsup");
      if (r.kbk == null) eksik.push("kbk");
      if (r.yekdem_tahmini == null) eksik.push("yekdem_tahmini");
      if (r.trafo_kaybi_kwh == null) eksik.push("trafo_kaybi_kwh");
      if (r.own_gn_kwh == null) eksik.push("own_gn_kwh");
      if (r.yekdem_gddk == null) eksik.push("yekdem_gddk");
      if (r.yekdem_is_final == null) eksik.push("yekdem_is_final");
      if (r.unit_price_adjustment == null) eksik.push("unit_price_adjustment");
      return { r, eksik };
    })
    .filter((x) => x.eksik.length > 0);
  console.log("②c Metod 7 damgası — invoice_method=7 (lisanslı hariç) ve m7 replay kolonlarından biri NULL");
  if (m7Eksik.length === 0) {
    console.log("   ✅ 0 satır (beklenen).\n");
  } else {
    problems += m7Eksik.length;
    console.log(`   ❌ ${m7Eksik.length} satırda eksik m7 damgası:`);
    for (const { r, eksik } of m7Eksik) {
      console.log(`      · serno ${r.subscription_serno} · ${donem(r)} · eksik: ${eksik.join(", ")}`);
    }
    console.log("      → Onarım: bu tesislerin ilgili ay fatura sayfasını aç.\n");
  }

  // ── 2d) Metod 8 (Kayseri OSB) damga bütünlüğü ────────────────────
  // m8 replay'i osb_* birimlerine + own_gn_kwh'a dayanır; biri NULL ise replay görünür hataya
  // düşer (saklı toplam gösterilir). m8 net aile değildir → w_pos DAİMA NULL olmalı.
  const m8Eksik = snaps
    .filter((r) => r.invoice_method === 8 && r.lisansli_satis !== true)
    .map((r) => {
      const eksik: string[] = [];
      if (r.osb_enerji_birim_fiyati == null) eksik.push("osb_enerji_birim_fiyati");
      if (r.osb_iletim_birim == null) eksik.push("osb_iletim_birim");
      if (r.osb_dagitim_birim == null) eksik.push("osb_dagitim_birim");
      if (r.osb_cekis_birim == null) eksik.push("osb_cekis_birim");
      if (r.osb_veris_dagitim_birim == null) eksik.push("osb_veris_dagitim_birim");
      if (r.osb_reaktif_birim == null) eksik.push("osb_reaktif_birim");
      if (r.own_gn_kwh == null) eksik.push("own_gn_kwh");
      if (r.w_pos != null) eksik.push("w_pos DOLU (anomali)");
      return { r, eksik };
    })
    .filter((x) => x.eksik.length > 0);
  console.log("②d Metod 8 damgası — invoice_method=8 (lisanslı hariç): osb_* + own_gn dolu, w_pos NULL");
  if (m8Eksik.length === 0) {
    console.log("   ✅ 0 satır (beklenen).\n");
  } else {
    problems += m8Eksik.length;
    console.log(`   ❌ ${m8Eksik.length} satırda m8 damga sorunu:`);
    for (const { r, eksik } of m8Eksik) {
      console.log(`      · serno ${r.subscription_serno} · ${donem(r)} · ${eksik.join(", ")}`);
    }
    console.log("      → Onarım: ilgili ayın snapshot'ını admin 'Kaydet + Snapshot'ı Yeniden Yaz' ile yenile.\n");
  }

  // ── 2f) Dağıtım kendi verişiyle (MEDAŞ usulü) damga bütünlüğü ─────
  // Replay G'yi own_gn_kwh'tan, MEDAŞ birimini medas_veris_birim'den okur; biri NULL ise G = 0
  // (tam dağıtım) varsayılır → yanlış. Bayrak yalnız Metot 1 ve 7'de anlamlı.
  const kvEksik = snaps
    .filter((r) => r.dagitim_kendi_veris === true)
    .map((r) => {
      const eksik: string[] = [];
      const m = r.invoice_method ?? 1;
      if (m !== 1 && m !== 7) eksik.push(`invoice_method=${r.invoice_method} (yalnız m1/m7)`);
      if (r.own_gn_kwh == null) eksik.push("own_gn_kwh");
      if (r.medas_veris_birim == null) eksik.push("medas_veris_birim");
      if (r.medas_veris_bedeli == null) eksik.push("medas_veris_bedeli");
      return { r, eksik };
    })
    .filter((x) => x.eksik.length > 0);
  console.log("②f Dağıtım kendi verişiyle — dagitim_kendi_veris=true: m1/m7 + own_gn_kwh + medas_veris_* dolu");
  if (kvEksik.length === 0) {
    console.log("   ✅ 0 satır (beklenen).\n");
  } else {
    problems += kvEksik.length;
    console.log(`   ❌ ${kvEksik.length} satırda damga sorunu:`);
    for (const { r, eksik } of kvEksik) {
      console.log(`      · serno ${r.subscription_serno} · ${donem(r)} · ${eksik.join(", ")}`);
    }
    console.log("      → Onarım: ilgili ayın snapshot'ını admin 'Kaydet + Snapshot'ı Yeniden Yaz' ile yenile.\n");
  }

  // ── 3) 2A öncesi metod uyuşmazlığı ────────────────────────────────
  // Efektif metod = subscription_settings.invoice_method_override ?? firma metodu.
  // Firma zinciri: owner_subscriptions.provider → user_integrations.provider
  //                → invoice_companies.method_id
  const [osRes, uiRes, icRes, ssRes] = await Promise.all([
    supabase.from("owner_subscriptions").select("user_id, subscription_serno, provider"),
    supabase.from("user_integrations").select("user_id, provider, invoice_from"),
    supabase.from("invoice_companies").select("key, display_name, method_id"),
    supabase
      .from("subscription_settings")
      .select("user_id, subscription_serno, invoice_method_override")
      .not("invoice_method_override", "is", null),
  ]);
  if (osRes.error || uiRes.error || icRes.error || ssRes.error) {
    throw (osRes.error ?? uiRes.error ?? icRes.error ?? ssRes.error)!;
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
  // Abonelik override'ı firma metodunun YERİNE geçer.
  for (const ss of ((ssRes.data as { user_id: string; subscription_serno: number; invoice_method_override: number | null }[]) ?? [])) {
    const ov = Number(ss.invoice_method_override);
    if (!Number.isFinite(ov)) continue;
    const key = `${ss.user_id}|${ss.subscription_serno}`;
    const firma = firmaBySub.get(key);
    firmaBySub.set(key, { name: `${firma?.name ?? "—"} · abonelik override`, method: ov });
  }

  // ── 2e) Metod 3 bölünmüş dağıtım (Trepaş 2026-09+) — own_gn_kwh damgası (BİLGİ) ──
  // Replay damgasız satırda tahsis yoksa Σgn, tahsisliyse 0 varsayar; damga bunu kesinleştirir.
  const m3OwnGnYok = snaps.filter(
    (r) =>
      r.invoice_method === 3 &&
      r.w_pos != null &&
      r.period_year * 12 + r.period_month >= 2026 * 12 + 9 &&
      r.own_gn_kwh == null
  );
  console.log("②e Metod 3 (2026-09+) — own_gn_kwh IS NULL (bilgi; replay fallback'i kullanılır)");
  if (m3OwnGnYok.length === 0) {
    console.log("   ✅ 0 satır.\n");
  } else {
    console.log(`   ℹ️  ${m3OwnGnYok.length} satır damgasız:`);
    for (const r of m3OwnGnYok) {
      console.log(`      · serno ${r.subscription_serno} · ${donem(r)} · ${r.invoice_type}`);
    }
    console.log("      → Faturayı yeniden kaydet veya own_gn_kwh'ı saatlik Σgn ile damgala.\n");
  }

  const uyusmazlik = snaps
    .filter((r) => r.w_pos == null)
    .map((r) => ({ r, hedef: firmaBySub.get(`${r.user_id}|${r.subscription_serno}`) }))
    .filter((x) => x.hedef && (x.hedef.method === 2 || x.hedef.method === 3 || x.hedef.method === 7));

  console.log("③ Metod uyuşmazlığı — Metod 1 ile yazılmış ama efektif metodu bugün 2/3/7 (override ?? firma)");
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
