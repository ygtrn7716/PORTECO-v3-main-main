//src/components/utils/backdatedInvoice.ts
//
// Geriye dönük (backdated) fatura akışı: uygunluk listesi, ön kontrol,
// oluşturma ve silme. Yeni hesap dalı YOK — mevcut motor zinciri kullanılır:
// fetchBilledInvoiceInputs → buildBreakdownFromInputs → upsertInvoiceSnapshot
// (invoice_type='backdated'). subscription_yekdem'e ASLA yazılmaz; manuel
// girilen YEKDEM yalnız hesapta kullanılır ve snapshot'a donmuş kaydedilir.
//
// NOT: src/components/utils/invoiceHistory.ts ÖLÜ KODDUR (var olmayan
// invoice_history tablosu + çakışan InvoiceType tipi) — buradan import edilmez.

import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import {
  fetchBilledInvoiceInputs,
  buildBreakdownFromInputs,
  type YekdemFallback,
} from "@/components/utils/billedInvoiceInputs";
import { fetchInvoiceOverrides } from "@/components/utils/invoiceOverrides";
import {
  snapshotParamsFromEngine,
  upsertInvoiceSnapshot,
} from "@/components/utils/invoiceSnapshots";
import {
  isNetInvoiceMethod,
  resolveInvoiceMethods,
  methodForProvider,
  type InvoiceMethodId,
} from "@/lib/invoiceMethods";

/** Geriye dönük fatura açılabilen en eski dönem. Mevzuat 2026-05'te değişti;
 *  sistem güncel mevzuata göre hesaplıyor — öncesi kapsam dışı. TEK kaynak. */
export const BACKDATED_MIN_PERIOD = "2026-05";

export type EligiblePeriod = {
  year: number;
  month: number;
  /** "Mayıs 2026" — dayjsTR tr locale. */
  label: string;
};

/** Dönem başlangıcı — gün=1 sabitlemesiyle (ay-sonu taşma koruması). */
function periodStart(year: number, month: number) {
  return dayjsTR().date(1).year(year).month(month - 1).startOf("month");
}

function periodBoundsIso(year: number, month: number) {
  const start = periodStart(year, month);
  return {
    startIso: start.toDate().toISOString(),
    endIso: start.clone().add(1, "month").toDate().toISOString(),
  };
}

/** Tesis+dönem için consumption_hourly'de en az bir satır var mı? (index-only probe) */
async function hasConsumption(p: {
  userId: string;
  subscriptionSerno: number;
  year: number;
  month: number;
}): Promise<boolean> {
  const { startIso, endIso } = periodBoundsIso(p.year, p.month);
  const { data, error } = await supabase
    .from("consumption_hourly")
    .select("ts")
    .eq("user_id", p.userId)
    .eq("subscription_serno", p.subscriptionSerno)
    .gte("ts", startIso)
    .lt("ts", endIso)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * 2026-05..M-1 aralığında: tüketim verisi OLAN ve HİÇBİR tipte (billed/backdated)
 * snapshot'ı OLMAYAN dönemler. Yeniden en yeniye sıralı döner.
 */
export async function listEligiblePeriods(p: {
  userId: string;
  subscriptionSerno: number;
}): Promise<EligiblePeriod[]> {
  const min = dayjsTR(`${BACKDATED_MIN_PERIOD}-01`).startOf("month");
  const lastClosed = dayjsTR().date(1).subtract(1, "month").startOf("month");
  if (lastClosed.isBefore(min)) return [];

  // Adayları kur (min..M-1).
  const candidates: EligiblePeriod[] = [];
  for (let cur = min.clone(); !cur.isAfter(lastClosed); cur = cur.add(1, "month")) {
    candidates.push({
      year: cur.year(),
      month: cur.month() + 1,
      label: cur.format("MMMM YYYY"),
    });
  }

  // TEK sorgu: tesise ait TÜM snapshot dönemleri (tip filtresi YOK — herhangi
  // bir tip varsa dönem elenir; billed+backdated aynı dönemde birlikte olamaz).
  const snapRes = await supabase
    .from("invoice_snapshots")
    .select("period_year, period_month")
    .eq("user_id", p.userId)
    .eq("subscription_serno", p.subscriptionSerno);
  if (snapRes.error) throw snapRes.error;
  const taken = new Set(
    (snapRes.data ?? []).map(
      (r: any) => `${Number(r.period_year)}-${Number(r.period_month)}`
    )
  );

  const open = candidates.filter((c) => !taken.has(`${c.year}-${c.month}`));
  if (open.length === 0) return [];

  // Ay başına tek index-only probe (paralel).
  const withData = await Promise.all(
    open.map(async (c) => ({
      c,
      has: await hasConsumption({
        userId: p.userId,
        subscriptionSerno: p.subscriptionSerno,
        year: c.year,
        month: c.month,
      }),
    }))
  );

  return withData
    .filter((x) => x.has)
    .map((x) => x.c)
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

export type BackdatedYekdemField =
  | "yekdemValue"
  | "usdKur"
  | "digerDegerler"
  | "prevYekdemValue"
  | "prevYekdemFinal";

export type BackdatedPrecheck = {
  ok: boolean;
  /** Hesabı imkânsız kılan eksikler — akış başlatılmaz, eksik 0 SAYILMAZ. */
  missingHard: string[];
  form: {
    methodId: InvoiceMethodId;
    invoiceFrom: string | null;
    lisansliSatis: boolean;
    onYil: boolean;
    periodLabel: string;
    prevPeriodLabel: string;
    /** M-1 tüketimi var mı — yoksa mahsup/YEK Farkı tabanı yok, prev alanları sorulmaz. */
    prevConsumptionExists: boolean;
    /** Dönem içinde ham gn>0 satır var mı (satış/veriş kanıtı → usd_kur ihtiyacı). */
    feedInEvidence: boolean;
    /** DB'de MEVCUT değerler → salt okunur "sistemden geldi" gösterimi; input HİÇ render edilmez. */
    system: Record<BackdatedYekdemField, number | null>;
    /** Input render edilecek alanlar (yalnız DB'de olmayanlar). */
    ask: Record<BackdatedYekdemField, boolean>;
  } | null;
};

/**
 * Dönem için hedefli SALT OKUNUR ön kontrol. Hiçbir şey yazmaz.
 * TAVSİYE niteliğindedir — nihai otorite createBackdatedInvoice içindeki motordur
 * (fetchBilledInvoiceInputs ok:false sebebini aynen yüzeye çıkarır).
 */
export async function precheckBackdatedPeriod(p: {
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
}): Promise<BackdatedPrecheck> {
  const { userId, subscriptionSerno, periodYear, periodMonth } = p;
  const missingHard: string[] = [];

  const start = periodStart(periodYear, periodMonth);
  const prev = start.clone().subtract(1, "month");
  const { startIso, endIso } = periodBoundsIso(periodYear, periodMonth);

  const [settingsRes, ownerRes, snapRes, ptfRes, feedRes, yekPRes, yekPrevRes, consP, consPrev] =
    await Promise.all([
      supabase
        .from("subscription_settings")
        .select("kbk, terim, gerilim, tarife, on_yil, lisansli_satis")
        .eq("user_id", userId)
        .eq("subscription_serno", subscriptionSerno)
        .maybeSingle(),
      supabase
        .from("owner_subscriptions")
        .select("provider, multiplier")
        .eq("user_id", userId)
        .eq("subscription_serno", subscriptionSerno)
        .maybeSingle(),
      supabase
        .from("invoice_snapshots")
        .select("invoice_type")
        .eq("user_id", userId)
        .eq("subscription_serno", subscriptionSerno)
        .eq("period_year", periodYear)
        .eq("period_month", periodMonth)
        .limit(1),
      supabase
        .from("epias_ptf_hourly")
        .select("ts")
        .gte("ts", startIso)
        .lt("ts", endIso)
        .limit(1),
      supabase
        .from("consumption_hourly")
        .select("ts")
        .eq("user_id", userId)
        .eq("subscription_serno", subscriptionSerno)
        .gte("ts", startIso)
        .lt("ts", endIso)
        .gt("gn", 0)
        .limit(1),
      supabase
        .from("subscription_yekdem")
        .select("yekdem_value, yekdem_final, usd_kur, diger_degerler")
        .eq("user_id", userId)
        .eq("subscription_serno", subscriptionSerno)
        .eq("period_year", periodYear)
        .eq("period_month", periodMonth)
        .maybeSingle(),
      supabase
        .from("subscription_yekdem")
        .select("yekdem_value, yekdem_final, usd_kur, diger_degerler")
        .eq("user_id", userId)
        .eq("subscription_serno", subscriptionSerno)
        .eq("period_year", prev.year())
        .eq("period_month", prev.month() + 1)
        .maybeSingle(),
      hasConsumption({ userId, subscriptionSerno, year: periodYear, month: periodMonth }),
      hasConsumption({
        userId,
        subscriptionSerno,
        year: prev.year(),
        month: prev.month() + 1,
      }),
    ]);

  if (settingsRes.error) throw settingsRes.error;
  if (snapRes.error) throw snapRes.error;
  if (ptfRes.error) throw ptfRes.error;
  if (feedRes.error) throw feedRes.error;
  if (yekPRes.error) throw yekPRes.error;
  if (yekPrevRes.error) throw yekPrevRes.error;

  // Provider — billedInvoiceInputs ile aynı user_id'siz fallback.
  let provider: string | null = (ownerRes.data?.provider as string) ?? null;
  if (!ownerRes.data) {
    const osFallback = await supabase
      .from("owner_subscriptions")
      .select("provider")
      .eq("subscription_serno", subscriptionSerno)
      .maybeSingle();
    if (!osFallback.error && osFallback.data) {
      provider = (osFallback.data.provider as string) ?? null;
    }
  }

  if (!consP) missingHard.push("Bu dönem için saatlik tüketim verisi yok.");
  if ((ptfRes.data?.length ?? 0) === 0)
    missingHard.push("Bu dönem için PTF (saatlik piyasa fiyatı) verisi yok.");

  const settings = settingsRes.data as any;
  if (!settings) {
    missingHard.push("Tesis ayarları (subscription_settings) bulunamadı.");
  } else if (!settings.terim || !settings.gerilim || !settings.tarife) {
    missingHard.push("Tesis ayarlarında terim/gerilim/tarife eksik.");
  } else {
    const tariffRes = await supabase
      .from("distribution_tariff_official")
      .select("id")
      .eq("terim", settings.terim)
      .eq("gerilim", settings.gerilim)
      .eq("tarife", settings.tarife)
      .maybeSingle();
    if (tariffRes.error) throw tariffRes.error;
    if (!tariffRes.data)
      missingHard.push("Bu tesis kombinasyonu için dağıtım tarifesi kaydı bulunamadı.");
  }

  if ((snapRes.data?.length ?? 0) > 0)
    missingHard.push("Bu dönem için zaten kayıtlı bir fatura var.");

  if (missingHard.length > 0) return { ok: false, missingHard, form: null };

  // Metod çözümü — müşteri yüzeyi: InvoiceDetail ile aynı yol (self RPC).
  const methodMap = await resolveInvoiceMethods({ context: "self", userId, supabase });
  const { methodId, invoiceFrom } = methodForProvider(methodMap, provider);

  const lisansliSatis = (settings.lisansli_satis as boolean) ?? false;
  const onYil = (settings.on_yil as boolean) ?? false;
  const feedInEvidence = (feedRes.data?.length ?? 0) > 0;

  const rawNum = (v: any): number | null =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : null;

  const yekP = yekPRes.data as any;
  const yekPrev = yekPrevRes.data as any;
  const system: Record<BackdatedYekdemField, number | null> = {
    yekdemValue: rawNum(yekP?.yekdem_value),
    usdKur: rawNum(yekP?.usd_kur),
    digerDegerler: rawNum(yekP?.diger_degerler),
    prevYekdemValue: rawNum(yekPrev?.yekdem_value),
    prevYekdemFinal: rawNum(yekPrev?.yekdem_final),
  };

  // Hangi alan sorulacak: yalnız DB'de OLMAYANLAR ve methodun ihtiyaç duydukları.
  // Metod 4 (GES'siz düz fatura): mahsup/YEK Farkı ve satış yok → prev+usd sorulmaz.
  // Metod 6 (Kepsaş): önceki dönem YEKDEM mahsubu enerji fiyatına gömülür → prev SORULUR.
  // Metod 7 (Meram): sonraki ay YEKDEM mahsubu yok → prev sorulmaz.
  const needsPrev =
    (methodId === 1 || methodId === 6 || isNetInvoiceMethod(methodId)) &&
    methodId !== 7 &&
    !lisansliSatis &&
    consPrev;
  const ask: Record<BackdatedYekdemField, boolean> = {
    yekdemValue: system.yekdemValue == null,
    usdKur: methodId !== 4 && onYil && feedInEvidence && system.usdKur == null,
    digerDegerler: system.digerDegerler == null,
    prevYekdemValue: needsPrev && system.prevYekdemValue == null,
    prevYekdemFinal: needsPrev && system.prevYekdemFinal == null,
  };

  return {
    ok: true,
    missingHard: [],
    form: {
      methodId,
      invoiceFrom,
      lisansliSatis,
      onYil,
      periodLabel: start.format("MMMM YYYY"),
      prevPeriodLabel: prev.format("MMMM YYYY"),
      prevConsumptionExists: consPrev,
      feedInEvidence,
      system,
      ask,
    },
  };
}

/**
 * Geriye dönük faturayı MEVCUT motorla hesaplar ve invoice_type='backdated'
 * olarak kaydeder. manual: yalnız precheck'in "ask" ettiği alanlar dolu olmalı —
 * DB'de değeri olan alan zaten DB'den kazanır (override edilemez).
 */
export async function createBackdatedInvoice(p: {
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  manual: YekdemFallback;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { userId, subscriptionSerno, periodYear, periodMonth } = p;

  // Son kontrol: HERHANGİ bir tipte snapshot varsa oluşturma (uygunluk kuralı).
  const existing = await supabase
    .from("invoice_snapshots")
    .select("invoice_type")
    .eq("user_id", userId)
    .eq("subscription_serno", subscriptionSerno)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .limit(1);
  if (existing.error) throw existing.error;
  if ((existing.data?.length ?? 0) > 0) {
    return { ok: false, reason: "Bu dönem için zaten kayıtlı bir fatura var." };
  }

  // Motor — canlı fatura akışıyla birebir aynı pipeline, dönem parametrik.
  const res = await fetchBilledInvoiceInputs({
    supabase,
    userId,
    subscriptionSerno,
    periodYear,
    periodMonth,
    methodContext: "self",
    yekdemFallback: p.manual,
  });
  if (!res.ok) return { ok: false, reason: res.reason };
  const inputs = res.inputs;

  // Kalem override'ları: detay sayfası replay'i override'larla çalışır —
  // damgalanan toplamların kuruş-kuruş aynı kalması için burada da uygulanır.
  const overrides = await fetchInvoiceOverrides({
    userId,
    subscriptionSerno,
    periodYear,
    periodMonth,
  }).catch((e) => {
    console.error("invoice overrides load error (backdated):", e);
    return null;
  });

  const result = buildBreakdownFromInputs(inputs, overrides ?? undefined);

  await upsertInvoiceSnapshot({
    ...snapshotParamsFromEngine({
      userId,
      subscriptionSerno,
      inputs,
      result,
      overrides,
      invoiceType: "backdated",
    }),
    // Backdated damgaları: manuel YEKDEM'in tek kalıcı izi + GES Olmasaydı
    // kartının snapshot-öncelikli girdileri. Metod 2/3'te methodInputs.kbk/prev*
    // zaten kazanır (coalesce upsert içinde).
    monthlyYekdem: inputs.monthlyYekdem,
    monthlyPtf: inputs.monthlyPTF,
    kbk: inputs.kbk,
    prevYekdemTahmini: inputs.mahsupNaturalYekdemValue,
    prevYekdemGerceklesen: inputs.mahsupNaturalYekdemFinal,
  });

  return { ok: true };
}

/** Yalnız kendi 'backdated' kaydını siler (RLS politikasıyla ayna filtreler). */
export async function deleteBackdatedInvoice(p: {
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
}): Promise<void> {
  const { error } = await supabase
    .from("invoice_snapshots")
    .delete()
    .eq("user_id", p.userId)
    .eq("subscription_serno", p.subscriptionSerno)
    .eq("period_year", p.periodYear)
    .eq("period_month", p.periodMonth)
    .eq("invoice_type", "backdated");
  if (error) throw error;
}
