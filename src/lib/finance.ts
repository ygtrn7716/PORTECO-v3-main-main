// src/lib/finance.ts
// Finans Takip modülünün omurgası: tipler, rozet renkleri, normalizasyon ve saf iş mantığı.
// React'ten bağımsız, yan etkisiz — tüm zaman bilgisi `today: DateStr` parametresinden okunur.
//
// İKİ KURAL:
//  1) Zamanı saf fonksiyonların İÇİNDE okuma. todayTR()/currentMonthTR() sadece çağrı katmanında
//     (sayfa/hook) kullanılır; buradaki saf fonksiyonlar `today` parametresi alır. Aksi halde
//     fonksiyonlar test edilemez hale gelir.
//  2) period_month / billing_*_month DAİMA opaque "YYYY-MM-01" string'idir; `===` ve `<`/`>` ile
//     karşılaştırılır, ASLA dayjsTR()'den geçirilmez. dayjs("2026-07-01") yerel gece yarısı parse
//     eder ve .tz() o anı ÇEVİRİR: UTC+13 bir tarayıcıda dayjsTR("2026-07-01").format("YYYY-MM")
//     "2026-06" döner. Ay matematiği dayjs.utc() ile yapılır.

import dayjs, { dayjsTR } from "@/lib/dayjs";

/** DAİMA "YYYY-MM-01" — ayın ilk günü. */
export type MonthStr = string;
/** DAİMA "YYYY-MM-DD". */
export type DateStr = string;

export type FinanceStatus = "demo" | "active" | "paused" | "churned";
export type PaymentStatus = "odendi" | "kismi" | "bekliyor" | "gecikti" | "kapsam_disi";
export type DemoUrgency = "expired" | "critical" | "warning" | "ok" | "unknown";
export type PaymentMethod = "havale" | "nakit" | "kredi_karti" | "diger";
export type ExpenseCategory =
  | "sunucu"
  | "domain"
  | "api_servis"
  | "sms"
  | "eposta"
  | "yazilim"
  | "muhasebe"
  | "pazarlama"
  | "vergi"
  | "diger";

export type FinanceAccount = {
  id: string;
  user_id: string;
  display_name: string;
  status: FinanceStatus;
  /** Güncel aylık ücret (TL, brüt). Ücret geçmişi tutulmaz. */
  monthly_fee: number;
  /** 1-31; NULL ise ayın son günü vade kabul edilir. */
  payment_day: number | null;
  demo_start: DateStr | null;
  demo_end: DateStr | null;
  /** Faturalanan İLK ay. NULL = hiç faturalanmadı (demo). status='active' ise DB'de zorunlu. */
  billing_start_month: MonthStr | null;
  /** Faturalanan SON ay. NULL = hâlâ faturalanıyor. */
  billing_end_month: MonthStr | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancePayment = {
  id: string;
  account_id: string;
  period_month: MonthStr;
  amount: number;
  paid_at: DateStr;
  method: PaymentMethod;
  note: string | null;
  created_at: string;
};

export type FinanceExpenseTemplate = {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  active: boolean;
  note: string | null;
  created_at: string;
};

export type FinanceExpense = {
  id: string;
  period_month: MonthStr;
  title: string;
  category: ExpenseCategory;
  amount: number;
  expense_date: DateStr | null;
  template_id: string | null;
  note: string | null;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/* Sabitler ve rozet renkleri                                          */
/* ------------------------------------------------------------------ */

/** Kayan nokta toleransı: 1500.10 + 200.20 = 1700.2999… tozu "Ödendi"yi "Kısmi" yapmasın. */
export const PAID_EPSILON = 0.01;
/** "Yaklaşanlar" ve demo rozeti için eşik (gün). */
export const SOON_DAYS = 7;

export const CHART_COLORS = { revenue: "#00AEEF", expense: "#7A8C99" } as const;

export const STATUS_META: Record<FinanceStatus, { label: string; badge: string }> = {
  demo: { label: "Demo", badge: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" },
  active: { label: "Aktif", badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  paused: { label: "Duraklatıldı", badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  churned: { label: "Ayrıldı", badge: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-300" },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; badge: string }> = {
  odendi: { label: "Ödendi", badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  kismi: { label: "Kısmi", badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  bekliyor: { label: "Bekliyor", badge: "bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200" },
  gecikti: { label: "Gecikti", badge: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  kapsam_disi: { label: "Kapsam dışı", badge: "bg-neutral-50 text-neutral-400 ring-1 ring-neutral-200" },
};

export const DEMO_URGENCY_META: Record<DemoUrgency, { label: string; badge: string }> = {
  expired: { label: "Süresi doldu", badge: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  critical: { label: "Kritik", badge: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  warning: { label: "Yaklaşıyor", badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  ok: { label: "Devam ediyor", badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  unknown: { label: "Süre belirsiz", badge: "bg-neutral-50 text-neutral-500 ring-1 ring-neutral-200" },
};

export const EXPENSE_CATEGORY_META: Record<ExpenseCategory, { label: string }> = {
  sunucu: { label: "Sunucu" },
  domain: { label: "Domain" },
  api_servis: { label: "API / Servis" },
  sms: { label: "SMS" },
  eposta: { label: "E-posta" },
  yazilim: { label: "Yazılım" },
  muhasebe: { label: "Muhasebe" },
  pazarlama: { label: "Pazarlama" },
  vergi: { label: "Vergi" },
  diger: { label: "Diğer" },
};

export const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string }> = {
  havale: { label: "Havale" },
  nakit: { label: "Nakit" },
  kredi_karti: { label: "Kredi Kartı" },
  diger: { label: "Diğer" },
};

/** <select> için sabit sıra. */
export const CATEGORY_OPTIONS: ExpenseCategory[] = [
  "sunucu",
  "domain",
  "api_servis",
  "sms",
  "eposta",
  "yazilim",
  "muhasebe",
  "pazarlama",
  "vergi",
  "diger",
];

export const METHOD_OPTIONS: PaymentMethod[] = ["havale", "nakit", "kredi_karti", "diger"];

export const STATUS_OPTIONS: FinanceStatus[] = ["demo", "active", "paused", "churned"];

/* ------------------------------------------------------------------ */
/* Normalizasyon (fetch sınırı — zorunlu)                              */
/* ------------------------------------------------------------------ */

/**
 * PostgREST numeric'i STRING döndürür ("1500.00"). Normalize edilmezse toplamlar string
 * birleştirmesine ("01500.00200.00"), karşılaştırmalar string karşılaştırmasına döner
 * ("900.00" >= "1500.00" → true). Ham satır asla aşağı sızmamalı.
 */
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => (v == null ? null : String(v));

export function normalizeAccount(r: Record<string, unknown>): FinanceAccount {
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    display_name: String(r.display_name ?? ""),
    status: (r.status as FinanceStatus) ?? "demo",
    monthly_fee: num(r.monthly_fee) ?? 0,
    payment_day: num(r.payment_day),
    demo_start: str(r.demo_start),
    demo_end: str(r.demo_end),
    billing_start_month: str(r.billing_start_month),
    billing_end_month: str(r.billing_end_month),
    note: str(r.note),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export function normalizePayment(r: Record<string, unknown>): FinancePayment {
  return {
    id: String(r.id),
    account_id: String(r.account_id),
    period_month: String(r.period_month),
    amount: num(r.amount) ?? 0,
    paid_at: String(r.paid_at),
    method: (r.method as PaymentMethod) ?? "diger",
    note: str(r.note),
    created_at: String(r.created_at),
  };
}

export function normalizeTemplate(r: Record<string, unknown>): FinanceExpenseTemplate {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    category: (r.category as ExpenseCategory) ?? "diger",
    amount: num(r.amount) ?? 0,
    active: Boolean(r.active),
    note: str(r.note),
    created_at: String(r.created_at),
  };
}

export function normalizeExpense(r: Record<string, unknown>): FinanceExpense {
  return {
    id: String(r.id),
    period_month: String(r.period_month),
    title: String(r.title ?? ""),
    category: (r.category as ExpenseCategory) ?? "diger",
    amount: num(r.amount) ?? 0,
    expense_date: str(r.expense_date),
    template_id: str(r.template_id),
    note: str(r.note),
    created_at: String(r.created_at),
  };
}

/* ------------------------------------------------------------------ */
/* Ay / tarih yardımcıları — hepsi string-in / string-out              */
/* ------------------------------------------------------------------ */

// dayjs'e tr locale yüklemek global locale'i değiştirir ve diğer sayfaları etkiler;
// ay adlarını sabit diziden okumak yan etkisiz.
const MONTH_NAMES_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const MONTH_SHORT_TR = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

/** İstanbul günü. dayjsTR() SADECE burada ve currentMonthTR()'de çağrılır. */
export function todayTR(): DateStr {
  return dayjsTR().format("YYYY-MM-DD");
}

/** İstanbul gününe göre içinde bulunduğumuz ay. */
export function currentMonthTR(): MonthStr {
  return dayjsTR().startOf("month").format("YYYY-MM-DD");
}

/** "2026-07-19" → "2026-07-01". Girdi tarih-only string olmalı (timestamptz değil). */
export function toMonthStr(d: string): MonthStr {
  return dayjs.utc(d).startOf("month").format("YYYY-MM-DD");
}

export function addMonths(m: MonthStr, n: number): MonthStr {
  return dayjs.utc(m).add(n, "month").startOf("month").format("YYYY-MM-DD");
}

/** Artan sırada n ay; anchor sonuncu eleman. Grafik iskeleti bununla kurulur. */
export function lastNMonths(anchor: MonthStr, n: number): MonthStr[] {
  const out: MonthStr[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addMonths(anchor, -i));
  return out;
}

export function daysInMonthOf(m: MonthStr): number {
  return dayjs.utc(m).daysInMonth();
}

/** "Temmuz 2026" */
export function monthLabelTR(m: MonthStr): string {
  const d = dayjs.utc(m);
  return `${MONTH_NAMES_TR[d.month()]} ${d.year()}`;
}

/** "Tem 26" — grafik ekseni için. */
export function monthShortLabelTR(m: MonthStr): string {
  const d = dayjs.utc(m);
  return `${MONTH_SHORT_TR[d.month()]} ${String(d.year()).slice(2)}`;
}

/** "19.07.2026"; boş/geçersizde "—". */
export function formatDateTR(d: DateStr | null | undefined): string {
  if (!d) return "—";
  const p = dayjs.utc(d);
  return p.isValid() ? p.format("DD.MM.YYYY") : "—";
}

/** to - from, gün cinsinden. Negatif = to geçmişte. */
export function diffDays(from: DateStr, to: DateStr): number {
  return dayjs.utc(to).diff(dayjs.utc(from), "day");
}

/* ------------------------------------------------------------------ */
/* Para                                                                */
/* ------------------------------------------------------------------ */

/** tr-TR / ₺. Boş veya sayı olmayanda "—" (projedeki fmt* konvansiyonu). */
export function fmtTry(n: number | null | undefined, digits: 0 | 2 = 0): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/* ------------------------------------------------------------------ */
/* Domain mantığı (saf)                                                */
/* ------------------------------------------------------------------ */

export function sumPaid(paymentsOfPeriod: FinancePayment[]): number {
  return paymentsOfPeriod.reduce((s, p) => s + p.amount, 0);
}

/**
 * Vade günü: min(payment_day, ayın son günü); payment_day null ise ayın son günü.
 * 31 → Şubat'ta 28/29'a clamp edilir. daysInMonth() core dayjs, ek plugin gerekmez.
 */
export function dueDateOf(acc: Pick<FinanceAccount, "payment_day">, m: MonthStr): DateStr {
  const dim = daysInMonthOf(m);
  const raw = acc.payment_day ?? dim;
  const day = Math.min(Math.max(Math.trunc(raw), 1), dim);
  return dayjs.utc(m).date(day).format("YYYY-MM-DD");
}

type BillingWindowFields = Pick<
  FinanceAccount,
  "status" | "billing_start_month" | "billing_end_month"
>;

/**
 * Bu hesap `m` ayında faturalanabilir miydi / faturalanabilir mi?
 *
 * GEÇMİŞ aylar faturalama penceresine, CARİ/GELECEK ay canlı `status`'e güvenir —
 * pause/churn geçmişi tutulmadığı için bugünün rakamını `status` yönetir.
 */
export function isMonthInBillingWindow(acc: BillingWindowFields, m: MonthStr, today: DateStr): boolean {
  // 1) demo / hiç faturalanmamış
  if (!acc.billing_start_month) return false;
  // 2) hesap o ay henüz yoktu
  if (m < acc.billing_start_month) return false;
  // 2b) o aydan sonra churn oldu
  if (acc.billing_end_month && m > acc.billing_end_month) return false;
  // 3) cari/gelecek ay: paused/churned/demo faturalanmaz
  if (m >= toMonthStr(today) && acc.status !== "active") return false;
  return true;
}

type PaymentStatusFields = BillingWindowFields & Pick<FinanceAccount, "monthly_fee" | "payment_day">;

/**
 * Dört eyleme dönük durum üretir:
 *   Ödendi   → iş bitti
 *   Kısmi    → kalanı kovala
 *   Gecikti  → hiç ödemedi ve vade geçti, sert kovala
 *   Bekliyor → vadesi gelmedi
 * Kısmi, Gecikti'nin önünde: aksi halde Kısmi neredeyse ölü bir duruma düşerdi.
 * "Geciken kısmi" ayrımı rozetten değil, isOverdue()'dan okunur (satır tonu + KPI).
 */
export function getPaymentStatus(
  acc: PaymentStatusFields,
  paymentsOfPeriod: FinancePayment[],
  periodMonth: MonthStr,
  today: DateStr,
): PaymentStatus {
  if (!isMonthInBillingWindow(acc, periodMonth, today)) return "kapsam_disi";
  if (acc.monthly_fee <= 0) return "kapsam_disi";

  const total = sumPaid(paymentsOfPeriod);
  if (total + PAID_EPSILON >= acc.monthly_fee) return "odendi";
  if (total > 0) return "kismi";
  // Vade gününün KENDİSİ gecikme değil — kesin büyük.
  if (today > dueDateOf(acc, periodMonth)) return "gecikti";
  return "bekliyor";
}

/**
 * Rozetten BAĞIMSIZ: kısmi ödenmiş ama vadesi geçmiş hesap da true döner.
 * Bekleyen/Geciken KPI ayrımı ve satır tonu bunu kullanır.
 */
export function isOverdue(
  acc: PaymentStatusFields,
  paymentsOfPeriod: FinancePayment[],
  periodMonth: MonthStr,
  today: DateStr,
): boolean {
  if (!isMonthInBillingWindow(acc, periodMonth, today)) return false;
  if (acc.monthly_fee <= 0) return false;
  if (sumPaid(paymentsOfPeriod) + PAID_EPSILON >= acc.monthly_fee) return false;
  return today > dueDateOf(acc, periodMonth);
}

/** Kalan bakiye; kapsam dışında veya kapanmışsa 0. */
export function outstandingOf(
  acc: PaymentStatusFields,
  paymentsOfPeriod: FinancePayment[],
  periodMonth: MonthStr,
  today: DateStr,
): number {
  if (!isMonthInBillingWindow(acc, periodMonth, today)) return 0;
  const rem = acc.monthly_fee - sumPaid(paymentsOfPeriod);
  return rem > PAID_EPSILON ? rem : 0;
}

/** Kalan gün; negatif = süresi dolmuş. demo_end yoksa null (asla 0 sayılmaz). */
export function getDemoDaysLeft(demoEnd: DateStr | null, today: DateStr): number | null {
  if (!demoEnd) return null;
  return diffDays(today, demoEnd);
}

export function demoUrgency(daysLeft: number | null): DemoUrgency {
  if (daysLeft == null) return "unknown";
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 3) return "critical";
  if (daysLeft <= SOON_DAYS) return "warning";
  return "ok";
}

/** Seçili ayda faturalanabilir hesapların monthly_fee toplamı. */
export function expectedRevenue(accounts: FinanceAccount[], m: MonthStr, today: DateStr): number {
  return accounts.reduce(
    (s, a) => s + (isMonthInBillingWindow(a, m, today) ? a.monthly_fee : 0),
    0,
  );
}

/** Aydan bağımsız: bugünkü aktif hesapların ücret toplamı. */
export function mrr(accounts: FinanceAccount[]): number {
  return accounts.reduce((s, a) => s + (a.status === "active" ? a.monthly_fee : 0), 0);
}
