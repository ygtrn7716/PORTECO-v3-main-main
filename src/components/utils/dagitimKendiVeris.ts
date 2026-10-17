// src/components/utils/dagitimKendiVeris.ts
//
// Metot 1 "DAĞITIM KENDİ VERİŞİYLE" (MEPAŞ/MEDAŞ usulü) — SAF hesap.
//
// subscription_settings.dagitim_kendi_veris = true olan tesiste dağıtım bedeli tesisin
// KENDİ ham sayacıyla hesaplanır (havuz tahsisi / p1 fazlası / allocated_ges ETKİLEMEZ):
//
//   C = ham Σcn + trafo kWh        G = tesisin kendi ham Σgn        D = dagitim_bedeli
//   birim_eff = round6( D × (C − min(G, C)/2) / C )      (C = 0 → 0)
//             = G ≥ C ? D/2 : D × (1 − G/(2C))
//   Perakende "Elektrik Dağıtım Bedeli" = round2(C × birim_eff)
//   G > C → AYRI MEDAŞ veriş faturası (Sistem Kullanım Bedeli):
//           (G − C) × dagitim_uretici_1  (+ KDV; perakende toplamına GİRMEZ)
//
// Yuvarlama HALF-UP ve epsilon-güvenli: D/2 = 0,5912285 → 0,591229. Float'ta
// D×(C−C/2)/C bazı C'lerde 0,59122849999999993 çıkar; naif Math.round(x·1e6)
// 591228'e düşer (golden 105177,42 yerine 105177,24). roundHalfUp bunu önler.
//
// Metot 7 (Meram) dağıtımı da bu helper'ı kullanır (calculateInvoiceNetMethods.ts;
// 2026-10-14): MEPAŞ Ağustos/Eylül faturaları round6 birim + round2 tutarla kuruşu
// kuruşuna tuttu. m7'de C = sumCn (saatlik t dahil), G = meram.ownGnTotal.
//
// ⚠️ SIFIR IMPORT: kabul testleri (tsx) bu modülü doğrudan yükler.

/**
 * Half-up (sıfırdan uzağa) yuvarlama, float gürültüsüne dayanıklı:
 * |x|×10^dp önce 15 anlamlı basamağa sabitlenir (…49999999993 → …5), sonra yuvarlanır.
 * Geçerli aralık |x|×10^dp < 1e13 (para/birim fiyat için fazlasıyla yeterli).
 */
export function roundHalfUp(x: number, dp: number): number {
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** dp;
  const scaled = Number((Math.abs(x) * f).toPrecision(15));
  const r = Math.round(scaled) / f;
  return x < 0 ? -r : r;
}

export type DagitimKendiVerisInput = {
  /** C — tesisin ham sayaç çekişi + trafo kaybı (kWh). */
  cKwh: number;
  /** G — tesisin KENDİ ham verişi (kWh), havuz tahsisinden bağımsız. */
  gKwh: number;
  /** D — distribution_tariff_official.dagitim_bedeli (efektif; birim override'ı dahil). */
  dagitimBedeli: number;
  /** MEDAŞ Sistem Kullanım Bedeli birimi — distribution_tariff_official.dagitim_uretici_1. */
  ureticiBirim: number;
};

export type DagitimKendiVerisResult = {
  /** round6(D × (C − min(G,C)/2) / C); C = 0 → 0. */
  birimEff: number;
  /** Perakende dağıtım = round2(C × birimEff). */
  dagitimTutari: number;
  /** Veriş kaynaklı indirim = round2(C × D) − dagitimTutari. */
  indirimTutari: number;
  /** max(0, G − C) — MEDAŞ veriş faturası kWh'ı. */
  medasKwh: number;
  /** ureticiBirim (dagitim_uretici_1). */
  medasBirim: number;
  /** round2(medasKwh × medasBirim) — KDV hariç, perakende toplamına dahil DEĞİL. */
  medasBedeli: number;
};

const nonNeg = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

export function hesaplaDagitimKendiVeris(p: DagitimKendiVerisInput): DagitimKendiVerisResult {
  const C = nonNeg(p.cKwh);
  const G = nonNeg(p.gKwh);
  const D = nonNeg(p.dagitimBedeli);
  const u = nonNeg(p.ureticiBirim);

  const birimEff = C > 0 ? roundHalfUp((D * (C - Math.min(G, C) / 2)) / C, 6) : 0;
  const dagitimTutari = roundHalfUp(C * birimEff, 2);
  const indirimTutari = roundHalfUp(roundHalfUp(C * D, 2) - dagitimTutari, 2);
  const medasKwh = Math.max(0, G - C);
  const medasBedeli = roundHalfUp(medasKwh * u, 2);

  return { birimEff, dagitimTutari, indirimTutari, medasKwh, medasBirim: u, medasBedeli };
}
