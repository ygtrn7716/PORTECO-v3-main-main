// src/components/dashboard/reports/muhasebeReport.ts
//
// "Muhasebe Excel" — Girdi/Çıktı raporu için TEK KAYNAK, SAF hesap.
//
// Fatura, dağıtım şirketi gözüyle değil KULLANICI (müşteri) gözüyle sınıflandırılır:
//   • Girdi   (BLOK 1)  = mahsupsuz fatura (gider)
//   • Gider Azaltıcı (BLOK 2) = mahsup indirimleri (NEGATİF; asla "Gelir")
//   • Çıktı   (BLOK 3)  = GES satış geliri (faturaya GİRMEZ)
//   • Sonuç   (BLOK 4)  = A + B + F = C (ödenecek) + D1/D2/D3 satış + E1/E2 net etki
//   • Mutabakat (BLOK 5) = GES Olmasaydı karşı-olgu ile mutabakat
//   • Parametreler (BLOK 6) = hesap girdileri (ayrı sheet)
//
// Hem MuhasebeModal hem exportMuhasebeXlsx AYNI MuhasebeReport'u tüketir → sıfır
// yeniden hesap. Bu dosya Supabase/React'e dokunmaz; yalnız `import type` yapar +
// saf `calculateGesUretimSatisi`'yi çağırır (tsx altında da yüklenir).
//
// İŞARET KONVANSİYONU: mahsup = negatif tutar, sınıf "Gider Azaltıcı"; satış =
// pozitif, sınıf "Gelir" ama fatura toplamına KARIŞMAZ.
//
// KAPSAM (v1): yalnız Metot 1 (aylık netleşme). Metot 2/3 breakdown'ı KDV
// matrahına ek kalemler (yekFarki/muhtelif2) katar → BLOK1/BLOK2 yeniden kurulumu
// bunları kapsamaz; çağıran (InvoiceDetail) butonu invoiceMethodId===1 ile gate'ler.

import type { MethodInvoiceBreakdown } from "@/components/utils/calculateInvoiceNetMethods";
import type { GesOlmasaydiResult } from "@/components/utils/calculateGesOlmasaydi";
import { calculateGesUretimSatisi } from "@/lib/ges/gesUretimSatisi";

// buildMuhasebeReport'un desteklediği fatura metotları. null → 1 muamelesi (çağıran).
// Metot 2 (Uedaş net) ve Metot 5 (İpragaz — m2 kopyası, BTV matrahında YEK var) dahil;
// Metot 3 (Tredaş muhtelif-2) kalem yapısı ayrı → henüz yok. Metot 4 zaten GES panelinde gizli.
export const MUHASEBE_SUPPORTED_METHODS = [1, 2, 5] as const;

// ── Girdi (payload) ─────────────────────────────────────────────────────────
export interface MuhasebePayload {
  // Meta
  facilityLabel: string;
  serno: number;
  monthLabel: string;
  periodYear: number;
  periodMonth: number;
  dataSource: "live" | "snapshot";
  generatedAtIso: string; // Europe/Istanbul, çağıran üretir

  // Ana breakdown + oranlar (BLOK 1/2/4 kaynağı). Metot 1 ve 2 için
  // MethodInvoiceBreakdown (Metot 2'de yekTahminiCharge/yekFarkiCharge dolu).
  breakdown: MethodInvoiceBreakdown;
  totalConsumptionKwh: number;
  vatRate: number;
  btvRate: number;
  lisansliSatis: boolean;

  // Post-KDV düzeltmeler (Genel Toplam kimliği)
  yekdemMahsup: number; // KDV dahil, işaretli
  digerDegerler: number; // işaretli
  totalWithMahsup: number; // ekranda görünen ödenecek = kapanış hedefi

  // Miktar türetme (yalnız görüntü)
  contractPowerKw: number;
  monthFinalDemandKw: number;
  powerPrice: number;
  powerExcessPrice: number;
  reactiveUnitPrice: number;

  // Birim fiyat / trafo
  unitPriceEnergy: number; // efektif
  naturalUnitPriceEnergy: number;
  unitPriceDistribution: number;
  effectiveDistributionUnitPrice: number;
  trafoDegeri: number;

  // Satış (BLOK 3) — InvoiceDetail'deki gesSatis ile birebir aynı girdiler
  onYil: boolean;
  usdKur: number;
  perakendeEnerjiBedeli: number;
  dagitimUreticiBedeli: number;

  // Parametreler (BLOK 6)
  kbk: number;
  monthlyPTF: number;
  monthlyYekdem: number;
  unitPriceAdjustment: number;
  terim: string | null;
  gerilim: string | null;
  tarife: string | null;
  tariffType: string | null;
  anlikUretimKullanimi: boolean | null;
  invoiceMethodId: number;

  // Talep birleştirme (BLOK 1 bilgi satırı)
  gesAlloc:
    | { role: "assigned"; priority: number; allocatedKwh: number; isSource: boolean }
    | { role: "source" }
    | null;

  // GES Olmasaydı mutabakatı (BLOK 5)
  gesResult: GesOlmasaydiResult;
}

// ── Çıktı tipleri ───────────────────────────────────────────────────────────
export type MuhasebeSinif =
  | "Gider"
  | "Gider Azaltıcı"
  | "Gelir"
  | "Gelir Azaltıcı"
  | "Bilgi"
  | "Sonuç"
  | "Kontrol";

/** Satır türü — yalnız stil/işaret amaçlı. Yalnız "item" satırları alt toplama girer. */
export type MuhasebeRowKind = "item" | "subtotal" | "kdv" | "adjustment" | "total";

export interface MuhasebeRow {
  kind: MuhasebeRowKind;
  sinif: MuhasebeSinif;
  kalem: string;
  aciklama: string;
  miktar: number | null;
  miktarBirim: string; // "kWh" | "kVArh" | "kW" | "" — Miktar kolonu satır bazında birim
  birimFiyat: number | null;
  tutar: number | null;
  not: string;
}

export type MuhasebeBlockId = "blok1" | "blok2" | "blok3" | "blok4" | "blok5";

export interface MuhasebeBlock {
  id: MuhasebeBlockId;
  baslik: string;
  aciklama: string;
  rows: MuhasebeRow[];
  subtotalKdvHaric: number;
  subtotalKdvDahil: number;
}

export interface MuhasebeSonuc {
  A: number; // Mahsupsuz Fatura Toplamı (KDV Dahil)
  B: number; // Mahsup Toplam Etkisi (KDV Dahil, negatif)
  F: number; // Diğer Değerler / Düzeltmeler
  C: number; // ÖDENECEK FATURA (A + B + F)
  faturaKdvToplami: number; // BLOK1 KDV + BLOK2 KDV Etkisi = b.vatCharge
  D1: number; // GES Satış Net Geliri (KDV Hariç)
  D2: number; // GES Satış KDV
  D3: number; // GES Satış Geliri (KDV Dahil)
  E1: number; // NET MALİYET ETKİSİ (KDV Hariç) = (C − faturaKdvToplami) − D1
  E2: number; // NET NAKİT ETKİSİ (KDV Dahil) = C − D3
}

export interface MuhasebeClosingCheck {
  ok: boolean;
  fark: number; // hesaplanan − faturaToplami
  hesaplanan: number; // A + B + F
  faturaToplami: number; // totalWithMahsup
  tol: number;
}

export interface MuhasebeInvariant {
  ok: boolean;
  sol: number; // E2 − E1
  sag: number; // faturaKdvToplami − D2
  fark: number;
  tol: number;
}

/** Öz tüketim ≈ 0 olan tesiste A + yekdemMahsup + F ≡ gesOlmasaydiFatura kimliği.
 *  (gesOlmasaydiFatura = cf_totalInvoice + yekdemMahsup + digerDegerler —
 *  calculateGesOlmasaydi.ts assembleResult; karşılaştırma aynı tabana getirilir.)
 *  checked=false → öz tüketim var, kimlik beklenmez. Bloklamaz; C'yi etkilemez. */
export interface MuhasebeCfCheck {
  checked: boolean;
  ok: boolean;
  fark: number; // (A + yekdemMahsup + F) − gesOlmasaydiFatura (checked=false → 0)
  tol: number;
}

export interface MuhasebeBlok5 {
  mode: "producer" | "receiver";
  anlikUretimKullanimi: boolean;
  faturalananCekisKwh: number;
  hamTuketimKwh: number;
  anlikOzTuketimKwh: number; // hamTuketim − çekiş
  mahsupsuzFaturaToplami: number; // = A
  mevcutFatura: number;
  gesOlmasaydiFatura: number;
  gesTasarrufu: number;
  mevcutFaturaMutabakat: boolean; // |mevcutFatura − totalWithMahsup| ≤ 0.01
}

export interface MuhasebeParam {
  kalem: string;
  deger: number | string;
  birim: string;
  not: string;
}

export interface MuhasebeReportMeta {
  baslik: string;
  donem: string;
  donemKod: string; // YYYY-MM (dosya adı)
  tesis: string;
  serno: number;
  uretimZamani: string;
  dataSource: "live" | "snapshot";
}

export interface MuhasebeReport {
  meta: MuhasebeReportMeta;
  blocks: MuhasebeBlock[]; // [blok1, blok2, blok3, blok4, blok5]
  sonuc: MuhasebeSonuc;
  closingCheck: MuhasebeClosingCheck;
  invariant: MuhasebeInvariant;
  cfCheck: MuhasebeCfCheck;
  blok5: MuhasebeBlok5;
  params: MuhasebeParam[];
  warnings: string[];
  /** Excel yazıcının formül üretimi için (KDV/BTV oranları). Builder saf kalır. */
  rates: { vatRate: number; btvRate: number };
}

// ── Yardımcılar ─────────────────────────────────────────────────────────────
const TOL = 0.01;

function item(
  sinif: MuhasebeSinif,
  kalem: string,
  aciklama: string,
  miktar: number | null,
  miktarBirim: string,
  birimFiyat: number | null,
  tutar: number | null,
  not = "",
): MuhasebeRow {
  return { kind: "item", sinif, kalem, aciklama, miktar, miktarBirim, birimFiyat, tutar, not };
}

function line(
  kind: MuhasebeRowKind,
  sinif: MuhasebeSinif,
  kalem: string,
  tutar: number | null,
  not = "",
): MuhasebeRow {
  return { kind, sinif, kalem, aciklama: "", miktar: null, miktarBirim: "", birimFiyat: null, tutar, not };
}

/** Tek kaynak alt toplam kuralı: yalnız "item" satırları, "Bilgi" hariç, tutar!=null. */
function sumItems(rows: MuhasebeRow[]): number {
  let acc = 0;
  for (const r of rows) {
    if (r.kind === "item" && r.sinif !== "Bilgi" && r.tutar != null) acc += r.tutar;
  }
  return acc;
}

const pct = (v: number): string =>
  (v * 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

// ── Ana kurucu ──────────────────────────────────────────────────────────────
export function buildMuhasebeReport(p: MuhasebePayload): MuhasebeReport {
  const b = p.breakdown;
  const v = p.vatRate;
  const btvRate = p.btvRate;
  const warnings: string[] = [];

  // Ortak miktar türetmeleri (yalnız görüntü)
  const powerBaseKwh = p.powerPrice > 0 ? b.powerBaseCharge / p.powerPrice : 0;
  const powerExcessKwh = Math.max(0, p.monthFinalDemandKw - p.contractPowerKw);
  const reactiveCezaKwh =
    p.reactiveUnitPrice > 0 ? b.reactivePenaltyCharge / p.reactiveUnitPrice : null;

  // BLOK 1 ortak kuyruk (güç + reaktif) — her iki metodda aynı
  const powerReactiveRows: MuhasebeRow[] = [
    item("Gider", "Güç Bedeli", "Sözleşme gücü bedeli", powerBaseKwh, "kW", p.powerPrice, b.powerBaseCharge),
    item("Gider", "Güç Aşım Bedeli", "Sözleşme gücü aşımı", powerExcessKwh, "kW", p.powerExcessPrice, b.powerExcessCharge),
    item("Gider", "Reaktif Ceza", "Reaktif enerji cezası (mahsuptan bağımsız)", reactiveCezaKwh, "kVArh", p.reactiveUnitPrice, b.reactivePenaltyCharge),
  ];
  const bilgiRows: MuhasebeRow[] = [];
  if (p.gesAlloc && p.gesAlloc.role === "assigned") {
    bilgiRows.push({
      kind: "item",
      sinif: "Bilgi",
      kalem: "Tahsis Edilen GES Mahsubu",
      aciklama: "Talep Birleştirme ile başka tesisten tahsis edilen mahsup",
      miktar: p.gesAlloc.allocatedKwh,
      miktarBirim: "kWh",
      birimFiyat: null,
      tutar: null,
      not: `Öncelik sırası: ${p.gesAlloc.priority}. Bilgi amaçlıdır; toplama girmez.`,
    });
  }

  // BLOK 1 baş / BLOK 2 mahsup satırları — METODA GÖRE.
  // ⚠ Tek kaynak kuralı: her mahsup bileşeni BİR KEZ değişkende tutulur; BLOK 1'de
  // eklenen değişken BLOK 2'de aynen çıkarılır → S1+S2 ≡ subtotalBeforeVat (float epsilon).
  let blok1Head: MuhasebeRow[];
  let blok2Core: MuhasebeRow[];
  // BLOK 2 sonuna eklenen fatura köprüsü Bilgi satırları (yalnız Metot 2; toplama girmez).
  let blok2Tail: MuhasebeRow[] = [];
  // BLOK 6 için metot-2 birim fiyatları (Metot 1'de null → mevcut satırlar).
  let m2ParamInfo: { eUP: number; yekUP: number; grossUP: number } | null = null;

  const isM5 = p.invoiceMethodId === 5;
  if (p.invoiceMethodId === 2 || isM5) {
    // ── METOT 2 (Uedaş net) / METOT 5 (İpragaz — m2 kopyası) ── enerji + YEK tabanı
    // NET; brüte tamamlanır, mahsup BLOK 2'de gider azaltıcı olarak yüzeye çıkar.
    // Dağıtım zaten brüt (sumCn). TEK FARK (m5): BTV matrahında YEK de var → BTV
    // mahsup etkisi YEK mahsubunu da içerir.
    //
    // REBASE (2026-07-28): Brüt enerji tabanı, GES Olmasaydı motorunun uyguladığı
    // brüt-tüketim-ağırlıklı fiyatla kurulur (gesOlmasaydiBreakdown.energyUnitPriceApplied
    // = w_cn × KBK); enerji mahsubu RESIDUAL'dır (grossEnergy − b.energyCharge). Mahsup
    // ucuz güneş saatlerinde oluştuğundan bu residual, mahsubu net-çekiş fiyatıyla (eUP)
    // değerleyen eski kurgudan belirgin küçüktür. S1+S2 ≡ subtotalBeforeVat inşaen korunur;
    // öz tüketimi 0 olan tesiste A + yekdemMahsup + F ≡ gesOlmasaydiFatura kimliği geri gelir.
    const netKwh = b.netEnergyKwh; // sumPos
    const mahsupKwh = b.verisMahsupKwh; // sumMahsup
    const grossKwh = netKwh + mahsupKwh; // sumCn (brüt çekiş)
    // m5 birleşik (İpragaz 2026-08+): motor YEK'i enerji satırına katladı
    // (yekTahminiCharge=0, energyCharge YEK dahil, yekGomuluTutar = katlanan). Rapor
    // eski enerji/YEK ayrışımıyla kurulur → geri ayır. Bayrak yokken 0 → bit-identik.
    const yekGomulu = b.yekGomuluTutar ?? 0;
    const energyChargeBare = b.energyCharge - yekGomulu; // çıplak enerji (YEK hariç)
    const eUP = netKwh > 0 ? energyChargeBare / netKwh : 0; // fatura net çekiş birim fiyatı
    const yekTahminiCharge = (b.yekTahminiCharge ?? 0) + yekGomulu;
    const yekFarkiCharge = b.yekFarkiCharge ?? 0;
    const yekUP = netKwh > 0 ? yekTahminiCharge / netKwh : 0; // fatura YEK birim fiyatı
    const trafoKwh = eUP > 0 ? b.trafoCharge / eUP : 0;

    // Brüt taban fiyatı karşı-olgudan okunur (elle türetme yok); karşı-olgu Metot 1'e
    // düşmüşse (approximate) aylık PTF × KBK'ya inilir ve not düşülür.
    const cfBd = p.gesResult.gesOlmasaydiBreakdown as MethodInvoiceBreakdown | undefined;
    const cfUP =
      !p.gesResult.counterfactualApproximate &&
      cfBd?.energyUnitPriceApplied != null &&
      Number.isFinite(cfBd.energyUnitPriceApplied) &&
      cfBd.energyUnitPriceApplied > 0
        ? cfBd.energyUnitPriceApplied
        : null;
    const grossUP = cfUP ?? p.monthlyPTF * p.kbk;
    if (cfUP == null) {
      warnings.push(
        "Metot 2 brüt enerji tabanı yaklaşık fiyatla kuruldu (aylık PTF × KBK) — karşı-olgusal saatlik fiyat mevcut değil.",
      );
    }

    // Tek kaynak mahsup bileşenleri (BİR KEZ hesaplanır)
    const grossEnergy = grossKwh * grossUP;
    const enerjiMahsupTutar = grossEnergy - energyChargeBare; // residual — mahsup saatlerinin gerçek değeri
    const yekMahsupTutar = mahsupKwh * yekUP; // YEKDEM saat bağımsız → grossup değişmez
    // m2 BTV matrahı yalnız enerji; m5 matrahında YEK de var → mahsup etkisi YEK'i içerir.
    // Çapa inşaen korunur: btvMahsupsuz − btvMahsupEffect ≡ b.btvCharge.
    const btvMahsupEffect = isM5
      ? (enerjiMahsupTutar + yekMahsupTutar) * btvRate
      : enerjiMahsupTutar * btvRate;
    if (enerjiMahsupTutar < 0) {
      warnings.push(
        `Metot 2: enerji mahsup residual'ı negatif (${enerjiMahsupTutar.toFixed(2)} TL) — brüt taban fiyatı ile fatura verisi tutarsız olabilir; değer aynen yazıldı, kapanış korunur.`,
      );
    }
    const mahsupUP = mahsupKwh > 0 ? enerjiMahsupTutar / mahsupKwh : null;
    const mahsupNot =
      "Mahsup, oluştuğu saatlerin ağırlıklı ortalama fiyatıyla değerlenir; bu fiyat net çekiş saatlerinin fiyatından düşüktür.";
    m2ParamInfo = { eUP, yekUP, grossUP };

    blok1Head = [
      item("Gider", "Enerji Bedeli (mahsupsuz)", "Brüt çekiş enerji bedeli", grossKwh, "kWh", grossUP, grossEnergy, "Brüt taban, GES Olmasaydı karşı-olgu fiyatıyla (brüt-tüketim-ağırlıklı PTF × KBK) kurulur."),
      item("Gider", "Trafo Bedeli", "Trafo kaybı enerjisi", trafoKwh, "kWh", eUP, b.trafoCharge),
      item("Gider", "YEK Bedeli (mahsupsuz)", "Brüt çekiş YEKDEM bedeli", grossKwh, "kWh", yekUP, yekTahminiCharge + yekMahsupTutar),
      item("Gider", "YEK Farkı (M-1)", "Önceki dönem YEKDEM düzeltmesi", null, "", null, yekFarkiCharge, "Önceki döneme ait YEKDEM düzeltmesidir; negatif olabilir. Mahsup değildir."),
      item("Gider", "Dağıtım Bedeli", "Brüt çekiş dağıtımı (mahsup yok)", b.distributionBaseKwh, "kWh", p.unitPriceDistribution, b.distributionCharge),
      item("Gider", "BTV (mahsupsuz)", isM5 ? "Brüt enerji+YEK BTV'si" : "Brüt enerji BTV'si", null, "", btvRate, b.btvCharge + btvMahsupEffect),
    ];
    blok2Core = [
      item("Gider Azaltıcı", "Veriş Mahsubu – Enerji", "Üretimin tüketimle netleşen kısmı", mahsupKwh, "kWh", mahsupUP, -enerjiMahsupTutar, mahsupNot),
      item("Gider Azaltıcı", "YEK Mahsubu", "YEKDEM bedelinin mahsup kısmı", mahsupKwh, "kWh", yekUP, -yekMahsupTutar),
      item("Gider Azaltıcı", "BTV Mahsup Etkisi", isM5 ? "Enerji ve YEK mahsubunun BTV etkisi" : "Enerji mahsubunun BTV etkisi", null, "", btvRate, -btvMahsupEffect),
    ];
    // Fatura köprüsü: faturanın gerçek (net) enerji/YEK kalemleri — muhasebeci Excel'i
    // fatura sayfasıyla eşleştirebilsin. "Bilgi" sınıfı → S2'ye ve kapanışa GİRMEZ.
    blok2Tail = [
      item("Bilgi", "Fatura Enerji Bedeli (net, mahsup sonrası)", "Fatura sayfasındaki enerji kalemi", netKwh, "kWh", eUP, energyChargeBare, "Fatura sayfasındaki Enerji Bedeli kalemidir. BLOK 1 brüt tutarından BLOK 2 enerji mahsubu düşüldüğünde bu değere ulaşılır."),
      item("Bilgi", "Fatura YEK Bedeli (net, mahsup sonrası)", "Fatura sayfasındaki YEK kalemi", netKwh, "kWh", yekUP, yekTahminiCharge, "Fatura sayfasındaki YEK Bedeli kalemidir. BLOK 1 brüt tutarından BLOK 2 YEK mahsubu düşüldüğünde bu değere ulaşılır."),
    ];
  } else {
    // ── METOT 1 (aylık netleşme) ── mevcut mantık, DEĞİŞMEZ.
    const trafoKwh =
      p.unitPriceEnergy > 0
        ? b.trafoCharge / p.unitPriceEnergy
        : Number.isFinite(p.trafoDegeri) && p.trafoDegeri > 0
          ? p.trafoDegeri
          : 0;
    const cekisCharge = b.distributionCharge + b.distributionAdjustment; // mahsupsuz dağıtım
    // ⚠ BTV anchor: btvMahsupsuz − btvMahsupEffect ≡ b.btvCharge (override & lisanslı güvenli)
    const btvMahsupEffect = p.lisansliSatis ? 0 : (b.energyCharge - b.netEnergyCharge) * btvRate;
    const distMahsupKwh = b.distributionBaseKwh - b.distributionChargeKwh;

    blok1Head = [
      item("Gider", "Enerji Bedeli (mahsupsuz)", "Şebekeden çekilen toplam tüketim", p.totalConsumptionKwh, "kWh", p.unitPriceEnergy, b.energyCharge),
      item("Gider", "Trafo Bedeli", "Trafo kaybı enerjisi", trafoKwh, "kWh", p.unitPriceEnergy, b.trafoCharge),
      item("Gider", "Dağıtım Bedeli (mahsupsuz)", "Mahsup öncesi tam dağıtım (çekiş)", b.distributionBaseKwh, "kWh", p.unitPriceDistribution, cekisCharge),
      item("Gider", "BTV (mahsupsuz)", "Belediye Tüketim Vergisi — mahsup öncesi", null, "", btvRate, b.btvCharge + btvMahsupEffect),
    ];
    blok2Core = [
      // 2K: birim fiyat motorun UYGULADIĞI fiyat (tavan kırptıysa perakende);
      // eski breakdown fixture'larında alan yok → p.unitPriceEnergy fallback.
      item("Gider Azaltıcı", "Veriş Mahsubu – Enerji", "Üretimin tüketimle netleşen kısmı", b.verisMahsupKwh, "kWh", b.verisMahsupBirimFiyat ?? p.unitPriceEnergy, -b.verisMahsupBedeli),
      item("Gider Azaltıcı", "Dağıtım Mahsubu", "Veriş kaynaklı dağıtım indirimi", distMahsupKwh, "kWh", p.unitPriceDistribution, -b.distributionAdjustment),
      item("Gider Azaltıcı", "BTV Mahsup Etkisi", "Mahsup edilen enerjinin BTV etkisi", null, "", btvRate, -btvMahsupEffect),
    ];
  }

  // ── BLOK 1 — GİRDİ (Mahsupsuz Fatura) ──────────────────────────────────────
  const blok1Rows: MuhasebeRow[] = [...blok1Head, ...powerReactiveRows, ...bilgiRows];
  const S1 = sumItems(blok1Rows);
  const blok1Kdv = S1 * v;
  const A = S1 + blok1Kdv;
  blok1Rows.push(line("subtotal", "Gider", "ARA TOPLAM (KDV Hariç)", S1));
  blok1Rows.push(line("kdv", "Gider", `KDV (%${pct(v)})`, blok1Kdv));
  blok1Rows.push(line("total", "Gider", "GİRDİ TOPLAM (KDV Dahil)", A));

  // ── BLOK 2 — GİDER AZALTICI (Mahsup, negatif) ──────────────────────────────
  const S2 = sumItems(blok2Core); // ≤ 0
  const blok2Kdv = S2 * v;
  const B = S2 + blok2Kdv + p.yekdemMahsup;
  const blok2Rows: MuhasebeRow[] = [
    ...blok2Core,
    line("subtotal", "Gider Azaltıcı", "MAHSUP ARA TOPLAM (KDV Hariç)", S2),
    line("kdv", "Gider Azaltıcı", `KDV Etkisi (%${pct(v)})`, blok2Kdv),
    line("adjustment", "Gider Azaltıcı", "YEKDEM Mahsup Düzeltmesi (M-1)", p.yekdemMahsup, "İşaret aynen; KDV uygulanmaz."),
    line("total", "Gider Azaltıcı", "MAHSUP TOPLAM ETKİ (KDV Dahil)", B),
    // Fatura köprüsü (yalnız Metot 2) — toplam satırlarından SONRA, toplama girmez.
    ...blok2Tail,
  ];

  // ── BLOK 3 — ÇIKTI (Satış, faturaya girmez) ────────────────────────────────
  const sale =
    b.verisFazlaKwh > 0
      ? calculateGesUretimSatisi({
          satisKwh: b.verisFazlaKwh,
          onYil: p.onYil,
          usdKur: p.usdKur,
          perakendeEnerjiBedeli: p.perakendeEnerjiBedeli,
          dagitimBedeli: p.dagitimUreticiBedeli,
        })
      : null;
  const satisKwh = sale ? sale.satisKwh : 0;
  const satisBrutBirim = sale ? sale.satisBrutBirim : 0;
  const satisBrutGelir = sale ? sale.satisBrutGelir : 0;
  const satisKesintiRate = sale ? sale.dagitimBedeli : p.dagitimUreticiBedeli;
  const satisDagitimKesintisi = sale ? sale.satisDagitimKesintisi : 0;
  const D1 = sale ? sale.satisNetGelir : 0;
  const D2 = D1 * v;
  const D3 = D1 + D2;
  const satisNot = "Fatura toplamına girmez; müşteri tarafından ayrıca faturalandırılır.";
  const usdNot =
    sale && sale.satisModu === "usd"
      ? `Birim fiyat: 0,133 USD × ${sale.satisUsdKur.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} kur.`
      : "";
  const kdvNot =
    "Satış KDV oranı fatura KDV oranı varsayılmıştır; matrah ve oran müşteri muhasebesiyle teyit edilmelidir.";
  const blok3Rows: MuhasebeRow[] = [
    item("Gelir", "Veriş Fazlası Satışı (Brüt)", "Tüketimi aşan üretimin satışı", satisKwh, "kWh", satisBrutBirim, satisBrutGelir, [satisNot, usdNot].filter(Boolean).join(" ")),
    item("Gelir Azaltıcı", "Dağıtım Kesintisi (Üretici)", "Üretici dağıtım kesintisi", satisKwh, "kWh", satisKesintiRate, -satisDagitimKesintisi, "Gelir bloğunda gider niteliğindedir; satış gelirini azaltır."),
    line("subtotal", "Gelir", "NET SATIŞ GELİRİ (KDV Hariç)", D1, satisNot),
    line("kdv", "Gelir", `GES Satış KDV (%${pct(v)})`, D2, kdvNot),
    line("total", "Gelir", "GES SATIŞ GELİRİ (KDV Dahil)", D3, satisNot),
  ];

  // ── BLOK 4 — SONUÇ ─────────────────────────────────────────────────────────
  const F = p.digerDegerler;
  const C = A + B + F;
  const faturaKdvToplami = blok1Kdv + blok2Kdv; // = (S1 + S2) × v = b.vatCharge
  const E1 = C - faturaKdvToplami - D1;
  const E2 = C - D3;

  const hesaplanan = C;
  const kapanisFark = hesaplanan - p.totalWithMahsup;
  const closingOk = Math.abs(kapanisFark) <= TOL;
  if (!closingOk) {
    console.warn("[Muhasebe] Kapanış farkı — sessizce yuvarlanmadı", {
      A, B, F, C, totalWithMahsup: p.totalWithMahsup, fark: kapanisFark,
    });
    warnings.push(`Kapanış farkı: ${kapanisFark.toFixed(4)} TL (C, fatura genel toplamıyla eşleşmiyor).`);
  }

  const invSol = E2 - E1;
  const invSag = faturaKdvToplami - D2;
  const invFark = invSol - invSag;
  const invOk = Math.abs(invFark) <= TOL;
  if (!invOk) {
    console.warn("[Muhasebe] Invariant sapması (E2−E1 ≠ faturaKDV − D2)", { invSol, invSag, invFark });
    warnings.push(`Invariant sapması: ${invFark.toFixed(4)} TL.`);
  }

  const blok4Rows: MuhasebeRow[] = [
    line("subtotal", "Sonuç", "A. Mahsupsuz Fatura Toplamı (KDV Dahil)", A),
    line("subtotal", "Sonuç", "B. Mahsup Toplam Etkisi (KDV Dahil)", B),
    line("adjustment", "Sonuç", "F. Diğer Değerler / Düzeltmeler", F, "İşaret aynen; KDV uygulanmaz."),
    line("total", "Sonuç", "C. ÖDENECEK FATURA (A + B + F)", C, "Fatura genel toplamı ile eşleşmeli."),
    line("subtotal", "Gelir", "D1. GES Satış Net Geliri (KDV Hariç)", D1, satisNot),
    line("kdv", "Gelir", `D2. GES Satış KDV (%${pct(v)})`, D2, kdvNot),
    line("total", "Gelir", "D3. GES Satış Geliri (KDV Dahil)", D3, satisNot),
    line("total", "Sonuç", "E1. NET MALİYET ETKİSİ (KDV Hariç)", E1),
    line("total", "Sonuç", "E2. NET NAKİT ETKİSİ (KDV Dahil)", E2),
  ];
  if (!closingOk) {
    blok4Rows.push(line("adjustment", "Kontrol", "Fark (kontrol)", kapanisFark, "⚠ Kapanış tutmuyor — girdileri kontrol edin."));
  }

  // ── BLOK 5 — MUTABAKAT ─────────────────────────────────────────────────────
  const g = p.gesResult;
  const faturalananCekisKwh = g.mevcutTuketimKwh;
  const anlikOzTuketimKwh = g.hamTuketimKwh - g.mevcutTuketimKwh;
  const mevcutFaturaFark = g.mevcutFatura - p.totalWithMahsup;
  const mevcutFaturaMutabakat = Math.abs(mevcutFaturaFark) <= TOL;
  const farkSifir = Math.abs(anlikOzTuketimKwh) <= TOL;
  // GES Olmasaydı motoru Metot 2 kalem yapısını bilmeyebilir → mevcutFatura ile rapor
  // toplamı tam örtüşmeyebilir. BLOKLAYICI DEĞİL: throw yok; C referansı totalWithMahsup.
  if (!mevcutFaturaMutabakat) {
    console.warn("[Muhasebe] BLOK5 mutabakat farkı (bloklamaz; kapanış C etkilenmez)", {
      mevcutFatura: g.mevcutFatura,
      totalWithMahsup: p.totalWithMahsup,
      fark: mevcutFaturaFark,
    });
    warnings.push(
      `Mutabakat (BLOK 5): GES Olmasaydı 'Mevcut Fatura' (${g.mevcutFatura.toFixed(2)}) rapor toplamıyla ` +
        `(${p.totalWithMahsup.toFixed(2)}) tam örtüşmüyor (Δ ${mevcutFaturaFark.toFixed(2)}); kapanış (C) bundan etkilenmez.`,
    );
  }
  const blok5Rows: MuhasebeRow[] = [
    item("Kontrol", "Faturalanan Çekiş", "Şebekeden çekilen (fatura bazı)", faturalananCekisKwh, "kWh", null, null),
    item("Kontrol", "Ham Tüketim / GES Olmasaydı Bazı", "Çekiş + anlık öz tüketim", g.hamTuketimKwh, "kWh", null, null),
    item("Kontrol", "Fark = Anlık Öz Tüketim", "Sayaç arkası (behind-the-meter)", anlikOzTuketimKwh, "kWh", null, null, farkSifir ? "Arazi GES / tamamı şebekeye verilen tesiste fark 0'dır." : ""),
    item("Kontrol", "Mahsupsuz Fatura Toplamı (bu rapor)", "BLOK 4 → A", null, "", null, A),
    item("Kontrol", "Mevcut Faturanız", "Ödenecek fatura", null, "", null, g.mevcutFatura, mevcutFaturaMutabakat ? "✓ Rapor ile mutabık." : `⚠ Rapor C değeriyle uyuşmuyor (Δ ${mevcutFaturaFark.toFixed(2)} TL); kapanışı etkilemez.`),
    item("Kontrol", "GES Olmasaydı Faturanız", "Karşı-olgu senaryosu", null, "", null, g.gesOlmasaydiFatura),
    item("Kontrol", "GES Tasarrufu", "GES Olmasaydı − Mevcut + Satış", null, "", null, g.tasarruf),
  ];

  // ── Karşı-olgu tutarsızlık kontrolü ────────────────────────────────────────
  // Öz tüketim ≈ 0 (arazi GES / receiver / lisanslı) ise "mahsupsuz fatura" ile
  // "GES olmasaydı" aynı senaryodur → A + yekdemMahsup + F ≡ gesOlmasaydiFatura
  // beklenir (gesOlmasaydiFatura, yekdemMahsup + digerDegerler'i İÇERİR —
  // calculateGesOlmasaydi.ts assembleResult). Kapanıştan bağımsız; BLOKLAMAZ.
  const cfChecked = Math.abs(g.hamTuketimKwh - g.mevcutTuketimKwh) < 1;
  const cfFark = cfChecked ? A + p.yekdemMahsup + F - g.gesOlmasaydiFatura : 0;
  const cfOk = !cfChecked || Math.abs(cfFark) <= TOL;
  if (cfChecked && !cfOk) {
    const cfUyari =
      "Öz tüketim sıfır olduğu halde Mahsupsuz Fatura ile GES Olmasaydı Faturanız farklı. " +
      "Karşı-olgu hesabı bu fatura metodunu tam yansıtmıyor olabilir; GES Tasarrufu rakamı teyide muhtaçtır.";
    console.warn("[Muhasebe] Karşı-olgu tutarsızlığı (öz tüketim 0 iken A+F ≠ GES Olmasaydı)", {
      A,
      yekdemMahsup: p.yekdemMahsup,
      F,
      gesOlmasaydiFatura: g.gesOlmasaydiFatura,
      fark: cfFark,
    });
    warnings.push(cfUyari);
    blok5Rows.push(
      item("Kontrol", "⚠ Karşı-olgu Tutarsızlığı", "(A + YEKDEM Mahsup + F) − GES Olmasaydı", null, "", null, cfFark, cfUyari),
    );
  }

  // ── Bloklar ────────────────────────────────────────────────────────────────
  const blocks: MuhasebeBlock[] = [
    {
      id: "blok1",
      baslik: "1 · GİRDİ — Mahsupsuz Fatura",
      aciklama: "Müşterinin, mahsup uygulanmasaydı ödeyeceği tam fatura (gider).",
      rows: blok1Rows,
      subtotalKdvHaric: S1,
      subtotalKdvDahil: A,
    },
    {
      id: "blok2",
      baslik: "2 · GİDER AZALTICI — Mahsup Kalemleri",
      aciklama: "Mahsup, gelir değil gider azaltıcı indirimdir; tutarlar negatiftir.",
      rows: blok2Rows,
      subtotalKdvHaric: S2,
      subtotalKdvDahil: B,
    },
    {
      id: "blok3",
      baslik: "3 · ÇIKTI — GES Satış Geliri",
      aciklama: "Veriş fazlasının satışı. Fatura ödenecek tutarına DAHİL DEĞİLDİR.",
      rows: blok3Rows,
      subtotalKdvHaric: D1,
      subtotalKdvDahil: D3,
    },
    {
      id: "blok4",
      baslik: "4 · SONUÇ — Net Nakit / Maliyet Etkisi",
      aciklama:
        "E1 ile E2 arasındaki fark faturanın KDV tutarından kaynaklanır ve satış olmayan dönemlerde de görülür. KDV'nin indirim konusu yapılıp yapılmayacağı mükellefin durumuna bağlıdır; nakit etkisi için E2, maliyet etkisi için E1 esas alınmalıdır.",
      rows: blok4Rows,
      subtotalKdvHaric: C - faturaKdvToplami,
      subtotalKdvDahil: C,
    },
    {
      id: "blok5",
      baslik: "5 · MUTABAKAT — GES Olmasaydı ile Karşılaştırma",
      aciklama:
        "Mahsupsuz Fatura, faturalanan çekiş kWh'i üzerinden yalnızca mahsup etkileri çıkarılarak hesaplanır. GES Olmasaydı Faturanız ise ham tüketim (çekiş + anlık öz tüketim) üzerinden kurgulanan karşı-olgu senaryosudur. Öz tüketimi olan tesislerde iki tutar farklıdır; bu fark hata değildir.",
      rows: blok5Rows,
      subtotalKdvHaric: 0,
      subtotalKdvDahil: 0,
    },
  ];

  // ── BLOK 6 — PARAMETRELER ──────────────────────────────────────────────────
  const evetHayir = (x: boolean | null): string => (x == null ? "—" : x ? "Evet" : "Hayır");
  const methodAdi =
    p.invoiceMethodId === 2
      ? "Uedaş (saatlik net)"
      : p.invoiceMethodId === 5
        ? "İpragaz (saatlik net, BTV matrahında YEK)"
        : p.invoiceMethodId === 1
          ? "Aylık netleşme"
          : "Diğer";
  const hesapDali =
    g.mode === "receiver"
      ? "Alıcı (Talep Birleştirme mahsup alan)"
      : p.lisansliSatis
        ? "Lisanslı Satış"
        : g.anlikUretimKullanimi === false
          ? "Arazi GES (anlık kullanım yok)"
          : "Öz Tüketim (behind-the-meter)";
  const talepBirlestirme =
    p.gesAlloc == null
      ? "Yok"
      : p.gesAlloc.role === "assigned"
        ? `Alıcı (öncelik ${p.gesAlloc.priority}, tahsis ${p.gesAlloc.allocatedKwh.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} kWh)`
        : "Kaynak (üretim sayacı)";

  // Metot 2/5'te tek "efektif" harman fiyat (Metot 1 formülü) raporun hiçbir yerinde
  // kullanılmaz → yanıltıcı; yerine faturanın gerçek birim fiyatları gösterilir.
  const enerjiFiyatParams: MuhasebeParam[] =
    (p.invoiceMethodId === 2 || p.invoiceMethodId === 5) && m2ParamInfo
      ? [
          { kalem: "Enerji Birim Fiyatı (net çekiş)", deger: m2ParamInfo.eUP, birim: "TL/kWh", not: "Fatura enerji kaleminin birim fiyatı" },
          { kalem: "YEK Birim Fiyatı", deger: m2ParamInfo.yekUP, birim: "TL/kWh", not: "Fatura YEK kaleminin birim fiyatı" },
          { kalem: "Enerji Birim Fiyatı (brüt taban)", deger: m2ParamInfo.grossUP, birim: "TL/kWh", not: "BLOK 1 brüt enerji tabanı (karşı-olgu fiyatı)" },
        ]
      : [
          { kalem: "Enerji Birim Fiyatı (efektif)", deger: p.unitPriceEnergy, birim: "TL/kWh", not: "" },
          { kalem: "Enerji Birim Fiyatı (doğal)", deger: p.naturalUnitPriceEnergy, birim: "TL/kWh", not: "" },
        ];

  const params: MuhasebeParam[] = [
    { kalem: "PTF (aylık)", deger: p.monthlyPTF, birim: "TL/kWh", not: "" },
    { kalem: "YEKDEM (aylık)", deger: p.monthlyYekdem, birim: "TL/kWh", not: "" },
    { kalem: "KBK", deger: p.kbk, birim: "katsayı", not: "" },
    { kalem: "Birim Fiyat Düzeltmesi", deger: p.unitPriceAdjustment, birim: "TL/kWh", not: "unit_price_adjustment" },
    ...enerjiFiyatParams,
    { kalem: "Dağıtım Birim Fiyatı", deger: p.unitPriceDistribution, birim: "TL/kWh", not: "" },
    { kalem: "Efektif Dağıtım Birim Fiyatı", deger: p.effectiveDistributionUnitPrice, birim: "TL/kWh", not: p.invoiceMethodId === 2 || p.invoiceMethodId === 5 ? "brüt taban; mahsup düzeltmesi yok" : "mahsup sonrası" },
    { kalem: "KDV Oranı", deger: `%${pct(p.vatRate)}`, birim: "", not: "" },
    { kalem: "BTV Oranı", deger: `%${pct(p.btvRate)}`, birim: "", not: "" },
    { kalem: "Tarife", deger: p.tarife ?? "—", birim: "", not: "" },
    { kalem: "Terim", deger: p.terim ?? "—", birim: "", not: "" },
    { kalem: "Gerilim", deger: p.gerilim ?? "—", birim: "", not: "" },
    { kalem: "Tarife Tipi", deger: p.tariffType ?? "—", birim: "", not: "" },
    { kalem: "Sözleşme Gücü", deger: p.contractPowerKw, birim: "kW", not: "" },
    { kalem: "Ay Sonu Talep (max)", deger: p.monthFinalDemandKw, birim: "kW", not: "month_final_demand_kw" },
    { kalem: "USD Kuru", deger: p.usdKur, birim: "TL/USD", not: "" },
    { kalem: "10 Yıl Üstü (on_yil)", deger: evetHayir(p.onYil), birim: "", not: "" },
    { kalem: "Lisanslı Satış", deger: evetHayir(p.lisansliSatis), birim: "", not: "" },
    { kalem: "Anlık Üretim Kullanımı", deger: evetHayir(p.anlikUretimKullanimi), birim: "", not: "" },
    { kalem: "Hesap Dalı", deger: hesapDali, birim: "", not: "" },
    { kalem: "Talep Birleştirme", deger: talepBirlestirme, birim: "", not: "" },
    { kalem: "Fatura Metodu", deger: `${p.invoiceMethodId} — ${methodAdi}`, birim: "", not: "invoice_method_id" },
    { kalem: "⚠ Metot Notu", deger: "Farklı fatura metotlarının (Metot 1 / Metot 2) raporları BİREBİR karşılaştırılamaz; kalem yapısı ve mahsup yeri değişir.", birim: "", not: "" },
    { kalem: "Veri Kaynağı", deger: p.dataSource === "snapshot" ? "Snapshot" : "Canlı hesap", birim: "", not: "" },
    { kalem: "Rapor Üretim Zamanı", deger: p.generatedAtIso, birim: "", not: "Europe/Istanbul" },
  ];

  const donemKod = `${p.periodYear}-${String(p.periodMonth).padStart(2, "0")}`;

  return {
    meta: {
      baslik: "Fatura Muhasebe — Girdi/Çıktı Raporu",
      donem: p.monthLabel,
      donemKod,
      tesis: p.facilityLabel,
      serno: p.serno,
      uretimZamani: p.generatedAtIso,
      dataSource: p.dataSource,
    },
    blocks,
    sonuc: { A, B, F, C, faturaKdvToplami, D1, D2, D3, E1, E2 },
    closingCheck: { ok: closingOk, fark: kapanisFark, hesaplanan, faturaToplami: p.totalWithMahsup, tol: TOL },
    invariant: { ok: invOk, sol: invSol, sag: invSag, fark: invFark, tol: TOL },
    cfCheck: { checked: cfChecked, ok: cfOk, fark: cfFark, tol: TOL },
    rates: { vatRate: v, btvRate },
    blok5: {
      mode: g.mode,
      anlikUretimKullanimi: g.anlikUretimKullanimi,
      faturalananCekisKwh,
      hamTuketimKwh: g.hamTuketimKwh,
      anlikOzTuketimKwh,
      mahsupsuzFaturaToplami: A,
      mevcutFatura: g.mevcutFatura,
      gesOlmasaydiFatura: g.gesOlmasaydiFatura,
      gesTasarrufu: g.tasarruf,
      mevcutFaturaMutabakat,
    },
    params,
    warnings,
  };
}
