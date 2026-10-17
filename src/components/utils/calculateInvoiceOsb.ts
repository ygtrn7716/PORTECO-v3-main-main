// src/components/utils/calculateInvoiceOsb.ts
//
// Metod 8 — Kayseri OSB fatura motoru (SAF).
//
// AYTEKS Ağustos 2026 OSB bildirimi (105013200 üretim tesisi, 107183100, 107196200) ile
// kuruşuna çözüldü. Tesis başına, dönem = fatura ayı:
//   C = brüt aktif tüketim (Σcn) · M = tahsis edilen mahsup (görünüm yoksa kendi saatlik
//   netleşmesi) · N = C − M · G = ownGnTotal · P = OSB aylık enerji fiyatı ·
//   üretim tesisi = G > 0
//   1. Aktif Enerji                      = N × P
//   2. Endüktif / Kapasitif (ceza varsa) = RI/C > %20 ? RI × r · RC/C > %KAP ? RC × r
//   3. YEKDEM Fiyat Farkı                = önceki ay N × YEKDEM fark birimi
//   4. İletim (Aktif Tüketim Payı)       = C × iletim                      (hepsi, brüt)
//   5. OSB Dağıtım Sistemi Kullanım      = C × osbDagitim                  (üretim tesisi DEĞİLSE)
//   6. Lisanssız Üretim ÇEKİŞ (DBÇ×0,5)  = C × cekis                       (yalnız üretim tesisi)
//   7. Lisanssız Üretim VERİŞ Dağıtım    = max(0, G − C) × dagitim_uretici_1 (yalnız üretim tesisi)
//   8. ETV                               = btv × C × P                     (BRÜT tüketim)
//   KDV = kdv × (1..8) · Trafo yok, güç 0, sonraki ay YEKDEM mahsubu yok.
//
// Girdiler `methodInputs.osb`'de (hourlyNetAggregates.assembleOsbInputs / snapshot replay).
// Eksik fiyat veya ek bedel SESSİZCE 0 sayılmaz: OsbInvoiceInputError fırlatılır.
//
// ⚠️ Yalnız `import type` + import'suz calculateInvoiceNetMethods — kabul testi (tsx)
// bu modülü doğrudan yükler.

import type {
  AppliedInvoiceOverrides,
  InvoiceLineOverride,
  InvoiceOverrideItemKey,
  InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";
import {
  resolveYekFarkiWithOverride,
  type InvoiceMethodInputs,
  type MethodInvoiceBreakdown,
  type MethodInvoiceInput,
} from "@/components/utils/calculateInvoiceNetMethods";

/** Endüktif reaktif ceza sınırı (%, RI / C). */
export const OSB_ENDUKTIF_SINIR_YUZDE = 20;
/** Kapasitif reaktif ceza sınırı (%, RC / C). OSB teyidi bekleniyor (AYTEKS 105013200'de
 *  %18,03 cezalandırılmadı → ≥ %18,03). TEK KAYNAK — teyitte yalnız bu satır değişir. */
export const OSB_KAPASITIF_SINIR_YUZDE = 20;

/** Metod 8 girdisi eksik/geçersiz — UI'da görünür hata olarak gösterilir (0 varsayılmaz). */
export class OsbInvoiceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OsbInvoiceInputError";
  }
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const isFin = (v: unknown): v is number => v != null && Number.isFinite(Number(v));

export function calculateInvoiceMethod8(
  input: MethodInvoiceInput,
  overrides?: InvoiceOverrides | null,
  methodInputs?: InvoiceMethodInputs
): MethodInvoiceBreakdown {
  const m = methodInputs ?? input.methodInputs;
  const o = m?.osb;
  if (!m || !o) {
    throw new OsbInvoiceInputError("Metot 8 (Kayseri OSB) girdileri kurulamadı.");
  }
  if (!o.ekBedel) {
    throw new OsbInvoiceInputError(
      `Kayseri ek bedelleri tanımlı değil (${o.donem}) — kayseri_ek_bedeller satırı girilmeden OSB faturası hesaplanmaz.`
    );
  }
  const ov = overrides ?? null;

  const C = num(m.sumCn);
  const N = num(m.sumPos);
  const M = num(m.sumMahsup);
  const G = num(o.ownGnTotal);
  const uretimTesisi = G > 0;

  // ── P: 'enerji' birim override'ı > OSB aylık fiyatı. İkisi de yoksa görünür hata.
  const enerjiUnitOv = ov?.enerji?.unitPriceOverride;
  const P = isFin(enerjiUnitOv)
    ? Number(enerjiUnitOv)
    : isFin(o.enerjiFiyati)
      ? Number(o.enerjiFiyati)
      : NaN;
  if (!Number.isFinite(P)) {
    throw new OsbInvoiceInputError(
      `Kayseri OSB aylık enerji fiyatı yok (${o.donem}) — Admin › OSB Aylık Fiyatları'na girilmeli.`
    );
  }

  // ── 1) Aktif enerji — net (mahsup sonrası) tüketim
  let aktifEnerji = N * P;

  // ── 2) Reaktif: payload override'ı (ri_kwh/rc_kwh) ham toplamların MUTLAK yerine geçer.
  const reaktifOv = ov?.reaktif;
  const riKwh = isFin(reaktifOv?.payload?.ri_kwh) ? Number(reaktifOv!.payload!.ri_kwh) : num(o.riKwh);
  const rcKwh = isFin(reaktifOv?.payload?.rc_kwh) ? Number(reaktifOv!.payload!.rc_kwh) : num(o.rcKwh);
  const riYuzde = C > 0 ? (riKwh / C) * 100 : 0;
  const rcYuzde = C > 0 ? (rcKwh / C) * 100 : 0;
  const r = num(o.reaktifBirim);
  let enduktif = riYuzde > OSB_ENDUKTIF_SINIR_YUZDE ? riKwh * r : 0;
  let kapasitif = rcYuzde > OSB_KAPASITIF_SINIR_YUZDE ? rcKwh * r : 0;

  // ── 3) YEKDEM fiyat farkı = önceki ay N × fark birimi. m2 "YEK Farkı" köprüsü PAYLAŞILIR:
  // tahmini 0, gerçekleşen = fark birimi, KBK 1 → prevN × birim; 'yekdem_mahsup' payload'ı
  // total_kwh = manuel önceki ay N, diff_yekdem = manuel birim olarak çalışır (manuel kazanır).
  const yekdemFark = resolveYekFarkiWithOverride({
    prevSumPos: m.prevSumPos,
    prevTahminiYekdem: 0,
    prevGerceklesenYekdem: num(o.yekdemFarkBirim),
    kbk: 1,
    override: ov?.yekdem_mahsup,
  });

  // ── 4-7) Şebeke kalemleri (ek bedeller + tarife)
  const ek = o.ekBedel;
  const iletim = C * num(ek.iletim);
  const osbDagitim = uretimTesisi ? 0 : C * num(ek.osbDagitim);
  const cekis = uretimTesisi ? C * num(ek.cekis) : 0;
  const verisDagitimKwh = uretimTesisi ? Math.max(0, G - C) : 0;
  const verisDagitim = verisDagitimKwh * num(o.verisDagitimBirim);

  // ── 8) ETV — BRÜT tüketim × efektif P (override öncesi hesaplanır; tutar override'ları
  // matraha akmaz — diğer metodlarla aynı kural).
  let etv = num(input.btvRate) * C * P;

  // ── Kalem override'ları (isExcluded > amountOverride)
  const excludedItems: InvoiceOverrideItemKey[] = [];
  const amountOverriddenItems: InvoiceOverrideItemKey[] = [];
  const applyItem = (key: InvoiceOverrideItemKey, current: number): number => {
    const item: InvoiceLineOverride | undefined = ov?.[key];
    if (!item) return current;
    if (item.isExcluded) {
      excludedItems.push(key);
      return 0;
    }
    if (isFin(item.amountOverride)) {
      amountOverriddenItems.push(key);
      return Number(item.amountOverride);
    }
    return current;
  };

  aktifEnerji = applyItem("enerji", aktifEnerji);
  etv = applyItem("btv", etv);
  const reaktifNatural = enduktif + kapasitif;
  const reaktif = applyItem("reaktif", reaktifNatural);
  const reaktifOverride = reaktif !== reaktifNatural;
  if (reaktifOverride) {
    // Toplam override'landı → kalem ayrımı gösterilemez; tek tutar endüktif satırında.
    enduktif = reaktif;
    kapasitif = 0;
  }
  if (yekdemFark.excluded) excludedItems.push("yekdem_mahsup");
  else if (yekdemFark.overridden) amountOverriddenItems.push("yekdem_mahsup");

  const distributionCharge = iletim + osbDagitim + cekis + verisDagitim;
  const subtotalBeforeVat =
    aktifEnerji + reaktif + yekdemFark.amount + iletim + osbDagitim + cekis + verisDagitim + etv;
  const vatCharge = subtotalBeforeVat * num(input.vatRate);
  const totalInvoice = subtotalBeforeVat + vatCharge;

  const appliedOverrides: AppliedInvoiceOverrides | null =
    excludedItems.length > 0 || amountOverriddenItems.length > 0 || isFin(enerjiUnitOv)
      ? {
          excludedItems,
          amountOverriddenItems,
          unitPriceEnergyOverridden: isFin(enerjiUnitOv),
          unitPriceDistributionOverridden: false,
        }
      : null;

  return {
    energyCharge: aktifEnerji,
    trafoCharge: 0,
    distributionCharge,
    distributionBaseKwh: C,
    distributionAdjustment: 0,
    distributionChargeKwh: C,
    verisKwh: num(m.sumGn),
    effectiveDistributionUnitPrice: C > 0 ? distributionCharge / C : 0,
    netEnergyKwh: N,
    netEnergyCharge: N * P,
    btvCharge: etv,
    powerBaseCharge: 0,
    powerExcessCharge: 0,
    powerTotalCharge: 0,
    reactivePenaltyCharge: reaktif,
    verisMahsupKwh: M,
    verisFazlaKwh: num(m.sumExcess),
    // Mahsup net enerjide örtük (m2/m5 "implicit-net" gibi) → faturadan düşülen kredi yok.
    verisMahsupBedeli: 0,
    verisFazlaBedeli: 0,
    verisSatisBedeli: 0,
    subtotalBeforeVat,
    vatCharge,
    totalInvoice,
    energyUnitPriceApplied: P,
    osb: {
      aktifEnerji,
      enduktif,
      kapasitif,
      riKwh,
      rcKwh,
      riYuzde,
      rcYuzde,
      enduktifSinirYuzde: OSB_ENDUKTIF_SINIR_YUZDE,
      kapasitifSinirYuzde: OSB_KAPASITIF_SINIR_YUZDE,
      reaktifOverride,
      yekdemFiyatFarki: yekdemFark.amount,
      oncekiAyNetKwh: isFin(m.prevSumPos) ? Number(m.prevSumPos) : null,
      yekdemFarkBirim: num(o.yekdemFarkBirim),
      iletim,
      osbDagitim,
      cekis,
      verisDagitim,
      verisDagitimKwh,
      enerjiVeGucToplami: aktifEnerji,
      etv,
      uretimTesisi,
      enerjiFiyati: P,
      fiyatTahmini: o.fiyatTahmini === true && !isFin(enerjiUnitOv),
      fiyatDonemi: o.fiyatDonemi,
      consKwh: C,
      mahsupKwh: M,
      netKwh: N,
      ownGnKwh: G,
      birimler: {
        iletim: num(ek.iletim),
        osbDagitim: num(ek.osbDagitim),
        cekis: num(ek.cekis),
        verisDagitim: num(o.verisDagitimBirim),
        reaktif: r,
      },
    },
    ...(appliedOverrides ? { appliedOverrides } : {}),
  };
}
