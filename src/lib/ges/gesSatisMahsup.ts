// src/lib/ges/gesSatisMahsup.ts
//
// GES mahsup + devlete satış AYRIMI — TEK KAYNAK.
//
// Fatura sayfasının (InvoiceDetail) metod-bazlı render kurallarını tek bir saf
// fonksiyonda toplar; GES sayfası (EnergySoldCard) aynı fonksiyonu çağırarak
// fatura ile kuruşu kuruşuna aynı ayrımı gösterir. SORGU/YAZMA YOK.
//
// Metod-bazlı kurallar (her biri InvoiceDetail'deki mevcut render'ın aynası):
//   • Satış kWh: Metod 4'te dönem TOPLAM üretimi (mahsup yok, excess değil);
//     diğer metotlarda breakdown.verisFazlaKwh.
//   • Mahsup sunumu:
//       Metod 1  → "Veriş Mahsup" satırı: kWh × efektif enerji birim fiyatı.
//       Metod 2  → faturada ayrı satır YOK (enerji bedeli saatlik mahsup sonrası
//                  net tüketim üzerinden) → yalnız kWh gösterilir, TL uydurulmaz.
//       Metod 3  → "Muhtelif-2" kalemi: +dağıtım − mahsuplaşma kredisi.
//       Metod 4  → mahsuplaşma kavramı yok.
//       Lisanslı → mahsuplaşma kapalı, tüm veriş satılır (calculateInvoice.ts:316+).

import {
  calculateGesUretimSatisi,
  type GesUretimSatisiResult,
} from "@/lib/ges/gesUretimSatisi";
import { isNetInvoiceMethod, type InvoiceMethodId } from "@/lib/invoiceMethods";
import type { MethodInvoiceBreakdown } from "@/components/utils/calculateInvoiceNetMethods";

/** Mahsup kartının metod-bazlı sunum şekli. */
export type GesMahsupPresentation =
  | {
      /** Metod 1 (ve M1'e düşen replay'ler): faturadaki "Veriş Mahsup" satırı. */
      kind: "unit-price";
      kwh: number;
      /** Mahsup satırında UYGULANAN birim fiyat — TL/kWh (2K: tavan kırptıysa
       *  perakende; aksi halde efektif enerji fiyatı). */
      unitPrice: number;
      /** kwh × unitPrice — InvoiceDetail'deki satırla aynı çarpım. */
      tutar: number;
      /** Aşama 2K: perakende tavanı kırptı (satırdaki "(perakende tavanı)" notu). */
      capUygulandi?: boolean;
    }
  | {
      /** Metod 2: mahsup örtük (net enerji bazı) — faturada TL satırı yok. */
      kind: "implicit-net";
      kwh: number;
    }
  | {
      /** Metod 6 (Kepsaş): veriş faturaya YANSIMAZ (mahsup/kredi yok). Veriş kWh
       *  yalnız BİLGİ olarak gösterilir; TL kredi yoktur. */
      kind: "info-only";
      kwh: number;
    }
  | {
      /** Metod 3: Muhtelif-2 kalemi. */
      kind: "muhtelif2";
      kwh: number;
      /** Mahsuplaşma birim fiyatı (TL/kWh) — mahsuplasmaUnitPriceApplied. */
      unitPrice: number;
      /** Mahsuplaşma kredisi (pozitif TL, matrahta düşülür). */
      kredi: number;
      /** Muhtelif-2 dağıtım bileşeni (+TL). */
      dagitim: number;
      /** Muhtelif-2 net (dağıtım − kredi). */
      net: number;
    }
  | {
      /** Mahsup gösterilmez. */
      kind: "none";
      reason: "method4" | "lisansli" | "zero";
    };

export type GesSatisMahsupResult = {
  /** Damgalanmış/çözülmüş metod (satış kuralı bunun üzerinden). */
  invoiceMethodId: InvoiceMethodId;
  /** Sunum metodu: M2/3 ama breakdown M1 çekirdeğinden geldiyse (lisanslı veya
   *  w_pos'suz eski snapshot replay'i) 1'e düşer — dispatcher'ın kendi
   *  fallback'inin aynası (invoiceMethods.ts calculateInvoiceForMethod). */
  effectiveMethodId: InvoiceMethodId;
  mahsup: GesMahsupPresentation;
  /** breakdown.verisMahsupKwh (bilgi amaçlı; mahsup.kind "none" olsa da dolu). */
  mahsupKwh: number;
  /** Metod 4 kuralı emilmiş satış kWh'ı. */
  satisKwh: number;
  /** satisKwh > 0 ise satış hesabı, değilse null. */
  satis: GesUretimSatisiResult | null;
};

export function deriveGesSatisMahsup(args: {
  invoiceMethodId: InvoiceMethodId;
  breakdown: MethodInvoiceBreakdown;
  /** Dönem toplam üretimi (Σ efektif gn) — yalnız Metod 4 satış kuralında kullanılır. */
  totalProductionKwh: number;
  lisansliSatis: boolean;
  onYil: boolean;
  usdKur: number;
  perakendeEnerjiBedeli: number;
  /** GES satış dağıtım kesinti oranı (TL/kWh): donmuş snap.ges_satis_dagitim_bedeli
   *  (resolveGesSatisDagitimRate) veya canlı dagitimUreticiBedeli. */
  dagitimBedeli: number;
  /** EFEKTİF (override uygulanmış) enerji birim fiyatı — M1 mahsup satırı için. */
  unitPriceEnergy: number;
}): GesSatisMahsupResult {
  const { invoiceMethodId, breakdown } = args;

  // M2/3/5 breakdown'ı gerçekten net motordan mı geldi? (lisanslı ve w_pos'suz
  // eski snapshot'lar M1 çekirdeğine düşer; wPosApplied yalnız net motorda var.)
  const effectiveMethodId: InvoiceMethodId =
    isNetInvoiceMethod(invoiceMethodId) && breakdown.wPosApplied === undefined
      ? 1
      : invoiceMethodId;

  const mahsupKwh = Math.max(0, breakdown.verisMahsupKwh);

  // Satış kWh — InvoiceDetail satış kartı kuralının birebir kopyası:
  // Metod 4'te mahsup yok → satılan veriş = dönem TOPLAM üretimi (excess değil).
  const satisKwh =
    invoiceMethodId === 4
      ? Math.max(0, args.totalProductionKwh)
      : Math.max(0, breakdown.verisFazlaKwh);

  const satis =
    satisKwh > 0
      ? calculateGesUretimSatisi({
          satisKwh,
          onYil: args.onYil,
          usdKur: args.usdKur,
          perakendeEnerjiBedeli: args.perakendeEnerjiBedeli,
          dagitimBedeli: args.dagitimBedeli,
        })
      : null;

  let mahsup: GesMahsupPresentation;
  if (invoiceMethodId === 4) {
    mahsup = { kind: "none", reason: "method4" };
  } else if (invoiceMethodId === 6) {
    // Kepsaş (Aşama 2L-R): fatura tabanında üretim etkileri sıfırlanır → breakdown'da
    // veriş mahsup/fazla 0'dır. GES sayfası veriş kWh'ını (dönem toplam üretimi)
    // yalnız BİLGİ olarak gösterir; TL kredi yok, fatura toplamına yansımaz.
    mahsup = { kind: "info-only", kwh: Math.max(0, args.totalProductionKwh) };
  } else if (args.lisansliSatis) {
    mahsup = { kind: "none", reason: "lisansli" };
  } else if (!(mahsupKwh > 0)) {
    mahsup = { kind: "none", reason: "zero" };
  } else if (effectiveMethodId === 2 || effectiveMethodId === 5) {
    // m5 = m2 kopyası: mahsup net faturalamada örtük, ayrı kredi satırı yok.
    mahsup = { kind: "implicit-net", kwh: mahsupKwh };
  } else if (effectiveMethodId === 3) {
    mahsup = {
      kind: "muhtelif2",
      kwh: mahsupKwh,
      unitPrice: breakdown.mahsuplasmaUnitPriceApplied ?? 0,
      kredi: breakdown.muhtelif2MahsupKredisi ?? 0,
      dagitim: breakdown.muhtelif2Dagitim ?? 0,
      net: breakdown.muhtelif2Net ?? 0,
    };
  } else {
    // 2K: motorun UYGULADIĞI fiyat/tutar esas — fatura satırıyla birebir
    // (tavansızken kwh × birim aynı operandlarla bit-identik çarpımdır).
    const unitPrice = breakdown.verisMahsupBirimFiyat ?? args.unitPriceEnergy;
    mahsup = {
      kind: "unit-price",
      kwh: mahsupKwh,
      unitPrice,
      tutar: breakdown.verisMahsupBedeli ?? mahsupKwh * unitPrice,
      ...(breakdown.verisMahsupCapUygulandi ? { capUygulandi: true } : {}),
    };
  }

  return { invoiceMethodId, effectiveMethodId, mahsup, mahsupKwh, satisKwh, satis };
}
