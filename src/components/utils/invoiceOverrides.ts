import { supabase } from "@/lib/supabase";

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
  | "trafo";

export type InvoiceLineOverride = {
  isExcluded: boolean;
  /** Yalnız enerji/dagitim için anlamlı (TL/kWh, mutlak değer). */
  unitPriceOverride: number | null;
  /** Kalem tutarını sabitler (TL, KDV öncesi). */
  amountOverride: number | null;
  /** Yalnız reaktif için: Ri/Rc kWh toplamlarını MUTLAK değerle değiştirir. */
  payload: { ri_kwh?: number; rc_kwh?: number } | null;
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
};

const ITEM_KEYS: InvoiceOverrideItemKey[] = [
  "enerji",
  "dagitim",
  "btv",
  "reaktif",
  "guc",
  "trafo",
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

const rowToOverride = (row: InvoiceLineOverrideRow): InvoiceLineOverride => ({
  isExcluded: row.is_excluded === true,
  unitPriceOverride: toFiniteOrNull(row.unit_price_override),
  amountOverride: toFiniteOrNull(row.amount_override),
  payload: parseReactivePayload(row.payload),
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
  payload?: { ri_kwh?: number; rc_kwh?: number } | null;
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
