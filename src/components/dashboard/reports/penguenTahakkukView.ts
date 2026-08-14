// src/components/dashboard/reports/penguenTahakkukView.ts
//
// Penguen Gıda özel "Tahakkuk" görünümü — SAF SUNUM ADAPTÖRÜ.
//
// Girdi: mevcut MuhasebeReport + MuhasebePayload (hesap TEK KAYNAK: buildMuhasebeReport
// ve fatura motoru — burada HİÇBİR fatura hesabı tekrarlanmaz, yalnız yeniden
// sınıflandırılır). Çıktı: müşterinin muhasebe kayıt düzenine göre özet + üç yevmiye
// fişi + dayanak. Supabase/React'e dokunmaz (tsx altında da yüklenir).
//
// MÜŞTERİ MANTIĞI (Metot 2 / Uedaş'a özgü): fatura enerjiyi NET kWh (sumPos)
// üzerinden hesaplar; müşteri gideri BRÜT kWh × aynı birim fiyat (eUP) ile,
// mahsubu ise aynı eUP ile GELİR olarak kaydeder. İki kalem aynı fiyatı
// kullandığından fark sadeleşir → ödenecek tutar fatura ile birebir eşleşir
// (digerSaticilar ≡ totalWithMahsup, inşaen). Ekonomik olarak mahsup burada
// bilerek fatura fiyatıyla değerlenir (standart rapordaki rebase'in tersi) —
// bu müşterinin kendi kayıt tercihi, borç tutarını değiştirmez.
//
// Yalnız Metot 2: Metot 1'de enerji zaten brüt + ayrıca dağıtım mahsubu vardır;
// bu formatın karşılığı yoktur → null (çağıran standart formata düşer).

import type { MethodInvoiceBreakdown } from "@/components/utils/calculateInvoiceNetMethods";
import type { MuhasebePayload, MuhasebeReport } from "./muhasebeReport";

/* ------------------------------------------------------------------ */
/*  Müşteri sabitleri — TEK YERDEN değiştirilir                        */
/* ------------------------------------------------------------------ */

// Yevmiye hesap kodları (müşterinin kendi hesap planı; v1: sabit).
export const PENGUEN_HESAP_KODLARI = {
  elektrikGiderleri: { kod: "ENERJI.730.03010101", ad: "Elektrik Giderleri" },
  giderTahakkuklari: { kod: "1.381.09010101", ad: "Gider Tahakkukları (Tüketimden Kaynaklanan)" },
  gelirTahakkuklari: { kod: "1.181.02010103", ad: "Gelir Tahakkukları" },
  enerjiUretimGeliri: { kod: "100.649.01010107", ad: "Enerji Üretim Geliri" },
  indirilecekKdv: { kod: "1.191.0101010120", ad: "İndirilecek KDV" },
  digerSaticilar: { kod: "320", ad: "Diğer Satıcılar" },
  // Görselde karşılığı yok — muhasebeci kendi hesabını yazar (Excel'de kod hücresi boş).
  digerDuzeltme: { kod: "", ad: "Diğer Değerler / Düzeltmeler" },
} as const;

/** Özetteki "GES Üretim Mahsup Tutarı (<ay>)" etiketi. Bizim veri akışımızda Haziran
 *  faturasının mahsubu Haziran verişinden gelir → 'donem'. Müşteri kendi dosyasında
 *  bir ay kaydırmalı yazıyorsa ('Mayıs'), teyit gelince TEK SATIR: 'onceki_ay' yap. */
export const MAHSUP_AY_ETIKETI: "donem" | "onceki_ay" = "donem";

const AY_ADLARI = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

const TOL = 0.01;

/* ------------------------------------------------------------------ */
/*  Çıktı tipleri                                                      */
/* ------------------------------------------------------------------ */

export interface PenguenOzetSatir {
  kalem: string;
  /** Mizan Bakiyesi kolonu kullanıcı doldurur (Excel'de sarı boş hücre). */
  faturaTutari: number;
}

export interface PenguenFisSatir {
  hesapKodu: string;
  aciklama: string;
  borc: number | null;
  alacak: number | null;
}

export interface PenguenFis {
  id: "fis1" | "fis2" | "fis3";
  baslik: string;
  tarihNotu: string;
  /** Fiş 3: Fatura Tarihi / Fatura No sistemde yok → Excel'de doldurulabilir boş hücreler. */
  editableFaturaAlanlari: boolean;
  satirlar: PenguenFisSatir[];
  toplamBorc: number;
  toplamAlacak: number;
}

export interface PenguenDayanak {
  grossKwh: number;
  mahsupKwh: number;
  netKwh: number;
  eUP: number;
  yekBedeli: number;
  btvBedeli: number;
  dagitimBedeli: number;
  not: string;
}

export interface PenguenTahakkukView {
  meta: {
    tesis: string;
    serno: number;
    donem: string;
    donemKod: string; // YYYY-MM (dosya adı)
    donemAyAdi: string;
    mahsupAyAdi: string; // MAHSUP_AY_ETIKETI'ne göre
    donemSonuTarihi: string; // DD.MM.YYYY
    uretimZamani: string;
  };
  ozet: PenguenOzetSatir[];
  fisler: PenguenFis[];
  dayanak: PenguenDayanak;
  degerler: {
    eUP: number;
    elektrikGideri: number;
    dagitimBedeli: number;
    indirilecekKdv: number;
    digerDuzeltme: number;
    mahsupTutari: number;
    borcToplam: number;
    digerSaticilar: number;
  };
  kapanis: { ok: boolean; fark: number; tol: number };
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/*  Adaptör                                                            */
/* ------------------------------------------------------------------ */

export function buildPenguenTahakkukView(
  report: MuhasebeReport,
  payload: MuhasebePayload,
): PenguenTahakkukView | null {
  // Yalnız Metot 2 — Metot 1 kalem yapısının bu formatta karşılığı yok.
  if (payload.invoiceMethodId !== 2) {
    console.warn(
      "[PenguenTahakkuk] Fatura metodu 2 değil — tahakkuk görünümü üretilmedi, standart format kullanılmalı.",
      { invoiceMethodId: payload.invoiceMethodId },
    );
    return null;
  }

  const b = payload.breakdown as MethodInvoiceBreakdown;
  const sumPos = b.netEnergyKwh;
  const mahsupKwh = b.verisMahsupKwh;

  // eUP guard: tüm ay mahsuba giderse sumPos = 0 → sıfıra bölme. Varyant devre dışı.
  if (!(sumPos > 0)) {
    console.warn(
      "[PenguenTahakkuk] Net çekiş (sumPos) 0 — enerji birim fiyatı türetilemez; tahakkuk görünümü üretilmedi, standart format kullanılmalı.",
      { sumPos, mahsupKwh },
    );
    return null;
  }

  /* ── Tek kaynak türetmeler (iki kez hesap YOK) ─────────────────── */
  const eUP = b.energyCharge / sumPos;
  const grossKwh = sumPos + mahsupKwh; // sumCn
  const mahsupTutari = mahsupKwh * eUP;
  // subtotal'dan türediği için trafo / güç / güç aşımı / reaktif / YEK Farkı otomatik kapsanır.
  const elektrikGideri = b.subtotalBeforeVat - b.distributionCharge + mahsupTutari;
  const dagitimBedeli = b.distributionCharge;
  const indirilecekKdv = b.vatCharge;
  const digerDuzeltme = payload.digerDegerler + payload.yekdemMahsup;
  const borcToplam = elektrikGideri + dagitimBedeli + indirilecekKdv + digerDuzeltme;
  const digerSaticilar = borcToplam - mahsupTutari;

  const warnings: string[] = [];

  /* ── Dayanak bileşen kontrolü (Excel'den dayanak bloğu kalktı → denetim kodda) ──
     elektrikGideri, subtotal'dan türediği için fatura kalemlerinin toplamına
     İNŞAEN eşittir; tutmuyorsa breakdown self-consistent değildir (ör. subtotal'a
     bilinmeyen bir kalem girmiş). Bloklamaz — Excel yine üretilir, sessiz geçmez. */
  const bilesenler = {
    energyCharge: b.energyCharge,
    yekTahminiCharge: b.yekTahminiCharge ?? 0,
    yekFarkiCharge: b.yekFarkiCharge ?? 0,
    trafoCharge: b.trafoCharge,
    powerTotalCharge: b.powerTotalCharge,
    reactivePenaltyCharge: b.reactivePenaltyCharge,
    btvCharge: b.btvCharge,
    mahsupTutari,
  };
  const bilesenToplam = Object.values(bilesenler).reduce((s, v) => s + v, 0);
  const bilesenFark = bilesenToplam - elektrikGideri;
  if (Math.abs(bilesenFark) > TOL) {
    console.warn(
      "[PenguenTahakkuk] Dayanak bileşen toplamı ≠ Elektrik Gideri — breakdown self-consistent değil (bileşen dökümü):",
      { ...bilesenler, bilesenToplam, elektrikGideri, fark: bilesenFark },
    );
    warnings.push(
      `Dayanak kontrolü: fatura bileşen toplamı (${bilesenToplam.toFixed(2)}) ile Elektrik Gideri ` +
        `(${elektrikGideri.toFixed(2)}) arasında ${bilesenFark.toFixed(2)} TL fark var; kalem dökümü teyide muhtaçtır.`,
    );
  }

  /* ── Kapanış kimliği (zorunlu): digerSaticilar ≡ ödenecek toplam ── */
  const kapanisFark = digerSaticilar - payload.totalWithMahsup;
  const dengeFark = borcToplam - (mahsupTutari + digerSaticilar);
  const kapanisOk = Math.abs(kapanisFark) <= TOL && Math.abs(dengeFark) <= TOL;
  if (!kapanisOk) {
    console.warn("[PenguenTahakkuk] Kapanış farkı — sessizce yuvarlanmadı", {
      digerSaticilar,
      totalWithMahsup: payload.totalWithMahsup,
      kapanisFark,
      dengeFark,
    });
    warnings.push(
      `Tahakkuk kapanış farkı: ${kapanisFark.toFixed(4)} TL (Diğer Satıcılar, fatura genel toplamıyla eşleşmiyor).`,
    );
  }

  /* ── Etiketler / tarihler ──────────────────────────────────────── */
  const donemAyAdi = AY_ADLARI[(payload.periodMonth - 1 + 12) % 12];
  const mahsupAyAdi =
    MAHSUP_AY_ETIKETI === "donem"
      ? donemAyAdi
      : AY_ADLARI[(payload.periodMonth - 2 + 12) % 12];
  const sonGun = new Date(payload.periodYear, payload.periodMonth, 0).getDate();
  const donemSonuTarihi = `${String(sonGun).padStart(2, "0")}.${String(payload.periodMonth).padStart(2, "0")}.${payload.periodYear}`;

  /* ── Bölüm 1 — Özet ────────────────────────────────────────────── */
  const ozet: PenguenOzetSatir[] = [
    { kalem: "Elektrik Gideri", faturaTutari: elektrikGideri },
    { kalem: "Dağıtım Bedeli", faturaTutari: dagitimBedeli },
    { kalem: `GES Üretim Mahsup Tutarı (${mahsupAyAdi})`, faturaTutari: mahsupTutari },
  ];

  /* ── Bölüm 2 — Yevmiye fişleri ─────────────────────────────────── */
  const K = PENGUEN_HESAP_KODLARI;
  const giderToplam = elektrikGideri + dagitimBedeli;

  const fis1: PenguenFis = {
    id: "fis1",
    baslik: "Fiş 1 — Gider Tahakkuk Kaydı",
    tarihNotu: `Kayıt tarihi: dönem sonu (${donemSonuTarihi})`,
    editableFaturaAlanlari: false,
    satirlar: [
      { hesapKodu: K.elektrikGiderleri.kod, aciklama: K.elektrikGiderleri.ad, borc: giderToplam, alacak: null },
      { hesapKodu: K.giderTahakkuklari.kod, aciklama: K.giderTahakkuklari.ad, borc: null, alacak: giderToplam },
    ],
    toplamBorc: giderToplam,
    toplamAlacak: giderToplam,
  };

  const fis2: PenguenFis = {
    id: "fis2",
    baslik: "Fiş 2 — Gelir Tahakkuk Kaydı",
    tarihNotu: `Kayıt tarihi: dönem sonu (${donemSonuTarihi})`,
    editableFaturaAlanlari: false,
    satirlar: [
      { hesapKodu: K.gelirTahakkuklari.kod, aciklama: K.gelirTahakkuklari.ad, borc: mahsupTutari, alacak: null },
      { hesapKodu: K.enerjiUretimGeliri.kod, aciklama: K.enerjiUretimGeliri.ad, borc: null, alacak: mahsupTutari },
    ],
    toplamBorc: mahsupTutari,
    toplamAlacak: mahsupTutari,
  };

  const fis3Satirlar: PenguenFisSatir[] = [
    { hesapKodu: K.giderTahakkuklari.kod, aciklama: K.giderTahakkuklari.ad, borc: giderToplam, alacak: null },
    { hesapKodu: K.indirilecekKdv.kod, aciklama: K.indirilecekKdv.ad, borc: indirilecekKdv, alacak: null },
  ];
  if (digerDuzeltme !== 0) {
    // Pozitif düzeltme borca (gideri artırır), negatif düzeltme alacağa yazılır — fiş dengesi korunur.
    fis3Satirlar.push(
      digerDuzeltme > 0
        ? { hesapKodu: K.digerDuzeltme.kod, aciklama: K.digerDuzeltme.ad, borc: digerDuzeltme, alacak: null }
        : { hesapKodu: K.digerDuzeltme.kod, aciklama: K.digerDuzeltme.ad, borc: null, alacak: -digerDuzeltme },
    );
  }
  fis3Satirlar.push(
    { hesapKodu: K.gelirTahakkuklari.kod, aciklama: K.gelirTahakkuklari.ad, borc: null, alacak: mahsupTutari },
    { hesapKodu: K.digerSaticilar.kod, aciklama: K.digerSaticilar.ad, borc: null, alacak: digerSaticilar },
  );
  const fis3ToplamBorc = fis3Satirlar.reduce((s, r) => s + (r.borc ?? 0), 0);
  const fis3ToplamAlacak = fis3Satirlar.reduce((s, r) => s + (r.alacak ?? 0), 0);

  const fis3: PenguenFis = {
    id: "fis3",
    baslik: "Fiş 3 — Fatura Kaydı",
    tarihNotu: "Kayıt tarihi: fatura tarihi (aşağıdaki alanları doldurunuz)",
    editableFaturaAlanlari: true,
    satirlar: fis3Satirlar,
    toplamBorc: fis3ToplamBorc,
    toplamAlacak: fis3ToplamAlacak,
  };

  // Fiş dengeleri (inşaen tutar; tutmuyorsa veri tutarsızlığıdır — sessiz geçme).
  for (const fis of [fis1, fis2, fis3]) {
    const fark = fis.toplamBorc - fis.toplamAlacak;
    if (Math.abs(fark) > TOL) {
      console.warn(`[PenguenTahakkuk] ${fis.baslik}: Borç ≠ Alacak`, { fark });
      warnings.push(`${fis.baslik}: Borç − Alacak = ${fark.toFixed(4)} TL (denge tutmuyor).`);
    }
  }

  /* ── Bölüm 3 — Dayanak ─────────────────────────────────────────── */
  const dayanak: PenguenDayanak = {
    grossKwh,
    mahsupKwh,
    netKwh: sumPos,
    eUP,
    yekBedeli: b.yekTahminiCharge ?? 0,
    btvBedeli: b.btvCharge,
    dagitimBedeli,
    not:
      "Enerji gideri brüt çekiş üzerinden, faturanın enerji birim fiyatıyla hesaplanmıştır. " +
      "Mahsup aynı birim fiyatla gelir olarak gösterilmiştir; iki kalem netleştiğinde ödenecek tutar fatura ile birebir eşleşir.",
  };

  return {
    meta: {
      tesis: report.meta.tesis,
      serno: report.meta.serno,
      donem: report.meta.donem,
      donemKod: report.meta.donemKod,
      donemAyAdi,
      mahsupAyAdi,
      donemSonuTarihi,
      uretimZamani: report.meta.uretimZamani,
    },
    ozet,
    fisler: [fis1, fis2, fis3],
    dayanak,
    degerler: {
      eUP,
      elektrikGideri,
      dagitimBedeli,
      indirilecekKdv,
      digerDuzeltme,
      mahsupTutari,
      borcToplam,
      digerSaticilar,
    },
    kapanis: { ok: kapanisOk, fark: kapanisFark, tol: TOL },
    warnings,
  };
}
