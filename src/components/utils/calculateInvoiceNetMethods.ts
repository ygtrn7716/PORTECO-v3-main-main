//src/components/utils/calculateInvoiceNetMethods.ts
import type {
  InvoiceBreakdown,
  InvoiceInput,
} from "@/components/utils/calculateInvoice";
import type {
  AppliedInvoiceOverrides,
  InvoiceLineOverride,
  InvoiceOverrideItemKey,
  InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";

/**
 * Metod 2 (Uedaş), Metod 3 (Tredaş), Metod 5 (İpragaz) ve Metod 7 (Meram / MEPAŞ)
 * fatura motorları — Aşama 2B.
 *
 * Metod 5, Metod 2'nin birebir kopyasıdır; TEK FARK BTV matrahı:
 *   m2: enerji (+ trafo) · m5: enerji + YEK bedeli (+ trafo) — tümü NET taban.
 *
 * Metod 7 (Meram) aynı iskeleti paylaşır; farklar `method === 7` dallarında
 * (Niğde As Beton Ağustos 2026 faturalarıyla kuruşuna çözüldü):
 *   U = (wPos + Y)×KBK + adj · Enerji = N×U (YEK ayrı satır değil)
 *   Satır 2 = F + GDDK, F = M × ((wM + Y)×KBK − perakende) = −M × mahsuplaşmaBirim
 *   Dağıtım = G_own > C ? D×C/2 : D×C − D×G_own/2   (C = trafo dahil brüt)
 *   BTV = oran × (Enerji + Satır 2) · trafo_degeri ve önceki dönem YEK farkı YOK.
 *
 * Metod 1 (calculateInvoice.ts) AYLIK netleşmeye dayanır; bu metodlar ise
 * SAATLİK net agregalara dayanır:
 *   pos_h = max(cn−gn, 0) · mahsup_h = min(cn, gn) · excess_h = max(gn−cn, 0)
 *   wPos  = Σ(pos_h × PTF_h) / Σ pos_h     (ÇIPLAK, pos-ağırlıklı PTF)
 * Agregalar hourlyNetAggregates.ts'de üretilir; bu dosya SAF hesaptır.
 *
 * ⚠️ Bu modül BİLEREK hiçbir runtime import'u yapmaz (yalnız `import type`).
 * Kabul testi script'i (scripts/check-invoice-methods.ts) bunu doğrudan import
 * edebilsin diye — @/lib/supabase zinciri env değişkeni ister.
 */

// calculateInvoice.ts:73'teki sabitin aynısı (orada modül-private olduğu için
// export edilemiyor; o dosyaya dokunulmuyor). Değişirse ikisi birlikte güncellenmeli.
const VERIS_USD_BIRIM_FIYAT = 0.133;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const isFin = (v: unknown): v is number =>
  v != null && Number.isFinite(Number(v));

/** Metod 2/3'ün saatlik-net girdileri. Metod 1 bu bloğu YOK SAYAR. */
export type InvoiceMethodInputs = {
  /** Σ cn — brüt tüketim */
  sumCn: number;
  /** Σ efektif gn (tahsis dahil) + atfedilemeyen excess */
  sumGn: number;
  /** Σ max(cn−gn, 0) — net pozitif çekiş */
  sumPos: number;
  /** Σ min(cn, gn) — saat-içi örtüşme. Kimlik: sumCn − sumPos */
  sumMahsup: number;
  /** Σ max(gn−cn, 0) — faturaya GİRMEZ, GES kartında gösterilir */
  sumExcess: number;
  /** Pos-ağırlıklı ÇIPLAK PTF (TL/kWh) */
  wPos: number;
  /** Mahsup-ağırlıklı ÇIPLAK PTF (TL/kWh). Metod 3 mahsuplaşma formülünde kullanılır.
   *  Yoksa (eski veri / hesaplanmadı) mahsuplaşma T-0 fiyatına düşer (2B geçiş guard'ı). */
  wMahsup?: number | null;
  /** subscription_settings.kbk */
  kbk: number;
  /** Dönemin ÇIPLAK tahmini YEKDEM'i (subscription_yekdem.yekdem_value) */
  tahminiYekdem: number;
  /** Önceki dönemin net pozitif çekişi. Yoksa YEK Farkı kalemi 0 olur. */
  prevSumPos?: number | null;
  prevTahminiYekdem?: number | null;
  prevGerceklesenYekdem?: number | null;
  /** Metod 3 muhtelif-2 kredisi birim fiyatı. Yoksa T-0 enerji fiyatı kullanılır. */
  mahsuplasmaUnitPrice?: number | null;
  /** Metod 7 (Meram) girdileri. Diğer metodlarda anahtar YOK (sparse).
   *  m7'de `tahminiYekdem` = Y = dönemin yekdem_final'ı (yoksa yekdem_value) ve
   *  sumCn/sumPos/sumMahsup trafo kaybı DAHİL (C/N/M). */
  meram?: MeramMethodInputs;
};

/** Metod 7 (Meram) — hourlyNetAggregates.assembleMethodInputs kurar; snapshot replay
 *  invoiceSnapshots.methodInputsFromSnapshotRow kolonlardan yeniden kurar. */
export type MeramMethodInputs = {
  /** G_own: tesisin KENDİ sayacının dönem verişi (ham Σgn). Dağıtıma yalnız bu girer
   *  (havuz tahsisi dağıtıma GİRMEZ). */
  ownGnTotal: number;
  /** t (kWh/saat); 0 = kural kapalı. Karşı-olgu (GES Olmasaydı) saatlik ağırlık için. */
  trafoKaybiSaatlik: number;
  /** t × saat (kWh) — sumCn'e zaten dahil; gösterim + snapshot. */
  trafoKaybiKwh: number;
  /** subscription_settings.unit_price_adjustment (TL/kWh) — U'ya eklenir. */
  unitPriceAdjustment: number;
  /** Y = yekdem_final mı? false → "tahmini YEKDEM" (yekdem_value). */
  yekdemIsFinal: boolean;
  /** YEKDEM GDDK (TL, işaretli). 'yekdem_gddk' override'ı motorda önceliklidir; null → 0. */
  gddk: number | null;
};

/** Metod 7 çıktısının kendine özgü kalemleri (breakdown.meram). */
export type MeramBreakdown = {
  /** F — mahsuplaşma farkı (TL, işaretli) = M × ((wM + Y)×KBK − perakende) */
  mahsuplasmaFarki: number;
  /** F / M = (wM + Y)×KBK − perakende (override varsa −override) */
  mahsuplasmaBirimFiyat: number;
  /** YEKDEM GDDK (TL, efektif) */
  gddk: number;
  /** "YEKDEM Mahsup + GDDK + Mahsuplaşma Farkı" = F + GDDK */
  satir2: number;
  /** Y (TL/kWh) */
  yekdem: number;
  yekdemIsFinal: boolean;
  /** C — trafo dahil brüt tüketim (dağıtım kWh'ı) */
  consKwh: number;
  /** M — mahsup kWh */
  mahsupKwh: number;
  /** G_own */
  ownGnKwh: number;
  trafoKaybiSaatlik: number;
  trafoKaybiKwh: number;
  /** G_own > C → dağıtım D×C/2 */
  dagitimYarim: boolean;
  wMahsup: number;
};

export type MethodInvoiceInput = InvoiceInput & {
  methodInputs?: InvoiceMethodInputs;
  /** Aşama 2L / Metod 6 (Kepsaş): önceki dönem YEKDEM mahsubunun ÇIPLAK (vergi
   *  öncesi) tutarı, enerji birim fiyatına gömülür. Yalnız Metod 6 okur;
   *  diğer metodlar YOK SAYAR. Yok/0 → Metod 1 ile bit-identik. */
  embeddedYekdemAdderTL?: number | null;
  /** İpragaz 2026-08+ fatura formatı: "YEK Bedeli" ayrı satır DEĞİL, enerji birim
   *  fiyatına gömülü ((PTF + YEKDEM) × KBK). KAPI ÇAĞIRANDA çözülür
   *  (`methodId === 5 && isIpragazYekBirlesikPeriod(yıl, ay)`); motor dönem bilmez
   *  (2K `applyVerisMahsupPerakendeCap` deseni). YALNIZ Metod 5 okur; m2/m3 YOK SAYAR.
   *  Bayrak kapalıyken çıktı bit-identiktir. Toplam/BTV/KDV değişmez — yalnız satır yapısı. */
  ipragazYekBirlesik?: boolean;
};

/** İpragaz'ın YEK bedelini enerji birim fiyatına gömdüğü ilk dönem (fatura formatı
 *  değişikliği). Bu dönemden itibaren Metod 5 çıktısında ayrı "YEK Bedeli" satırı
 *  üretilmez; < bu dönem davranış BİREBİR eski. TEK kaynak. */
export const IPRAGAZ_YEK_BIRLESIK_BASLANGIC = { year: 2026, month: 8 } as const;

/** Dönem İpragaz birleşik-YEK formatında mı? (y×12+m ordinal — isM1MahsupCapPeriod
 *  deseni. Geçersiz/eksik girdi → false, fail-safe: eski satır yapısı.) */
export function isIpragazYekBirlesikPeriod(periodYear: number, periodMonth: number): boolean {
  if (!Number.isFinite(periodYear) || !Number.isFinite(periodMonth)) return false;
  return (
    periodYear * 12 + periodMonth >=
    IPRAGAZ_YEK_BIRLESIK_BASLANGIC.year * 12 + IPRAGAZ_YEK_BIRLESIK_BASLANGIC.month
  );
}

/** Metod 2/3/5'e özgü OPSİYONEL kalemler. Metod 1 çıktısında bu anahtarlar hiç bulunmaz. */
export type MethodInvoiceBreakdown = InvoiceBreakdown & {
  /** m3: "Tahmini YEKDEM" · m2/m5: "YEK Bedeli" */
  yekTahminiCharge?: number;
  /** m3: "Önceki YEKDEM Mahsup" · m2/m5: "YEK Farkı" (önceki dönem verisi yoksa 0) */
  yekFarkiCharge?: number;
  /** m3 muhtelif-2, dağıtım bileşeni (+) */
  muhtelif2Dagitim?: number;
  /** m3 muhtelif-2, mahsuplaşma kredisi (POZİTİF tutulur, matrahta düşülür) */
  muhtelif2MahsupKredisi?: number;
  /** m3 muhtelif-2 net (dağıtım − kredi) */
  muhtelif2Net?: number;
  mahsuplasmaUnitPriceApplied?: number;
  energyUnitPriceApplied?: number;
  wPosApplied?: number;
  /** Metod 6 (Kepsaş): enerji birim fiyatına gömülen çıplak YEKDEM mahsup tutarı (TL). */
  embeddedYekdemAdderTL?: number;
  /** Metod 6: enerji satırında gösterilecek birim fiyat = energyCharge / brütKwh.
   *  Metod 5 birleşik (2026-08+): = energyCharge (YEK dahil) / netKwh. */
  energyUnitPriceShown?: number;
  /** Metod 5 birleşik-YEK (İpragaz 2026-08+): true ise "YEK Bedeli" enerji satırına
   *  katlanmıştır (yekTahminiCharge = 0, energyCharge YEK dahil). Aksi halde anahtar HİÇ yok. */
  yekEnerjiyeGomulu?: true;
  /** Metod 5 birleşik: enerjiye katlanan EFEKTİF YEK tutarı (TL). Okuyucular çıplak
   *  enerjiyi `energyCharge − yekGomuluTutar` ile geri ayırır (muhasebe). */
  yekGomuluTutar?: number;
  /** Metod 7 (Meram): varsa m7 yerleşimi (Satır 2, yarım dağıtım, trafo kaybı notu).
   *  Diğer metodlarda anahtar HİÇ yok → UI kapıları bunu okur. */
  meram?: MeramBreakdown;
};

/**
 * Önceki dönem YEKDEM farkı kalemi — metod 2 "YEK Farkı" ve metod 3 "Önceki
 * YEKDEM Mahsup" AYNI aritmetiği kullanır (taban her ikisinde de önceki dönemin
 * NET pozitif çekişi):
 *
 *   tutar = prevSumPos × (gerçekleşen − tahmini) × KBK      [TL, KDV öncesi]
 *
 * Metod 1'in mahsubundan farkı: burada fatura KALEMİdir (KDV matrahına girer),
 * metod 1'de ise toplam sonrası KDV-dahil eklenir (calculateInvoice.ts:474+).
 * Girdilerden biri eksik/geçersizse 0 döner (D3: "önceki dönem verisi yok → satır gizli").
 */
export function calculateYekFarki(p: {
  prevSumPos?: number | null;
  prevTahminiYekdem?: number | null;
  prevGerceklesenYekdem?: number | null;
  kbk: number;
}): number {
  if (!isFin(p.prevSumPos) || !isFin(p.prevTahminiYekdem) || !isFin(p.prevGerceklesenYekdem)) {
    return 0;
  }
  const base = Number(p.prevSumPos);
  const kbk = Number(p.kbk);
  if (!(base > 0) || !Number.isFinite(kbk)) return 0;
  return base * (Number(p.prevGerceklesenYekdem) - Number(p.prevTahminiYekdem)) * kbk;
}

/**
 * Aşama 2L — Metod 6 (Kepsaş): önceki dönem YEKDEM mahsubunun ÇIPLAK tutarını
 * (adderTL = fark × KBK × mahsupDönemiTüketim) metod-1 breakdown'ının ENERJİ
 * satırına gömer. SAF: yalnız çıktıyı dönüştürür, calculateInvoice'a dokunmaz.
 *
 * Etki YALNIZ enerji + BTV matrahı + KDV'ye (kural 4); trafo, veriş mahsup,
 * dağıtım, reaktif AYNEN kalır (kural 5 — sızma yok). Artımlı uygulanır (base
 * değerlerin temsili bozulmasın):
 *   ΔenergyCharge = adderTL
 *   ΔbtvCharge    = adderTL × btvRate      (koşulsuz — calculateYekdemMahsup ile birebir)
 *   Δsubtotal     = adderTL × (1 + btvRate)
 *   Δvat          = Δsubtotal × vatRate
 *   ΔtotalInvoice = Δsubtotal + Δvat = adderTL × (1+btv) × (1+vat)
 *
 * ⚠️ btvRate KOŞULSUZ uygulanır (btv override ile hariç tutulsa bile), çünkü
 * metod 1'in post-total mahsubu (`calculateYekdemMahsup`) da btvRate'i koşulsuz
 * uygular → m6 ödenecek == m1 totalWithMahsup EŞDEĞERLİĞİ garanti kalır.
 * btvRate zaten efektif orandır (btv_enabled=false → 0 → adder'a BTV binmez).
 *
 * adderTL = 0 → çıktı base ile BİT-IDENTİK (yeni alanlar dışında).
 */
export function embedYekdemMahsupIntoEnergy(
  base: MethodInvoiceBreakdown,
  bareAdderTL: number,
  btvRate: number,
  vatRate: number,
  brutKwh: number
): MethodInvoiceBreakdown {
  const adder = num(bareAdderTL);
  const gross = num(brutKwh);

  // adder yoksa: yalnız gösterim alanlarını doldur, sayılar base ile birebir.
  if (!(adder !== 0)) {
    return {
      ...base,
      embeddedYekdemAdderTL: 0,
      energyUnitPriceShown: gross > 0 ? base.energyCharge / gross : 0,
    };
  }

  const btv = num(btvRate);
  const vat = num(vatRate);
  const dEnergy = adder;
  const dBtv = adder * btv;
  const dSubtotal = dEnergy + dBtv;
  const dVat = dSubtotal * vat;

  const energyCharge = base.energyCharge + dEnergy;
  return {
    ...base,
    energyCharge,
    btvCharge: base.btvCharge + dBtv,
    subtotalBeforeVat: base.subtotalBeforeVat + dSubtotal,
    vatCharge: base.vatCharge + dVat,
    totalInvoice: base.totalInvoice + dSubtotal + dVat,
    embeddedYekdemAdderTL: adder,
    energyUnitPriceShown: gross > 0 ? energyCharge / gross : 0,
  };
}

/**
 * Aşama 2C — manuel YEKDEM override'ının ("yekdem_mahsup") metod 2/3 "YEK Farkı /
 * Önceki YEKDEM Mahsup" kalemine köprüsü.
 *
 * SAF: override objesi dispatcher'dan gelir, Supabase OKUNMAZ — bu modül
 * runtime-import'suz kalmalı (kabul testi harness'ı doğrudan import ediyor).
 *
 * Öncelik — MANUEL KAZANIR:
 *   1) isExcluded              → 0        (checkbox kalemi kapatır)
 *   2) payload alanı girilmiş  → MANUEL   (girilmeyen alan doğaldan tamamlanır)
 *   3) override yok / etkisiz  → DOĞAL    (calculateYekFarki; bit-identik)
 *   4) hiçbiri yok             → 0        (kalem gizli)
 *
 * ⚠️ Metod 1'in calculateYekdemMahsup formülü (BTV+KDV DAHİL, toplam SONRASI)
 * buraya TAŞINMAZ. Yalnız GİRDİLER köprülenir; tutar metod 2/3'ün KDV ÖNCESİ
 * kalem formülüyle hesaplanır: taban × ÇIPLAK fark × KBK.
 * payload.diff_yekdem, invoiceOverrides.ts'teki old=0/new=diff hilesiyle aynı
 * anlama gelir: net (gerçekleşen − tahmini) farkı.
 */
export function resolveYekFarkiWithOverride(p: {
  prevSumPos?: number | null;
  prevTahminiYekdem?: number | null;
  prevGerceklesenYekdem?: number | null;
  kbk: number;
  override?: InvoiceLineOverride | null;
}): { amount: number; overridden: boolean; excluded: boolean } {
  const natural = calculateYekFarki(p);
  const ov = p.override;
  if (!ov) return { amount: natural, overridden: false, excluded: false };

  if (ov.isExcluded) return { amount: 0, overridden: true, excluded: true };

  const pKwh = ov.payload?.total_kwh;
  const pDiff = ov.payload?.diff_yekdem;
  const hasKwh = isFin(pKwh);
  const hasDiff = isFin(pDiff);
  if (!hasKwh && !hasDiff) return { amount: natural, overridden: false, excluded: false };

  // Girilmeyen alan doğal veriden tamamlanır.
  const base = hasKwh ? Number(pKwh) : isFin(p.prevSumPos) ? Number(p.prevSumPos) : NaN;
  const diff = hasDiff
    ? Number(pDiff)
    : isFin(p.prevGerceklesenYekdem) && isFin(p.prevTahminiYekdem)
      ? Number(p.prevGerceklesenYekdem) - Number(p.prevTahminiYekdem)
      : NaN;
  const kbk = Number(p.kbk);

  // Manuel girdi hesap için yetmiyorsa doğala düş (sessiz sıfırlama yok).
  if (!(base > 0) || !Number.isFinite(diff) || !Number.isFinite(kbk)) {
    return { amount: natural, overridden: false, excluded: false };
  }
  return { amount: base * diff * kbk, overridden: true, excluded: false };
}

type NetMethodId = 2 | 3 | 5 | 7;

function calculateNetMethod(
  method: NetMethodId,
  input: MethodInvoiceInput,
  overrides?: InvoiceOverrides | null,
  mi?: InvoiceMethodInputs
): MethodInvoiceBreakdown {
  const m = mi ?? input.methodInputs!;
  const ov = overrides ?? null;

  const sumCn = num(m.sumCn);
  const sumGn = num(m.sumGn);
  const sumPos = num(m.sumPos);
  const sumMahsup = num(m.sumMahsup);
  const sumExcess = num(m.sumExcess);
  const kbk = num(m.kbk);

  // Metod 7 (Meram): m.tahminiYekdem = Y (final varsa final); m.meram yoksa
  // G_own/t/adj 0 kabul edilir (dispatcher m7'yi meram'sız çağırmaz).
  const isMeram = method === 7;
  const mr = isMeram ? m.meram : undefined;

  // ── Birim fiyatlar (öncelik: calculateInvoice.ts:142-152 ile aynı — override girişte gölgeler)
  // m7: U = (wPos + Y)×KBK + adj — YEKDEM enerji fiyatının içinde, ayrı YEK satırı yok.
  const naturalEnergyUnitPrice = isMeram
    ? (num(m.wPos) + num(m.tahminiYekdem)) * kbk + num(mr?.unitPriceAdjustment)
    : num(m.wPos) * kbk; // T-0
  const enerjiUnitOv = ov?.enerji?.unitPriceOverride;
  const energyUnitPrice = isFin(enerjiUnitOv) ? Number(enerjiUnitOv) : naturalEnergyUnitPrice;

  const dagitimUnitOv = ov?.dagitim?.unitPriceOverride;
  const unitPriceDistribution = isFin(dagitimUnitOv)
    ? Number(dagitimUnitOv)
    : num(input.unitPriceDistribution);

  // ── 1) Enerji — her iki metodda da taban NET pozitif çekiş
  let energyCharge = sumPos * energyUnitPrice;

  // Trafo: kural setinde geçmiyor; metod 1 semantiği korunuyor (VARSAYIM, 2C'de teyit).
  // m7: aylık trafo_degeri KULLANILMAZ — trafo kaybı saatlik t ile tüketimin içinde.
  const trafoKwh = !isMeram && isFin(input.trafoDegeri) && Number(input.trafoDegeri) > 0
    ? Number(input.trafoDegeri)
    : 0;
  let trafoCharge = energyUnitPrice * trafoKwh;

  // ── 2) m3 "Tahmini YEKDEM" · m2/m5 "YEK Bedeli" — hepsinin tabanı NET (sumPos).
  // Uludağ YEK'i net (mahsuplu) tüketimden alır; tahmini ≈ gerçekleşen olduğundan
  // YEK FARKI küçüktür (2026-06 faturasıyla doğrulandı). Yalnız DAĞITIM tabanı
  // m2/m5'te brüt kalır (aşağıda, dağıtım bloğu).
  //
  // 'yek' override'ı: DOĞAL ve EFEKTİF ayrı tutulur. Satır kalemi (ve KDV matrahı)
  // her metodda EFEKTİF değeri gösterir; BTV matrahında ise yalnız m5 efektifi
  // kullanır — m3 matrahı DOĞAL yek'le hesaplanır ki 'yek' override'ı doğrulanmış
  // m3 BTV çıktısını asla değiştirmesin (m2 matrahında yek zaten yok).
  const yekBase = sumPos;
  const yekOv = ov?.yek;
  const yekUnitOv = yekOv?.unitPriceOverride;
  // m7: YEKDEM enerji birim fiyatında (U) → ayrı YEK kalemi yok, 'yek' override'ı etkisiz.
  const yekTahminiNatural = isMeram ? 0 : yekBase * (num(m.tahminiYekdem) * kbk);
  // Öncelik: isExcluded > amountOverride > unitPriceOverride > doğal.
  const yekTahminiEffective = isMeram
    ? 0
    : yekOv?.isExcluded
      ? 0
      : isFin(yekOv?.amountOverride)
        ? Number(yekOv!.amountOverride)
        : isFin(yekUnitOv)
          ? yekBase * Number(yekUnitOv)
          : yekTahminiNatural;
  let yekTahminiCharge = yekTahminiNatural;

  // ── 3) Önceki dönem farkı — iki metodda da taban NET (ortak fonksiyon).
  // 2C: manuel YEKDEM override'ı ("yekdem_mahsup") bu kaleme köprülenir; MANUEL KAZANIR.
  // m7: sonraki ay YEKDEM mahsubu bu metotta KAPALI → kalem 0, override etkisiz.
  const yekFarkiResolved = isMeram
    ? { amount: 0, overridden: false, excluded: false }
    : resolveYekFarkiWithOverride({
        prevSumPos: m.prevSumPos,
        prevTahminiYekdem: m.prevTahminiYekdem,
        prevGerceklesenYekdem: m.prevGerceklesenYekdem,
        kbk,
        override: ov?.yekdem_mahsup,
      });
  const yekFarkiCharge = yekFarkiResolved.amount;

  // ── 4) Dağıtım — m3 taban NET, m2/m5 taban BRÜT (muhtelif yok, tek satır)
  const distributionBaseKwh = method === 3 ? sumPos : sumCn;
  let distributionCharge = distributionBaseKwh * unitPriceDistribution;
  // m7 (Meram): taban C (trafo dahil brüt); YALNIZ tesisin kendi verişi (G_own) düşer,
  // havuz tahsisi dağıtıma GİRMEZ. Gerçek faturada saatlik-net değil aylık kural:
  //   G_own > C → D×C/2 · aksi hâlde D×C − D×G_own/2
  let meramDagitimYarim = false;
  let meramDistributionAdjustment = 0;
  if (isMeram) {
    const ownGn = num(mr?.ownGnTotal);
    meramDagitimYarim = ownGn > sumCn;
    distributionCharge = meramDagitimYarim
      ? (unitPriceDistribution * sumCn) / 2
      : unitPriceDistribution * sumCn - (unitPriceDistribution * ownGn) / 2;
    meramDistributionAdjustment = unitPriceDistribution * sumCn - distributionCharge;
  }
  // Açıklama birimi: m7'de efektif birim = doğal tutar / C (override öncesi).
  const meramEffectiveDistributionUnitPrice =
    isMeram && sumCn > 0 ? distributionCharge / sumCn : unitPriceDistribution;

  // ── 5) Muhtelif-2 (YALNIZ m3): +mahsup×dağıtım ve −mahsup×mahsuplaşmaFiyatı
  // NOT: Gerçek Trepaş faturası mahsuplaşmada 1,82375 kullanmıştı; bu değerin
  // kaynağı çözülemedi (bilinçli sapma). Default T-0 fiyatıdır; admin
  // "mahsuplasma" override'ıyla gerçek değeri girebilir. Temmuz faturasıyla test edilecek.
  const mahsuplasmaUnitOv = ov?.mahsuplasma?.unitPriceOverride;
  // Gerçek kural (Trepaş / EPİAŞ satış makası): mahsuplanan enerji EPİAŞ'a PERAKENDEDEN
  // satılır; müşteriye perakende ile (piyasa PTF + YEKDEM) maliyeti arasındaki MAKAS iade
  // edilir → mahsuplaşmaBirim = perakende − (mahsup-ağırlıklı PTF + tahmini YEKDEM) × KBK.
  // Negatifse FLOOR YOK: perakende < maliyet ise kredi ek bedele döner (matematik neyse o).
  const mahsuplasmaFormula =
    isFin(m.wMahsup) && isFin(input.perakendeEnerjiBedeli)
      ? num(input.perakendeEnerjiBedeli) - (num(m.wMahsup) + num(m.tahminiYekdem)) * kbk
      : null;
  const mahsuplasmaUnitPrice = isFin(mahsuplasmaUnitOv)
    ? Number(mahsuplasmaUnitOv) // admin override — kaçış kapısı, formülü ezer
    : isFin(m.mahsuplasmaUnitPrice)
      ? Number(m.mahsuplasmaUnitPrice) // snapshot replay: donmuş efektif fiyat (idempotent)
      : mahsuplasmaFormula != null
        ? mahsuplasmaFormula // YENİ DEFAULT (canlı m3)
        : energyUnitPrice; // eski m3 snapshot / wMahsup yok → T-0 (2B geçiş guard'ı)

  let muhtelif2Dagitim = 0;
  let muhtelif2MahsupKredisi = 0;
  if (method === 3) {
    muhtelif2Dagitim = sumMahsup * unitPriceDistribution;
    muhtelif2MahsupKredisi = sumMahsup * mahsuplasmaUnitPrice;
  }

  // ── 5b) m7 "YEKDEM Mahsup + GDDK + Mahsuplaşma Farkı" (tek satır) = F + GDDK.
  // F, m3 mahsuplaşma kredisinin AYNI birim zinciriyle (override > snapshot > formül)
  // ters işaretlisidir: F = M × ((wM + Y)×KBK − perakende) = −M × mahsuplaşmaBirim.
  // GDDK: 'yekdem_gddk' override'ı (isExcluded → 0) > girdideki meram.gddk > 0.
  let meramF = 0;
  let meramGddk = 0;
  let meramSatir2 = 0;
  const gddkOv = isMeram ? ov?.yekdem_gddk : undefined;
  if (isMeram) {
    meramF = sumMahsup > 0 ? -(sumMahsup * mahsuplasmaUnitPrice) : 0;
    meramGddk = gddkOv?.isExcluded
      ? 0
      : isFin(gddkOv?.amountOverride)
        ? Number(gddkOv!.amountOverride)
        : isFin(mr?.gddk)
          ? Number(mr!.gddk)
          : 0;
    meramSatir2 = meramF + meramGddk;
  }

  // ── 6) Reaktif — brüt bazlı ceza dışarıda hesaplanıp geçilir (metod 1 ile aynı)
  let reactivePenaltyCharge = isFin(input.reactivePenaltyCharge)
    ? Number(input.reactivePenaltyCharge)
    : 0;

  // ── 7) BTV — m3: %1 × (Enerji + Tahmini YEKDEM − mahsuplaşma kredisi) · m2: %1 × Enerji
  //           · m5: %1 × (Enerji + YEK Bedeli).
  // Trepaş enerji ve YEKDEM'i faturada ayrı satır gösterse de BTV ikisinin TOPLAMINDAN
  // kesilir; Önceki YEKDEM Mahsup satırı ve Muhtelif-2'nin DAĞITIM bileşeni matraha GİRMEZ.
  // Trafo, metod 1'deki gibi tabana dahil.
  // m2: Uludağ BTV'yi yalnız enerji bedelinden keser (2026-06 faturası: 9.513,56 =
  // 951.356,23 × %1); YEKDEM matraha dahil EDİLMEZ. Bu davranış gerçek faturayla
  // doğrulandı — m5 eklenirken BİLEREK korunmuştur.
  // m5 (İpragaz): m2 kopyası, tek fark YEK bedelinin matraha girmesi. m5 matrahı
  // yek'in EFEKTİF (override sonrası) değerini kullanır; m3 matrahı DOĞAL değeri
  // kullanır ('yek' override'ı m3 BTV'sini değiştirmez — doğrulanmış çıktı korunur).
  // Enerji/trafo için mevcut kural sürer: yalnız birim fiyat zinciri matraha akar,
  // exclude/tutar override'ları akmaz (admin isterse BTV'yi ayrıca override eder).
  const btvRate = num(input.btvRate);
  // m7 (Meram): ETV = %1 × (Enerji + Satır 2) — GDDK dahil (gerçek faturayla doğrulandı).
  const btvEnergyBase =
    method === 3
      ? energyCharge + yekTahminiNatural - muhtelif2MahsupKredisi
      : method === 5
        ? energyCharge + yekTahminiEffective
        : isMeram
          ? energyCharge + meramSatir2
          : energyCharge;
  let btvCharge = (btvEnergyBase + trafoCharge) * btvRate;

  // ── Güç — kural setinde geçmiyor; metod 1 semantiği (yalnız çift terim). VARSAYIM.
  let powerBaseCharge = 0;
  let powerExcessCharge = 0;
  if (input.tariffType === "dual") {
    const contractPowerKw = num(input.contractPowerKw);
    const monthFinalDemandKw = num(input.monthFinalDemandKw);
    powerBaseCharge = num(input.powerPrice) * contractPowerKw;
    if (monthFinalDemandKw > contractPowerKw) {
      powerExcessCharge = (monthFinalDemandKw - contractPowerKw) * num(input.powerExcessPrice);
    }
  }
  let powerTotalCharge = powerBaseCharge + powerExcessCharge;

  // ── Kalem override'ları (calculateInvoice.ts:350-410 ile aynı öncelik: isExcluded > amountOverride)
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

  energyCharge = applyItem("enerji", energyCharge);
  // m7: trafo kalemi yok — başıboş bir 'trafo' override'ı tutar EKLEYEMESİN.
  if (!isMeram) trafoCharge = applyItem("trafo", trafoCharge);
  distributionCharge = applyItem("dagitim", distributionCharge);
  btvCharge = applyItem("btv", btvCharge);
  reactivePenaltyCharge = applyItem("reaktif", reactivePenaltyCharge);

  const gucOv = ov?.guc;
  if (gucOv) {
    const before = powerTotalCharge;
    powerTotalCharge = applyItem("guc", powerTotalCharge);
    if (powerTotalCharge !== before) {
      // base + excess = total değişmezini koru (calculateInvoice.ts:378-386 ile aynı)
      powerBaseCharge = powerTotalCharge;
      powerExcessCharge = 0;
    }
  }

  // yekFarkiCharge applyItem'dan GEÇMEZ (kendi öncelik mantığı var, yukarıda
  // çözüldü) → override özeti burada elle işlenir.
  if (yekFarkiResolved.excluded) excludedItems.push("yekdem_mahsup");
  else if (yekFarkiResolved.overridden) amountOverriddenItems.push("yekdem_mahsup");

  // yekTahminiCharge da applyItem'dan geçmez: efektif değer BTV'den ÖNCE çözüldü
  // (m5 matrahı ona bağlı). Satır kalemi + KDV matrahı her metodda efektifi kullanır.
  yekTahminiCharge = yekTahminiEffective;
  if (!isMeram) {
    if (yekOv?.isExcluded) excludedItems.push("yek");
    else if (isFin(yekOv?.amountOverride)) amountOverriddenItems.push("yek");
  }
  if (gddkOv?.isExcluded) excludedItems.push("yekdem_gddk");
  else if (isFin(gddkOv?.amountOverride)) amountOverriddenItems.push("yekdem_gddk");

  // ── m5 birleşik-YEK (İpragaz 2026-08+): tüm override çözümlemesi YUKARIDA aynen
  // bitti; şimdi efektif YEK tutarı enerji SATIRINA katlanır. Enerji ve YEK aynı
  // tabana (sumPos) dayandığından toplam/BTV/KDV özdeş kalır — yalnız satır yapısı
  // değişir. energyUnitPrice (çıplak) DEĞİŞMEZ: trafo, verisMahsupBedeli,
  // netEnergyCharge çıplak fiyatla sürer. Gösterim fiyatı energyUnitPriceShown'da.
  const yekBirlesik = method === 5 && input.ipragazYekBirlesik === true;
  let yekGomuluTutar = 0;
  if (yekBirlesik) {
    yekGomuluTutar = yekTahminiCharge;
    energyCharge += yekGomuluTutar;
    yekTahminiCharge = 0;
  }

  const muhtelif2Net = muhtelif2Dagitim - muhtelif2MahsupKredisi;

  // ── Veriş blokları: GES Üretim Satışı kartı TÜM metodlarda aynı kalsın diye
  // metod 1 formülleriyle doldurulur. FARK: verisMahsupBedeli faturadan DÜŞÜLMEZ
  // (m3'te kredi muhtelif-2 kaleminde, m2'de böyle bir kalem yok).
  const verisFazlaUseUsd = input.onYil === true && num(input.usdKur) > 0;
  const verisFazlaBirim = verisFazlaUseUsd
    ? VERIS_USD_BIRIM_FIYAT * num(input.usdKur)
    : num(input.perakendeEnerjiBedeli);
  const verisMahsupBedeli = sumMahsup * energyUnitPrice;
  const verisFazlaBedeli = sumExcess * verisFazlaBirim;
  const verisSatisBedeli = sumGn > 0 ? verisMahsupBedeli + verisFazlaBedeli : 0;

  // ── Toplamlar. Matrah = kalemler + reaktif + BTV (metod 1'de de BTV ve reaktif matrahta).
  const subtotalBeforeVat =
    energyCharge +
    trafoCharge +
    yekTahminiCharge +
    yekFarkiCharge +
    distributionCharge +
    muhtelif2Net +
    meramSatir2 +
    powerTotalCharge +
    reactivePenaltyCharge +
    btvCharge;

  const vatRate = num(input.vatRate);
  const vatCharge = subtotalBeforeVat * vatRate;
  const totalInvoice = subtotalBeforeVat + vatCharge;

  const appliedOverrides: AppliedInvoiceOverrides | null =
    excludedItems.length > 0 ||
    amountOverriddenItems.length > 0 ||
    isFin(enerjiUnitOv) ||
    isFin(dagitimUnitOv) ||
    isFin(mahsuplasmaUnitOv) ||
    (!isMeram && isFin(yekUnitOv))
      ? {
          excludedItems,
          amountOverriddenItems,
          unitPriceEnergyOverridden: isFin(enerjiUnitOv),
          unitPriceDistributionOverridden: isFin(dagitimUnitOv),
          unitPriceMahsuplasmaOverridden: isFin(mahsuplasmaUnitOv),
          unitPriceYekOverridden: !isMeram && isFin(yekUnitOv),
        }
      : null;

  return {
    energyCharge,
    trafoCharge,
    distributionCharge,
    distributionBaseKwh,
    // Metod 2/3'te dağıtım düz tarifeden hesaplanır; metod 1'deki "mahsup indirimi"
    // kavramı yoktur → düzeltme 0. m7: kendi-veriş yarım kredisi (D×C − tutar).
    distributionAdjustment: isMeram ? meramDistributionAdjustment : 0,
    distributionChargeKwh: distributionBaseKwh,
    verisKwh: sumGn,
    effectiveDistributionUnitPrice: isMeram
      ? meramEffectiveDistributionUnitPrice
      : unitPriceDistribution,
    netEnergyKwh: sumPos,
    netEnergyCharge: sumPos * energyUnitPrice,
    btvCharge,
    powerBaseCharge,
    powerExcessCharge,
    powerTotalCharge,
    reactivePenaltyCharge,
    verisMahsupKwh: sumMahsup,
    verisFazlaKwh: sumExcess,
    verisMahsupBedeli,
    verisFazlaBedeli,
    verisSatisBedeli,
    subtotalBeforeVat,
    vatCharge,
    totalInvoice,

    // Metoda özgü kalemler
    yekTahminiCharge,
    yekFarkiCharge,
    ...(method === 3
      ? {
          muhtelif2Dagitim,
          muhtelif2MahsupKredisi,
          muhtelif2Net,
          mahsuplasmaUnitPriceApplied: mahsuplasmaUnitPrice,
        }
      : {}),
    energyUnitPriceApplied: energyUnitPrice,
    wPosApplied: num(m.wPos),

    // m5 birleşik: sparse — bayrak kapalıyken anahtarlar HİÇ eklenmez (bit-identik çıktı).
    ...(yekBirlesik
      ? {
          yekEnerjiyeGomulu: true as const,
          yekGomuluTutar,
          energyUnitPriceShown:
            sumPos > 0 ? energyCharge / sumPos : energyUnitPrice + num(m.tahminiYekdem) * kbk,
        }
      : {}),

    // m7: sparse — diğer metodlarda anahtar HİÇ eklenmez (bit-identik çıktı).
    ...(isMeram
      ? {
          meram: {
            mahsuplasmaFarki: meramF,
            mahsuplasmaBirimFiyat: -mahsuplasmaUnitPrice,
            gddk: meramGddk,
            satir2: meramSatir2,
            yekdem: num(m.tahminiYekdem),
            yekdemIsFinal: mr?.yekdemIsFinal === true,
            consKwh: sumCn,
            mahsupKwh: sumMahsup,
            ownGnKwh: num(mr?.ownGnTotal),
            trafoKaybiSaatlik: num(mr?.trafoKaybiSaatlik),
            trafoKaybiKwh: num(mr?.trafoKaybiKwh),
            dagitimYarim: meramDagitimYarim,
            wMahsup: num(m.wMahsup),
          },
        }
      : {}),

    ...(appliedOverrides ? { appliedOverrides } : {}),
  };
}

/** Metod 2 — Uedaş. YEK Bedeli ve enerji tabanı NET (sumPos); yalnız DAĞITIM tabanı BRÜT (sumCn). */
export function calculateInvoiceMethod2(
  input: MethodInvoiceInput,
  overrides?: InvoiceOverrides | null,
  methodInputs?: InvoiceMethodInputs
): MethodInvoiceBreakdown {
  return calculateNetMethod(2, input, overrides, methodInputs);
}

/** Metod 3 — Tredaş. Tüm tabanlar NET (sumPos); mahsup, muhtelif-2 kaleminde netleşir. */
export function calculateInvoiceMethod3(
  input: MethodInvoiceInput,
  overrides?: InvoiceOverrides | null,
  methodInputs?: InvoiceMethodInputs
): MethodInvoiceBreakdown {
  return calculateNetMethod(3, input, overrides, methodInputs);
}

/** Metod 7 — Meram (MEPAŞ). Enerji N×U, U = (wPos + Y)×KBK + adj; "YEKDEM Mahsup +
 *  GDDK + Mahsuplaşma Farkı" tek satır; dağıtım kendi verişiyle aylık yarım kural;
 *  BTV = oran × (Enerji + Satır 2). Girdiler trafo kaybı dahil (methodInputs.meram). */
export function calculateInvoiceMethod7(
  input: MethodInvoiceInput,
  overrides?: InvoiceOverrides | null,
  methodInputs?: InvoiceMethodInputs
): MethodInvoiceBreakdown {
  return calculateNetMethod(7, input, overrides, methodInputs);
}

/** Metod 5 — İpragaz. Metod 2'nin birebir kopyası; TEK FARK BTV matrahına
 *  YEK bedeli de girer: %oran × (Enerji + YEK Bedeli + trafo), tümü NET taban. */
export function calculateInvoiceMethod5(
  input: MethodInvoiceInput,
  overrides?: InvoiceOverrides | null,
  methodInputs?: InvoiceMethodInputs
): MethodInvoiceBreakdown {
  return calculateNetMethod(5, input, overrides, methodInputs);
}
