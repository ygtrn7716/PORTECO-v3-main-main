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

// 10 yıl üstü tesislerin veriş fazlası satış birim fiyatı (USD/kWh).
// Toplam birim fiyat (TL/kWh) = VERIS_USD_BIRIM_FIYAT × usd_kur.
export const VERIS_USD_BIRIM_FIYAT = 0.133;

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
   *  (dagitim_uretici_1/2). */
  dagitimBedeli: number;
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

  // Dağıtım kesintisi: seçilen oran × satış kWh.
  const satisDagitimKesintisi = satisKwh * dagitimBedeli;
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
  };
}
