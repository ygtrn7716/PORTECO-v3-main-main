// src/lib/ges/gesUretimSatisi.ts
//
// GES "Devlete Satılan Enerji Bedeli" (veriş fazlası satışı) hesabı — TEK KAYNAK.
//
// Hem GES sayfası (EnergySoldCard) hem fatura görünümleri (InvoiceDetail,
// InvoiceSnapshotDetail, ConsumptionDetail canlı tahmin) bu fonksiyonu kullanır.
// Böylece "satılan üretim net geliri" formülü tek yerde durur.
//
// BRÜT GELIR (iki mod — on_yil belirler):
//   • on_yil = true  ve  usd_kur > 0 →  satisKwh × 0.133 × usd_kur   (USD bazlı)
//   • aksi halde (10 yıl altı VEYA usd_kur tanımsız) →
//     satisKwh × perakende_enerji_bedeli                              (TL fallback)
//
// DAĞITIM KESİNTİSİ (lisansli_satis belirler — tarife satırından okunur, çağıran seçer):
//   lisansli_satis = true  → dagitim_uretici_1 (lisanslı satış üretici)
//   lisansli_satis = false → dagitim_uretici_2 (lisanslı olmayan üretici)
// on_yil dağıtım kesintisini ETKİLEMEZ; yalnızca brüt birim fiyat kuralını yönetir.
//
// NET GELIR = brüt gelir − dağıtım kesintisi.
//
// MEDAŞ USULÜ (Metot 1 "dağıtım kendi verişiyle", subscription_settings.dagitim_kendi_veris):
// kesinti oran × kWh DEĞİL — satışın aktığı bayraklı tesislerin AYRI MEDAŞ veriş
// faturalarının (Sistem Kullanım Bedeli, (G − C) × dagitim_uretici_1, KDV hariç)
// toplamıdır (`medasKesinti`, src/lib/ges/medasVerisKesinti.ts kurar).
//
// TREPAŞ m3 2026-09+ KESİNTİ TABANI (subscription_settings.ges_sale_dist_basis, tesis bazlı):
//   total_veris (varsayılan) → toplam veriş Σgn (satılan + mahsup) × D/2
//   sold_only               → yalnız satılan veriş (satisKwh) × D/2
// Taban yalnız kartı etkiler; motor / tredasGesDagitim / ana fatura değişmez. Snapshot'a
// damgalanır (invoice_snapshots.ges_sale_dist_basis) → replay dönemi dondurur.

/** GES satış kartı Trepaş dağıtım kesintisi kWh tabanı. */
export type GesSaleDistBasis = "total_veris" | "sold_only";

/** DB değeri → taban. Yalnız 'sold_only' tanınır; diğer her şey (null, eski satır, bozuk
 *  değer) → 'total_veris' (fail-safe: eski davranış). */
export function parseGesSaleDistBasis(v: unknown): GesSaleDistBasis {
  return v === "sold_only" ? "sold_only" : "total_veris";
}

// 10 yıl üstü tesislerin veriş fazlası satış birim fiyatı (USD/kWh).
// Toplam birim fiyat (TL/kWh) = VERIS_USD_BIRIM_FIYAT × usd_kur.
export const VERIS_USD_BIRIM_FIYAT = 0.133;

/** Satış kartına akan bir tesisin MEDAŞ veriş faturası satırı. */
export type MedasKesintiSatiri = {
  serno: number;
  label: string;
  /** max(0, G − C) kWh. */
  kwh: number;
  /** dagitim_uretici_1 (TL/kWh). */
  birim: number;
  /** round2(kwh × birim), KDV hariç. */
  bedeli: number;
};

/** MEDAŞ usulü satış kesintisi — bayraklı katkıcıların veriş faturaları toplamı. */
export type MedasKesinti = {
  /** Σ satır bedeli (TL, KDV hariç). */
  tutar: number;
  satirlar: MedasKesintiSatiri[];
  /** Hesap yapılamadıysa görünür hata metni (tutar 0; oran kesintisine DÜŞÜLMEZ). */
  hata?: string;
  /** Bilgi uyarıları (ör. bayraksız katkıcı). */
  uyarilar?: string[];
};

export interface GesUretimSatisiInput {
  /** Satılan veriş kWh (fazla üretim). Fatura tarafında breakdown.verisFazlaKwh ile
   *  birebir; GES sayfasında max(0, toplamVeriş − toplamÇekiş). */
  satisKwh: number;
  /** 10 yıl üstü tesis mi (satış birim fiyatı USD/perakende seçimi için). */
  onYil: boolean;
  /** Ay sonu USD/TL kuru. 0 ise perakende fallback. */
  usdKur: number;
  /** Perakende enerji bedeli (TL/kWh) — TL fallback birim fiyatı. */
  perakendeEnerjiBedeli: number;
  /** Dağıtım kesinti oranı (TL/kWh) — lisansli_satis'e göre çağıran seçer
   *  (dagitim_uretici_1/2). Trepaş 2026-09+ m3: dağıtım tarifesinin yarısı (D/2). */
  dagitimBedeli: number;
  /** Dağıtım kesintisinin kWh tabanı. Verilmezse satisKwh (eski davranış). Trepaş
   *  2026-09+ m3: toplam veriş Σgn (satılan + mahsup) — gesSatisKesintiArgs üretir. */
  kesintiKwh?: number;
  /** 'sold_only' tabanı (Trepaş m3, ges_sale_dist_basis): kesinti kWh = satisKwh; kesintiKwh
   *  yok sayılır. gesSatisKesintiArgs üretir. */
  kesintiTabani?: "sold_only";
  /** MEDAŞ usulü: verilirse kesinti = medasKesinti.tutar (oran/kWh yok sayılır). */
  medasKesinti?: MedasKesinti;
}

export interface GesUretimSatisiResult {
  satisKwh: number;
  satisModu: "usd" | "perakende";
  satisUsdKur: number;       // 0 = USD modu kullanılmadı
  perakendeRate: number;     // TL/kWh — her durumda gösterilebilir
  satisBrutBirim: number;    // TL/kWh — gerçekten uygulanan birim fiyat
  satisBrutGelir: number;    // TL
  dagitimBedeli: number;     // TL/kWh
  satisDagitimKesintisi: number; // TL
  /** Kesinti tabanı satisKwh'dan farklıysa (Trepaş m3 2026-09+) dolu; aksi halde YOK. */
  kesintiKwh?: number;
  /** 'sold_only' tabanında dolu (kesintiKwh = satisKwh); aksi halde anahtar YOK. */
  kesintiTabani?: "sold_only";
  /** MEDAŞ usulü kesinti ayrıntısı (yalnız verildiyse; aksi halde anahtar YOK). */
  medasKesinti?: MedasKesinti;
  satisNetGelir: number;     // TL (brüt − kesinti)
}

export function calculateGesUretimSatisi(
  input: GesUretimSatisiInput
): GesUretimSatisiResult {
  const satisKwh = input.satisKwh > 0 ? input.satisKwh : 0;
  const onYil = input.onYil;
  const usdKur = input.usdKur > 0 ? input.usdKur : 0;
  const perakendeRate = input.perakendeEnerjiBedeli > 0 ? input.perakendeEnerjiBedeli : 0;
  const dagitimBedeli = input.dagitimBedeli > 0 ? input.dagitimBedeli : 0;

  // Brüt gelir: USD modu yalnızca on_yil=true && usd_kur>0
  const satisModu: "usd" | "perakende" = onYil && usdKur > 0 ? "usd" : "perakende";
  const satisBrutBirim =
    satisModu === "usd" ? VERIS_USD_BIRIM_FIYAT * usdKur : perakendeRate;
  const satisBrutGelir = satisKwh > 0 ? satisKwh * satisBrutBirim : 0;

  // Dağıtım kesintisi: seçilen oran × satış kWh (Trepaş m3 2026-09+: × toplam veriş;
  // 'sold_only' tabanında × satılan veriş).
  // MEDAŞ usulü: kesinti = bayraklı katkıcıların MEDAŞ veriş faturaları toplamı.
  const medas = input.medasKesinti;
  const soldOnly = medas == null && input.kesintiTabani === "sold_only";
  const kesintiKwh = soldOnly
    ? satisKwh
    : input.kesintiKwh != null && Number.isFinite(input.kesintiKwh)
      ? Math.max(0, input.kesintiKwh)
      : undefined;
  const medasTutar =
    medas && Number.isFinite(medas.tutar) ? Math.max(0, medas.tutar) : null;
  const satisDagitimKesintisi =
    medasTutar != null ? medasTutar : (kesintiKwh ?? satisKwh) * dagitimBedeli;
  const satisNetGelir = satisBrutGelir - satisDagitimKesintisi;

  return {
    satisKwh,
    satisModu,
    satisUsdKur: usdKur,
    perakendeRate,
    satisBrutBirim,
    satisBrutGelir,
    dagitimBedeli,
    satisDagitimKesintisi,
    satisNetGelir,
    ...(medas == null && kesintiKwh != null ? { kesintiKwh } : {}),
    ...(soldOnly ? { kesintiTabani: "sold_only" as const } : {}),
    ...(medas != null ? { medasKesinti: medas } : {}),
  };
}

/** Fatura breakdown'ından GES satış kesinti argümanları. Trepaş 2026-09+ m3 breakdown'ı
 *  (tredasGesDagitim) varsa kesinti = Σgn × D/2 (GES üretim dağıtım faturası) — tesis tabanı
 *  'sold_only' ise satılan veriş × D/2; MEDAŞ usulü (medas verildiyse) kesinti = MEDAŞ veriş
 *  faturaları toplamı; aksi halde çağıranın oranı (dagitim_uretici_1/2 veya donmuş
 *  ges_satis_dagitim_bedeli) aynen. Taban Trepaş yolu dışında YOK SAYILIR. */
export function gesSatisKesintiArgs(
  // object: InvoiceBreakdown (m1 tipi) de kabul edilsin — alan yalnız m3 breakdown'ında var.
  breakdown: object | null | undefined,
  fallbackRate: number,
  medas?: MedasKesinti | null,
  basis?: GesSaleDistBasis | null
): {
  dagitimBedeli: number;
  kesintiKwh?: number;
  kesintiTabani?: "sold_only";
  medasKesinti?: MedasKesinti;
} {
  if (medas) return { dagitimBedeli: fallbackRate, medasKesinti: medas };
  const t = (breakdown as { tredasGesDagitim?: { kwh: number; birim: number } } | null | undefined)
    ?.tredasGesDagitim;
  if (!t) return { dagitimBedeli: fallbackRate };
  return basis === "sold_only"
    ? { dagitimBedeli: t.birim, kesintiTabani: "sold_only" }
    : { dagitimBedeli: t.birim, kesintiKwh: t.kwh };
}
