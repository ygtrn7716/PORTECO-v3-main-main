import { supabase } from "@/lib/supabase";
// calculateInvoice.ts bu modülden yalnız `import type` yapar → runtime döngüsü yok.
import { calculateYekdemMahsup } from "./calculateInvoice";

/**
 * Fatura kalem override altyapısı (Aşama 1).
 *
 * Admin, invoice_line_overrides tablosu üzerinden tesis+ay bazında kalem
 * müdahalesi yapar; müşteri yüzeyleri bu modüldeki fetch + apply yardımcılarıyla
 * override'ları hesaba ve gösterime yansıtır. Öncelik sırası:
 * isExcluded > amountOverride > unitPriceOverride.
 */

export type InvoiceOverrideItemKey =
  | "enerji"
  | "dagitim"
  | "btv"
  | "reaktif"
  | "guc"
  | "trafo"
  /**
   * Aşama 3 — fatura KALEMİ DEĞİL. YEKDEM mahsubu calculateInvoice'ın dışında
   * (totalWithMahsup = totalInvoice + yekdemMahsup + digerDegerler) hesaplandığı
   * için calculateInvoice bu anahtarı görmezden gelir; mahsup çağrı noktaları
   * computeYekdemMahsupWithOverride ile tüketir.
   */
  | "yekdem_mahsup"
  /**
   * Aşama 2B — yalnız METOD 3 (Tredaş). Muhtelif-2 kalemindeki mahsuplaşma
   * kredisinin birim fiyatı (TL/kWh). Girilmezse T-0 enerji fiyatı kullanılır.
   * Metod 1/2 bu anahtarı görmezden gelir.
   */
  | "mahsuplasma"
  /**
   * Metod 2/3/5'teki "YEK Bedeli / Tahmini YEKDEM" satırı. unitPriceOverride
   * TL/kWh'dir (doğal birim = tahminiYekdem × KBK). YALNIZ Metod 5'te BTV
   * matrahına efektif değeriyle akar; m2/m3'te satırı değiştirir ama BTV'yi
   * ETKİLEMEZ. Metod 1/4 bu anahtarı görmezden gelir.
   */
  | "yek";

/**
 * Kalem payload'ı. Alanlar kaleme göre anlamlıdır:
 * - reaktif       → ri_kwh / rc_kwh (Ri/Rc kWh toplamlarının MUTLAK yerine geçer)
 * - yekdem_mahsup → total_kwh (mahsup dönemi toplam tüketim) /
 *                   diff_yekdem (YEKDEM farkı = yekdem_final − yekdem_value, TL/kWh)
 */
export type InvoiceOverridePayload = {
  ri_kwh?: number;
  rc_kwh?: number;
  total_kwh?: number;
  diff_yekdem?: number;
};

export type InvoiceLineOverride = {
  isExcluded: boolean;
  /** Yalnız enerji/dagitim/mahsuplasma/yek için anlamlı (TL/kWh, mutlak değer). */
  unitPriceOverride: number | null;
  /** Kalem tutarını sabitler (TL, KDV öncesi). */
  amountOverride: number | null;
  /** Kaleme özel ek girdiler — bkz. InvoiceOverridePayload. */
  payload: InvoiceOverridePayload | null;
  note: string | null;
};

export type InvoiceOverrides = Partial<
  Record<InvoiceOverrideItemKey, InvoiceLineOverride>
>;

/** calculateInvoice'ın breakdown'a işlediği override özeti (UI satır gizleme + rozet). */
export type AppliedInvoiceOverrides = {
  excludedItems: InvoiceOverrideItemKey[];
  amountOverriddenItems: InvoiceOverrideItemKey[];
  unitPriceEnergyOverridden: boolean;
  unitPriceDistributionOverridden: boolean;
  /** Aşama 2B / Metod 3: muhtelif-2 mahsuplaşma birim fiyatı override'landı mı? */
  unitPriceMahsuplasmaOverridden?: boolean;
  /** Metod 2/3/5: YEK Bedeli birim fiyatı override'landı mı? */
  unitPriceYekOverridden?: boolean;
};

const ITEM_KEYS: InvoiceOverrideItemKey[] = [
  "enerji",
  "dagitim",
  "btv",
  "reaktif",
  "guc",
  "trafo",
  "yekdem_mahsup",
  "mahsuplasma",
  "yek",
];

// Caller'lardaki reaktif eşiklerin aynısı (Dashboard/InvoiceDetail/calculateInvoiceToDate).
const REACTIVE_LIMIT_RI = 20;
const REACTIVE_LIMIT_RC = 15;

/** Çok tesisli map anahtarı: "serno:yyyy-m". */
export const overrideKey = (
  subscriptionSerno: number,
  periodYear: number,
  periodMonth: number
): string => `${subscriptionSerno}:${periodYear}-${periodMonth}`;

/** Tek tesis, çok ay map anahtarı: "yyyy-m". */
export const periodKey = (periodYear: number, periodMonth: number): string =>
  `${periodYear}-${periodMonth}`;

type InvoiceLineOverrideRow = {
  subscription_serno: number | string | null;
  period_year: number | null;
  period_month: number | null;
  item_key: string | null;
  is_excluded: boolean | null;
  unit_price_override: number | string | null;
  amount_override: number | string | null;
  payload: unknown;
  note: string | null;
};

const OVERRIDE_SELECT_FIELDS =
  "subscription_serno, period_year, period_month, item_key, is_excluded, unit_price_override, amount_override, payload, note";

const toFiniteOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** jsonb payload'ı toleranslı parse eder; geçersiz alanlar yok sayılır. */
const parseReactivePayload = (
  raw: unknown
): { ri_kwh?: number; rc_kwh?: number } | null => {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const out: { ri_kwh?: number; rc_kwh?: number } = {};
  const ri = toFiniteOrNull(obj.ri_kwh);
  const rc = toFiniteOrNull(obj.rc_kwh);
  if (ri != null) out.ri_kwh = ri;
  if (rc != null) out.rc_kwh = rc;
  return out.ri_kwh != null || out.rc_kwh != null ? out : null;
};

/** yekdem_mahsup payload'ı — reaktifin simetriği; boşsa null (çöp satır olmasın). */
const parseYekdemMahsupPayload = (
  raw: unknown
): { total_kwh?: number; diff_yekdem?: number } | null => {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const out: { total_kwh?: number; diff_yekdem?: number } = {};
  const totalKwh = toFiniteOrNull(obj.total_kwh);
  const diff = toFiniteOrNull(obj.diff_yekdem);
  if (totalKwh != null) out.total_kwh = totalKwh;
  if (diff != null) out.diff_yekdem = diff;
  return out.total_kwh != null || out.diff_yekdem != null ? out : null;
};

const rowToOverride = (row: InvoiceLineOverrideRow): InvoiceLineOverride => ({
  isExcluded: row.is_excluded === true,
  unitPriceOverride: toFiniteOrNull(row.unit_price_override),
  amountOverride: toFiniteOrNull(row.amount_override),
  payload:
    row.item_key === "yekdem_mahsup"
      ? parseYekdemMahsupPayload(row.payload)
      : parseReactivePayload(row.payload),
  note: row.note ?? null,
});

const rowsToOverrides = (
  rows: InvoiceLineOverrideRow[]
): InvoiceOverrides | null => {
  let out: InvoiceOverrides | null = null;
  for (const row of rows) {
    const key = row.item_key as InvoiceOverrideItemKey;
    if (!ITEM_KEYS.includes(key)) continue;
    if (!out) out = {};
    out[key] = rowToOverride(row);
  }
  return out;
};

/** Tek tesis + tek ay override'ları. Satır yoksa null (regresyon garantisi için). */
export async function fetchInvoiceOverrides(params: {
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
}): Promise<InvoiceOverrides | null> {
  const { data, error } = await supabase
    .from("invoice_line_overrides")
    .select(OVERRIDE_SELECT_FIELDS)
    .eq("user_id", params.userId)
    .eq("subscription_serno", params.subscriptionSerno)
    .eq("period_year", params.periodYear)
    .eq("period_month", params.periodMonth);

  if (error) throw error;
  return rowsToOverrides((data ?? []) as InvoiceLineOverrideRow[]);
}

/** Tek tesisin TÜM ayları — tek sorgu, periodKey(yıl, ay) anahtarlı map. */
export async function fetchInvoiceOverridesForUserSub(params: {
  userId: string;
  subscriptionSerno: number;
}): Promise<Map<string, InvoiceOverrides>> {
  const { data, error } = await supabase
    .from("invoice_line_overrides")
    .select(OVERRIDE_SELECT_FIELDS)
    .eq("user_id", params.userId)
    .eq("subscription_serno", params.subscriptionSerno);

  if (error) throw error;

  const map = new Map<string, InvoiceOverrides>();
  for (const raw of (data ?? []) as InvoiceLineOverrideRow[]) {
    const key = raw.item_key as InvoiceOverrideItemKey;
    if (!ITEM_KEYS.includes(key)) continue;
    const year = Number(raw.period_year);
    const month = Number(raw.period_month);
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
    const mapKey = periodKey(year, month);
    const bucket = map.get(mapKey) ?? {};
    bucket[key] = rowToOverride(raw);
    map.set(mapKey, bucket);
  }
  return map;
}

/**
 * Kullanıcının override'ları — sayfa başına TEK sorgu; overrideKey(serno, yıl, ay)
 * anahtarlı map. Çok tesisli yüzeyler için (InvoiceHistory, invoice_comparison,
 * Dashboard tüm-tesisler toplamı). Opsiyonel filtrelerle daraltılabilir.
 */
export async function fetchAllInvoiceOverridesForUser(params: {
  userId: string;
  periodYear?: number;
  periodMonth?: number;
  subscriptionSernos?: number[];
}): Promise<Map<string, InvoiceOverrides>> {
  let q = supabase
    .from("invoice_line_overrides")
    .select(OVERRIDE_SELECT_FIELDS)
    .eq("user_id", params.userId);
  if (params.periodYear != null) q = q.eq("period_year", params.periodYear);
  if (params.periodMonth != null) q = q.eq("period_month", params.periodMonth);
  if (params.subscriptionSernos && params.subscriptionSernos.length > 0) {
    q = q.in("subscription_serno", params.subscriptionSernos);
  }

  const { data, error } = await q;
  if (error) throw error;

  const map = new Map<string, InvoiceOverrides>();
  for (const raw of (data ?? []) as InvoiceLineOverrideRow[]) {
    const key = raw.item_key as InvoiceOverrideItemKey;
    if (!ITEM_KEYS.includes(key)) continue;
    const serno = Number(raw.subscription_serno);
    const year = Number(raw.period_year);
    const month = Number(raw.period_month);
    if (
      !Number.isFinite(serno) ||
      !Number.isFinite(year) ||
      !Number.isFinite(month)
    )
      continue;
    const mapKey = overrideKey(serno, year, month);
    const bucket = map.get(mapKey) ?? {};
    bucket[key] = rowToOverride(raw);
    map.set(mapKey, bucket);
  }
  return map;
}

// ─────────────────────────────────────────────
// YAZMA (Aşama 2 — admin sayfası)
// ─────────────────────────────────────────────

/** Admin formundan gelen ham değerler (hepsi opsiyonel/nullable). */
export type InvoiceLineOverrideInput = {
  isExcluded?: boolean;
  unitPriceOverride?: number | null;
  amountOverride?: number | null;
  payload?: InvoiceOverridePayload | null;
  note?: string | null;
};

/**
 * Etkisi olmayan override → satır DB'de tutulmaz.
 *
 * `note` bilinçli olarak yok sayılır: etkisi olmayan bir not satırı
 * fetchInvoiceOverrides'ı null yerine dolu obje döndürür, bu da
 * calculateInvoice'ta appliedOverrides'ın set edilmesine yol açar ve
 * "override yoksa çıktı bit-identik" garantisini bozar.
 */
export function isEmptyOverride(v: InvoiceLineOverrideInput): boolean {
  return (
    v.isExcluded !== true &&
    v.unitPriceOverride == null &&
    v.amountOverride == null &&
    v.payload == null
  );
}

/** updated_by için oturumdaki admin uid'i (getSession yereldir, ağ isteği yok). */
async function resolveUpdatedBy(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Tek kalemi yazar. Etkisi yoksa (isEmptyOverride) upsert yerine DELETE atar —
 * çöp satır birikmesin.
 */
export async function upsertInvoiceOverride(params: {
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  itemKey: InvoiceOverrideItemKey;
  value: InvoiceLineOverrideInput;
  updatedBy?: string | null;
}): Promise<"upserted" | "deleted"> {
  if (isEmptyOverride(params.value)) {
    await deleteInvoiceOverride(params);
    return "deleted";
  }

  const updatedBy = await resolveUpdatedBy(params.updatedBy);

  const { error } = await supabase.from("invoice_line_overrides").upsert(
    {
      user_id: params.userId,
      subscription_serno: params.subscriptionSerno,
      period_year: params.periodYear,
      period_month: params.periodMonth,
      item_key: params.itemKey,
      is_excluded: params.value.isExcluded === true,
      unit_price_override: params.value.unitPriceOverride ?? null,
      amount_override: params.value.amountOverride ?? null,
      payload: params.value.payload ?? null,
      note: params.value.note ?? null,
      updated_by: updatedBy,
    },
    {
      onConflict: "user_id,subscription_serno,period_year,period_month,item_key",
    }
  );

  if (error) throw error;
  return "upserted";
}

/** Tek kalemi varsayılana döndürür. */
export async function deleteInvoiceOverride(params: {
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  itemKey: InvoiceOverrideItemKey;
}): Promise<void> {
  const { error } = await supabase
    .from("invoice_line_overrides")
    .delete()
    .eq("user_id", params.userId)
    .eq("subscription_serno", params.subscriptionSerno)
    .eq("period_year", params.periodYear)
    .eq("period_month", params.periodMonth)
    .eq("item_key", params.itemKey);

  if (error) throw error;
}

/** O ayın TÜM kalem override'larını siler. Silinen satır sayısını döner. */
export async function deleteInvoiceOverridesForPeriod(params: {
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
}): Promise<number> {
  const { data, error } = await supabase
    .from("invoice_line_overrides")
    .delete()
    .eq("user_id", params.userId)
    .eq("subscription_serno", params.subscriptionSerno)
    .eq("period_year", params.periodYear)
    .eq("period_month", params.periodMonth)
    .select("item_key");

  if (error) throw error;
  return (data ?? []).length;
}

/** Enerji/dağıtım birim fiyatının efektif değeri (override varsa o, yoksa doğal). */
export function resolveUnitPriceOverride(
  base: number,
  item?: InvoiceLineOverride | null
): number {
  const v = item?.unitPriceOverride;
  return v != null && Number.isFinite(v) ? v : base;
}

/**
 * Canlı pipeline'lar için: reaktif payload'daki ri_kwh/rc_kwh değerleri Ri/Rc
 * toplamlarının YERİNE geçer (mutlak değer, delta değil; alan bazlı — yalnız
 * biri de verilebilir). Yüzde + ceza hesabından ÖNCE çağrılır.
 */
export function applyReactiveValueOverrides(
  riSum: number,
  rcSum: number,
  overrides?: InvoiceOverrides | null
): { riSum: number; rcSum: number } {
  const payload = overrides?.reaktif?.payload;
  if (!payload) return { riSum, rcSum };
  return {
    riSum:
      payload.ri_kwh != null && Number.isFinite(payload.ri_kwh)
        ? payload.ri_kwh
        : riSum,
    rcSum:
      payload.rc_kwh != null && Number.isFinite(payload.rc_kwh)
        ? payload.rc_kwh
        : rcSum,
  };
}

/**
 * Snapshot yüzeyleri için reaktif payload uygulaması (saf/senkron; render map'te
 * güvenli). Snapshot ham Ri/Rc toplamlarını saklamaz; toplamlar saklı yüzdelerden
 * geri türetilir (yüzde tabanı tüketimdir). reaktif_bedel snapshot'ta olmadığından
 * ceza, saklı ceza / saklı ceza-enerjisi oranından (implied birim fiyat) türetilir;
 * yeni değerler limit altındaysa ceza kesin 0'dır. Değerler saklı değerlerle
 * aynıysa saklı sonuç aynen döner (tam idempotens kısa devresi).
 */
export function applyReactivePayloadToSnapshot(
  stored: {
    totalConsumptionKwh: number;
    riPercent: number;
    rcPercent: number;
    penalty: number;
  },
  item?: InvoiceLineOverride | null
): { riPercent: number; rcPercent: number; penalty: number } {
  const base = {
    riPercent: stored.riPercent,
    rcPercent: stored.rcPercent,
    penalty: stored.penalty,
  };
  const payload = item?.payload;
  const kwh = stored.totalConsumptionKwh;
  if (!payload || !(kwh > 0)) return base;

  const storedRiSum = (stored.riPercent / 100) * kwh;
  const storedRcSum = (stored.rcPercent / 100) * kwh;
  const riSum =
    payload.ri_kwh != null && Number.isFinite(payload.ri_kwh)
      ? payload.ri_kwh
      : storedRiSum;
  const rcSum =
    payload.rc_kwh != null && Number.isFinite(payload.rc_kwh)
      ? payload.rc_kwh
      : storedRcSum;

  // Tam idempotens: yazılmış (efektif) snapshot'a aynı payload tekrar uygulanırsa
  // geri türetilen toplamlar payload değerlerinin kendisidir → saklı sonuç döner.
  if (riSum === storedRiSum && rcSum === storedRcSum) return base;

  const riPercent = (riSum / kwh) * 100;
  const rcPercent = (rcSum / kwh) * 100;
  const penaltyEnergy =
    (riPercent > REACTIVE_LIMIT_RI ? riSum : 0) +
    (rcPercent > REACTIVE_LIMIT_RC ? rcSum : 0);

  if (penaltyEnergy === 0) return { riPercent, rcPercent, penalty: 0 };

  const storedPenaltyEnergy =
    (stored.riPercent > REACTIVE_LIMIT_RI ? storedRiSum : 0) +
    (stored.rcPercent > REACTIVE_LIMIT_RC ? storedRcSum : 0);

  if (storedPenaltyEnergy > 0 && stored.penalty > 0) {
    const impliedUnit = stored.penalty / storedPenaltyEnergy;
    return { riPercent, rcPercent, penalty: penaltyEnergy * impliedUnit };
  }

  // Birim fiyat türetilemiyor (saklı ceza 0) → saklı ceza korunur; kesin TL
  // için admin reaktif amount_override kullanmalı.
  return { riPercent, rcPercent, penalty: stored.penalty };
}

// ─────────────────────────────────────────────
// YEKDEM MAHSUP OVERRIDE (Aşama 3)
// ─────────────────────────────────────────────

export type YekdemMahsupMissing = "none" | "value" | "final" | "both";

export type ResolvedYekdemMahsupInputs = {
  totalKwh: number;
  yekdemOld: number;
  yekdemNew: number;
  /** Doğal veri eksik/0 olsa bile mahsup HESAPLANIR (erken çıkışlar bypass). */
  forceCompute: boolean;
  /** is_excluded → mahsup o dönem için 0'a zorlanır. */
  forceZero: boolean;
};

/**
 * yekdem_mahsup override'ının efektif girdilerini üretir. SAF — Supabase yok.
 *
 * Override yoksa null döner; çağıran doğal davranışını birebir korur
 * (regresyon garantisi).
 */
export function resolveYekdemMahsupInputs(args: {
  naturalTotalKwh: number;
  naturalYekdemOld: number | null;
  naturalYekdemNew: number | null;
  override?: InvoiceLineOverride | null;
}): ResolvedYekdemMahsupInputs | null {
  const { naturalTotalKwh, naturalYekdemOld, naturalYekdemNew, override } = args;
  if (!override) return null;

  const payload = override.payload;

  const payloadKwh = payload?.total_kwh;
  const effTotalKwh =
    payloadKwh != null && Number.isFinite(payloadKwh)
      ? payloadKwh
      : naturalTotalKwh;

  // diff_yekdem verildiyse net farkı TEK kalemde temsil et: formül
  // diffYekdem = yekdemNew − yekdemOld olduğu için old=0, new=diff yeterli.
  const payloadDiff = payload?.diff_yekdem;
  const useDiff = payloadDiff != null && Number.isFinite(payloadDiff);

  const yekdemOld = useDiff ? 0 : naturalYekdemOld ?? NaN;
  const yekdemNew = useDiff ? payloadDiff! : naturalYekdemNew ?? NaN;

  const effDiff = yekdemNew - yekdemOld;

  return {
    totalKwh: effTotalKwh,
    yekdemOld,
    yekdemNew,
    forceCompute: effTotalKwh > 0 && Number.isFinite(effDiff),
    forceZero: override.isExcluded === true,
  };
}

/**
 * Mahsup çağrı noktalarının ORTAK karar noktası: doğal girdiler + opsiyonel
 * override → { mahsup, has, missing }.
 *
 * Override yokken bugünkü nested-if mantığının birebir aynısını uygular
 * (kWh > 0 && her iki YEKDEM dolu → hesapla; değilse both/value/final), böylece
 * override'sız çıktı bit-identiktir.
 *
 * lisansli_satis kontrolü ÇAĞIRANDA kalır — override lisanslı tesiste mahsubu
 * diriltmemelidir.
 */
export function computeYekdemMahsupWithOverride(args: {
  naturalTotalKwh: number;
  /** subscription_yekdem.yekdem_value (tahmini) */
  naturalYekdemOld: number | null;
  /** subscription_yekdem.yekdem_final (kesin) */
  naturalYekdemNew: number | null;
  kbk: number;
  btvRate: number;
  vatRate: number;
  override?: InvoiceLineOverride | null;
}): { mahsup: number; has: boolean; missing: YekdemMahsupMissing } {
  const {
    naturalTotalKwh,
    naturalYekdemOld,
    naturalYekdemNew,
    kbk,
    btvRate,
    vatRate,
    override,
  } = args;

  const resolved = resolveYekdemMahsupInputs({
    naturalTotalKwh,
    naturalYekdemOld,
    naturalYekdemNew,
    override,
  });

  if (resolved?.forceZero) {
    return { mahsup: 0, has: true, missing: "none" };
  }

  if (resolved?.forceCompute) {
    return {
      mahsup: calculateYekdemMahsup({
        totalKwh: resolved.totalKwh,
        kbk,
        btvRate,
        vatRate,
        yekdemOld: resolved.yekdemOld,
        yekdemNew: resolved.yekdemNew,
      }),
      has: true,
      missing: "none",
    };
  }

  // Doğal dal — override yok ya da hesap için yeterli değil.
  const hasValue = naturalYekdemOld != null;
  const hasFinal = naturalYekdemNew != null;

  if (!(naturalTotalKwh > 0)) {
    // Tüketim yoksa doğal akış YEKDEM satırına hiç bakmaz → "both".
    return { mahsup: 0, has: false, missing: "both" };
  }

  if (hasValue && hasFinal) {
    return {
      mahsup: calculateYekdemMahsup({
        totalKwh: naturalTotalKwh,
        kbk,
        btvRate,
        vatRate,
        yekdemOld: naturalYekdemOld,
        yekdemNew: naturalYekdemNew,
      }),
      has: true,
      missing: "none",
    };
  }

  if (!hasValue && !hasFinal) return { mahsup: 0, has: false, missing: "both" };
  if (!hasValue) return { mahsup: 0, has: false, missing: "value" };
  return { mahsup: 0, has: false, missing: "final" };
}
