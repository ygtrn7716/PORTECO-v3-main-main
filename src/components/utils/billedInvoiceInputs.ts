// src/components/utils/billedInvoiceInputs.ts
//
// KEYFİ DÖNEM için faturalanan (billed) fatura girdilerini toplar.
// Admin "Fatura Düzenleme" sayfasının (Aşama 2) canlı önizlemesini besler.
//
// Neden ayrı dosya (InvoiceDetail'den çağırmak yerine):
//  1. InvoiceDetail'in pipeline'ı M-1'e sabit (dayjsTR().subtract(1,"month")) ve
//     PTF'yi `monthly_ptf_prev_sub` RPC'sinden alıyor. O RPC hem döneme sabit
//     hem de `where ch.user_id = auth.uid()` filtreli → admin BAŞKA bir
//     kullanıcının tesisi için çağırdığında NULL döner. Yani RPC admin
//     tarafında kullanılamaz; PTF client-side hesaplanmak zorunda.
//  2. InvoiceDetail'in effect'i koşulsuz olarak invoice_snapshots'a upsert
//     ediyor. Önizleme hiçbir şey YAZMAMALI.
//  3. InvoiceDetail müşteri yüzeyi — Aşama 2'de dokunulmuyor.
//
// ⚠️ PTF KOLON TUZAĞI: epias_ptf_hourly.ptf_tl_kwh canlıda son aylarda tamamen
// NULL (2026-05/06/07: 0 satır dolu), ptf_tl_mwh ise %100 dolu. Bu yüzden
// calculateInvoiceToDate.ts'deki fetchPtfMapToDate deseni (önce ptf_tl_kwh,
// fallback yalnız "kolon yok" hatasında) BURADA KULLANILMAZ — boş map dönerdi.
// RPC'nin kendisi de ptf_tl_mwh/1000 okur; biz de öyle yapıyoruz.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dayjsTR } from "@/lib/dayjs";
import { fetchAllConsumption, fetchAllPtf } from "@/lib/paginatedFetch";
import {
  getFacilityAllocation,
  applyAllocationToHourlyRows,
} from "@/components/utils/gesAllocation";
import {
  type TariffType,
} from "@/components/utils/calculateInvoice";
import {
  calculateInvoiceForMethod,
  methodForProvider,
  resolveInvoiceMethods,
  type InvoiceMethodId,
} from "@/lib/invoiceMethods";
import {
  assembleMethodInputs,
  computeHourlyNetAggregates,
} from "@/components/utils/hourlyNetAggregates";
import type {
  InvoiceMethodInputs,
  MethodInvoiceBreakdown,
} from "@/components/utils/calculateInvoiceNetMethods";
import {
  applyReactiveValueOverrides,
  computeYekdemMahsupWithOverride,
  type InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";

// InvoiceDetail:306-307 ile aynı eşikler.
const REACTIVE_LIMIT_RI = 20;
const REACTIVE_LIMIT_RC = 15;

const num = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const mapTermToTariffType = (term: string | null | undefined): TariffType =>
  term === "cift_terim" ? "dual" : "single";

/** epias_ptf_hourly saat anahtarı — calculateInvoiceToDate.ts:39-42 ile aynı. */
const hourKeyUtc = (ts: any): string => new Date(ts).toISOString().slice(0, 13);

export type BilledInvoiceInputs = {
  periodYear: number;
  periodMonth: number;
  monthLabel: string;

  // ── calculateInvoice girdileri (DOĞAL — override calculateInvoice içinde uygulanır)
  totalConsumptionKwh: number;
  unitPriceEnergy: number;
  unitPriceDistribution: number;
  btvRate: number;
  vatRate: number;
  tariffType: TariffType;
  contractPowerKw: number;
  monthFinalDemandKw: number;
  powerPrice: number;
  powerExcessPrice: number;
  trafoDegeri: number;
  totalProductionKwh: number;
  onYil: boolean;
  perakendeEnerjiBedeli: number;
  usdKur: number;
  lisansliSatis: boolean;
  excludeDistributionCharge: boolean;
  netPositiveDrawKwh: number;
  netExcessFeedKwh: number;

  // ── reaktif ham veriler (payload override'ı + ceza hesabı için)
  totalRi: number;
  totalRc: number;
  reactiveUnitPrice: number;

  // ── toplam ekleri
  /** DOĞAL mahsup (override'sız). Efektif değer için buildBreakdownFromInputs. */
  yekdemMahsup: number;
  hasYekdemMahsup: boolean;
  digerDegerler: number;

  // ── YEKDEM mahsup ham girdileri (Aşama 3 — admin override formu + önizleme)
  /** Mahsup dönemi P−1 etiketi, örn. "Mayıs 2026". */
  mahsupPeriodLabel: string;
  /** P−1 toplam tüketim (kWh). Veri yoksa 0. */
  mahsupNaturalTotalKwh: number;
  /** subscription_yekdem.yekdem_value (tahmini), yoksa null. */
  mahsupNaturalYekdemValue: number | null;
  /** subscription_yekdem.yekdem_final (kesin), yoksa null. */
  mahsupNaturalYekdemFinal: number | null;

  // ── gösterim / guard / snapshot yazımı
  monthlyPTF: number;
  monthlyYekdem: number;
  kbk: number;
  unitPriceAdjustment: number;
  multiplier: number;
  hasDemandData: boolean;
  isKayseriOsb: boolean;
  provider: string | null;
  // Tedarik firmasından çözülen fatura metodu + firma anahtarı (snapshot damgası).
  invoiceMethodId: InvoiceMethodId;
  invoiceFrom: string | null;
  /** Metod 2/3 saatlik-net girdileri. Metod 1 tesisinde null. */
  methodInputs: InvoiceMethodInputs | null;
  terim: string | null;
  dagitimUreticiBedeli: number;
  allocatedGesKwh: number | null;
  ptfCoveredKwh: number;
  ptfMissingKwh: number;

  /** Hesabı engellemeyen ama admine gösterilmesi gereken durumlar. */
  warnings: string[];
};

/** Bu dönem için hesap yapılamadığında sebebini taşır (UI "veri yok" mesajı). */
export type BilledInvoiceInputsResult =
  | { ok: true; inputs: BilledInvoiceInputs }
  | { ok: false; reason: string };

/**
 * Geriye dönük (backdated) fatura akışının manuel YEKDEM girdileri.
 * Semantik: DB'deki non-null değer HER ZAMAN kazanır; fallback yalnız DB'de
 * null/eksik olan alanı doldurur (sistemde kayıtlı değer override EDİLEMEZ).
 * subscription_yekdem'e asla yazılmaz — yalnız hesapta kullanılır ve snapshot'a
 * donmuş halde kaydedilir.
 */
export type YekdemFallback = {
  /** Dönem M yekdem_value (TL/kWh, çıplak). */
  yekdemValue?: number | null;
  /** Dönem M usd_kur (on_yil satış fiyatlaması). */
  usdKur?: number | null;
  /** Dönem M diğer bedeller (± TL). */
  digerDegerler?: number | null;
  /** M-1 yekdem_value — Metod 1 mahsubu / Metod 2-3 YEK Farkı. */
  prevYekdemValue?: number | null;
  /** M-1 yekdem_final — Metod 1 mahsubu / Metod 2-3 YEK Farkı. */
  prevYekdemFinal?: number | null;
};

async function fetchSubYekdem(
  supabase: SupabaseClient,
  p: { uid: string; sub: number; year: number; month: number }
): Promise<{ yekdem_value: number | null; usd_kur: number | null }> {
  // NOT: subscription_yekdem'de legacy year/month kolonları YOK (canlı DB'de
  // doğrulandı) — yalnız period_year/period_month var.
  const { data, error } = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value, usd_kur")
    .eq("user_id", p.uid)
    .eq("subscription_serno", p.sub)
    .eq("period_year", p.year)
    .eq("period_month", p.month)
    .maybeSingle();

  if (error) throw error;
  return {
    yekdem_value: data?.yekdem_value != null ? Number(data.yekdem_value) : null,
    usd_kur: data?.usd_kur != null ? Number(data.usd_kur) : null,
  };
}

async function fetchSubYekdemForMahsup(
  supabase: SupabaseClient,
  p: { uid: string; sub: number; year: number; month: number }
): Promise<{ yekdem_value: number | null; yekdem_final: number | null } | null> {
  const { data, error } = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value, yekdem_final")
    .eq("user_id", p.uid)
    .eq("subscription_serno", p.sub)
    .eq("period_year", p.year)
    .eq("period_month", p.month)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/** DB'de değer yoksa null döner (0 değil) — caller fallback ?? 0 uygular.
 *  Fallback'siz yol için davranış birebir aynı (null ?? undefined ?? 0 = 0). */
async function fetchSubDigerDegerler(
  supabase: SupabaseClient,
  p: { uid: string; sub: number; year: number; month: number }
): Promise<number | null> {
  const { data, error } = await supabase
    .from("subscription_yekdem")
    .select("diger_degerler")
    .eq("user_id", p.uid)
    .eq("subscription_serno", p.sub)
    .eq("period_year", p.year)
    .eq("period_month", p.month)
    .maybeSingle();

  if (error) return null;
  const v = data?.diger_degerler;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

/**
 * Keyfi (uid, serno, yıl, ay) için faturalanan fatura girdilerini toplar.
 * HİÇBİR ŞEY YAZMAZ.
 *
 * Hata semantiği:
 *  • throw  → sorgu hatası / tesis ayarı yok / tarife eşleşmiyor (kırmızı kutu)
 *  • ok:false → hesap yapılamıyor ama bu bir hata değil (tüketim yok, YEKDEM
 *    girilmemiş, PTF kapsamı sıfır). Admin yine de override kaydedebilir.
 */
export async function fetchBilledInvoiceInputs(params: {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  periodYear: number;
  periodMonth: number;
  /** Metod çözümleme bağlamı. "admin" (default): user_integrations doğrudan
   *  sorgulanır — normal kullanıcıda RLS'e takılır ve sessizce Metod 1'e düşer.
   *  Müşteri yüzeyinden çağırırken "self" verilmeli (get_my_billing_integrations
   *  RPC'si — InvoiceDetail ile aynı yol ve aynı cache girdisi). */
  methodContext?: "self" | "admin";
  /** Backdated akışı manuel YEKDEM'i — yalnız DB'de olmayan alanı doldurur. */
  yekdemFallback?: YekdemFallback;
}): Promise<BilledInvoiceInputsResult> {
  const {
    supabase,
    userId,
    subscriptionSerno,
    periodYear,
    periodMonth,
    methodContext = "admin",
    yekdemFallback,
  } = params;

  const warnings: string[] = [];

  // .date(1): bugünün günü 29-31 iken kısa aya .month() set edilirse bir sonraki
  // aya taşar (fatura yanlış aya hesaplanır) — önce günü 1'e sabitle.
  const m = dayjsTR().date(1).year(periodYear).month(periodMonth - 1);
  const monthStart = m.startOf("month");
  const monthEndExclusive = monthStart.clone().add(1, "month");
  const startIso = monthStart.toDate().toISOString();
  const endIso = monthEndExclusive.toDate().toISOString();
  const monthLabel = monthStart.format("MMMM YYYY");

  // ── 1) Saatlik tüketim
  const hourly = await fetchAllConsumption({
    supabase,
    userId,
    subscriptionSerno,
    columns: "ts, cn, ri, rc, gn",
    startIso,
    endIso,
  });
  if (hourly.error) throw hourly.error;

  const hourlyRows = hourly.data ?? [];
  if (hourlyRows.length === 0) {
    return { ok: false, reason: "Bu tesis/dönem için saatlik tüketim verisi yok." };
  }

  let totalConsumptionKwh = 0;
  let totalRi = 0;
  let totalRc = 0;
  let totalGn = 0;
  let netPositiveDrawKwh = 0;
  let netExcessFeedKwh = 0;

  for (const row of hourlyRows as any[]) {
    const cnH = Number(row.cn) || 0;
    const gnH = Number(row.gn) || 0;
    totalConsumptionKwh += cnH;
    totalRi += Number(row.ri) || 0;
    totalRc += Number(row.rc) || 0;
    totalGn += gnH;
    netPositiveDrawKwh += Math.max(0, cnH - gnH);
    netExcessFeedKwh += Math.max(0, gnH - cnH);
  }

  // ── 2) Talep Birleştirme tahsisi (yalnız totalGn/net değerleri değişir;
  //      totalConsumptionKwh/Ri/Rc'ye DOKUNMAZ → reaktif yüzde paydası ham kalır)
  const allocView = await getFacilityAllocation({
    supabase,
    userId,
    subscriptionSerno,
    startIso,
    endIso,
  });

  let allocatedGesKwh: number | null = null;
  if (allocView) {
    const eff = applyAllocationToHourlyRows(hourlyRows, allocView);
    totalGn = eff.totalGn;
    netPositiveDrawKwh = eff.netPositiveDrawKwh;
    netExcessFeedKwh = eff.netExcessFeedKwh;
    if (allocView.role === "assigned") allocatedGesKwh = eff.allocatedKwh;
  }

  // ── 3) PTF (client-side; monthly_ptf_prev_sub RPC'sinin formülü)
  //      RPC: sum(kwh*ptf_tl_mwh/1000) / sum(kwh)  — yalnız ptf dolu saatlerde.
  const ptfRes = await fetchAllPtf({
    supabase,
    columns: "ts, ptf_tl_mwh",
    startIso,
    endIso,
  });
  if (ptfRes.error) throw ptfRes.error;

  const ptfMap = new Map<string, number>();
  for (const row of (ptfRes.data ?? []) as any[]) {
    const mwh = num(row.ptf_tl_mwh, NaN);
    if (!Number.isFinite(mwh)) continue;
    ptfMap.set(hourKeyUtc(row.ts), mwh / 1000); // TL/kWh
  }

  let ptfCoveredKwh = 0;
  let ptfMissingKwh = 0;
  let sumPtfWeighted = 0;
  for (const row of hourlyRows as any[]) {
    const cnH = Number(row.cn) || 0;
    if (!(cnH > 0)) continue;
    const ptf = ptfMap.get(hourKeyUtc(row.ts));
    if (ptf == null || !Number.isFinite(ptf)) {
      ptfMissingKwh += cnH;
      continue;
    }
    ptfCoveredKwh += cnH;
    sumPtfWeighted += cnH * ptf;
  }

  if (!(ptfCoveredKwh > 0)) {
    return {
      ok: false,
      reason: "Bu dönem için PTF verisi yok (fiyatlanabilir saat bulunamadı).",
    };
  }
  const monthlyPTF = sumPtfWeighted / ptfCoveredKwh;

  // Metod 2/3 için saatlik-net agregalar (pos-ağırlıklı wPos dahil). Satırlar,
  // tahsis görünümü ve PTF map zaten scope'ta → ek DB turu yok. Metod 1'de kullanılmaz.
  const netAgg = computeHourlyNetAggregates({ rows: hourlyRows, view: allocView, ptfMap });

  if (ptfMissingKwh > 0) {
    warnings.push(
      `${ptfMissingKwh.toLocaleString("tr-TR", {
        maximumFractionDigits: 0,
      })} kWh için PTF verisi yok; ortalama fiyat kalan saatlerden hesaplandı.`
    );
  }

  // ── 4) YEKDEM + usd_kur
  //      NOT: yekdem_official tablosu canlı DB'de YOK → fallback yazılmadı.
  //      yekdem_value girilmemişse sahte 0 üretmek yerine hesabı durduruyoruz.
  const yekRow = await fetchSubYekdem(supabase, {
    uid: userId,
    sub: subscriptionSerno,
    year: periodYear,
    month: periodMonth,
  });
  // Backdated manuel girişi: DB non-null ise DB kazanır; yalnız null dolar.
  const effYekdemValue = yekRow.yekdem_value ?? yekdemFallback?.yekdemValue ?? null;
  if (effYekdemValue == null) {
    return {
      ok: false,
      reason: "Bu dönem için tesis YEKDEM değeri (yekdem_value) girilmemiş.",
    };
  }
  const monthlyYekdem = effYekdemValue;
  const monthlyUsdKur = yekRow.usd_kur ?? yekdemFallback?.usdKur ?? 0;

  // ── 5) Tesis ayarları
  const { data: settings, error: settingsErr } = await supabase
    .from("subscription_settings")
    .select(
      "kbk, terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil, lisansli_satis, unit_price_adjustment"
    )
    .eq("user_id", userId)
    .eq("subscription_serno", subscriptionSerno)
    .maybeSingle();

  if (settingsErr) throw settingsErr;
  if (!settings) throw new Error("Tesis ayarları (subscription_settings) bulunamadı.");

  const kbk = settings.kbk != null ? Number(settings.kbk) : 1;
  const unitPriceAdjustment = num(settings.unit_price_adjustment, 0);
  const terim = (settings.terim as string) ?? null;
  const gerilim = (settings.gerilim as string) ?? null;
  const tarife = (settings.tarife as string) ?? null;
  const contractPowerKw = num(settings.guc_bedel_limit, 0);
  const trafoDegeri = num(settings.trafo_degeri, 0);
  const onYil = (settings.on_yil as boolean) ?? false;
  const lisansliSatis = (settings.lisansli_satis as boolean) ?? false;
  const tariffType = mapTermToTariffType(terim);

  if (!terim || !gerilim || !tarife) {
    throw new Error("Tesis ayarlarında terim/gerilim/tarife eksik.");
  }

  // ── 6) owner_subscriptions (multiplier / btv / provider)
  const osRes = await supabase
    .from("owner_subscriptions")
    .select("multiplier, btv_enabled, provider")
    .eq("user_id", userId)
    .eq("subscription_serno", subscriptionSerno)
    .maybeSingle();
  if (osRes.error) throw osRes.error;

  let multiplier = num(osRes.data?.multiplier, NaN);
  let btvEnabled = (osRes.data?.btv_enabled as boolean) ?? true;
  let provider = (osRes.data?.provider as string) ?? null;

  // InvoiceDetail:599 ile aynı fallback — bazı yapılarda satır user_id'siz bulunuyor.
  if (!Number.isFinite(multiplier)) {
    const osFallback = await supabase
      .from("owner_subscriptions")
      .select("multiplier, btv_enabled, provider")
      .eq("subscription_serno", subscriptionSerno)
      .maybeSingle();
    if (!osFallback.error && osFallback.data) {
      multiplier = num(osFallback.data.multiplier, 1);
      btvEnabled = (osFallback.data.btv_enabled as boolean) ?? true;
      provider = (osFallback.data.provider as string) ?? provider;
    }
  }
  if (!Number.isFinite(multiplier)) multiplier = 1;

  const isKayseriOsb = provider === "vhs_kayseri";

  // Fatura metodu: admin bağlamında RPC işe yaramaz (auth.uid() admin'i döner,
  // bkz. dosya başındaki not) → user_integrations doğrudan sorgulanır.
  // Müşteri yüzeyi (methodContext:"self") RPC'den okur — InvoiceDetail ile aynı.
  const methodMap = await resolveInvoiceMethods(
    methodContext === "self"
      ? { context: "self", userId, supabase }
      : { context: "admin", supabase, userId }
  );
  const { methodId: invoiceMethodId, invoiceFrom } = methodForProvider(methodMap, provider);

  // ── 7) Resmi tarife
  const tariffRes = await supabase
    .from("distribution_tariff_official")
    .select(
      "dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel, perakende_enerji_bedeli, dagitim_uretici_1, dagitim_uretici_2"
    )
    .eq("terim", terim)
    .eq("gerilim", gerilim)
    .eq("tarife", tarife)
    .maybeSingle();

  if (tariffRes.error) throw tariffRes.error;
  const tariffRow = tariffRes.data;
  if (!tariffRow) throw new Error("Uygun dağıtım tarifesi bulunamadı.");

  const unitPriceDistribution = isKayseriOsb ? 0 : num(tariffRow.dagitim_bedeli, 0);
  const perakendeEnerjiBedeli = num(tariffRow.perakende_enerji_bedeli, 0);
  const dagitimUreticiBedeli = lisansliSatis
    ? num(tariffRow.dagitim_uretici_1, 0)
    : num(tariffRow.dagitim_uretici_2, 0);
  const powerPrice = num(tariffRow.guc_bedeli, 0);
  const powerExcessPrice = num(tariffRow.guc_bedeli_asim, 0);
  const btvRate = btvEnabled ? num(tariffRow.btv, 0) / 100 : 0;
  const vatRate = num(tariffRow.kdv, 0) / 100;
  const reactiveUnitPrice = num(tariffRow.reaktif_bedel, 0);

  // ── 8) Demand
  const dmRes = await supabase
    .from("demand_monthly")
    .select("period_year, period_month, max_demand_kw")
    .eq("user_id", userId)
    .eq("subscription_serno", subscriptionSerno)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .eq("is_final", true)
    .maybeSingle();
  if (dmRes.error) throw dmRes.error;

  const hasDemandData = !!dmRes.data;
  const monthFinalDemandKw = hasDemandData
    ? num(dmRes.data?.max_demand_kw, 0) * multiplier
    : 0;

  if (!hasDemandData && tariffType === "dual") {
    warnings.push(
      "Bu dönem için kesinleşmiş demand kaydı yok; güç aşım bedeli 0 hesaplandı."
    );
  }

  // ── 9) Enerji birim fiyatı (InvoiceDetail:655 ile aynı formül)
  const unitPriceEnergy = (monthlyPTF + monthlyYekdem) * kbk + unitPriceAdjustment;

  // ── 10) Diğer bedeller (DB kazanır; null ise backdated manuel girişi, o da yoksa 0)
  const dbDigerDegerler = await fetchSubDigerDegerler(supabase, {
    uid: userId,
    sub: subscriptionSerno,
    year: periodYear,
    month: periodMonth,
  });
  const digerDegerler = dbDigerDegerler ?? yekdemFallback?.digerDegerler ?? 0;

  // ── 11) YEKDEM mahsubu (dönem-göreli M-1). consumption_daily tablosu canlıda
  //       YOK → doğrudan consumption_hourly okunuyor. Fail-open → 0.
  let yekdemMahsup = 0;
  let hasYekdemMahsup = false;

  // Ham girdiler admin override formuna gider — lisanslı satışta da etiket lazım.
  const mahsupPeriod = dayjsTR()
    .date(1) // ay-sonu taşma koruması (bkz. :231)
    .year(periodYear)
    .month(periodMonth - 1)
    .subtract(1, "month");
  const mahsupPeriodLabel = mahsupPeriod.format("MMMM YYYY");
  let mahsupNaturalTotalKwh = 0;
  let mahsupNaturalYekdemValue: number | null = null;
  let mahsupNaturalYekdemFinal: number | null = null;

  if (!lisansliSatis) {
    try {
      const prevStart = mahsupPeriod.startOf("month");
      const prevEndExclusive = prevStart.clone().add(1, "month");

      const prevHourly = await fetchAllConsumption({
        supabase,
        userId,
        subscriptionSerno,
        columns: "ts, cn",
        startIso: prevStart.toDate().toISOString(),
        endIso: prevEndExclusive.toDate().toISOString(),
      });

      if (!prevHourly.error && prevHourly.data?.length) {
        mahsupNaturalTotalKwh = prevHourly.data.reduce(
          (sum: number, row: any) => sum + (Number(row.cn) || 0),
          0
        );
      }

      // Aşama 3: kapı KOŞULSUZ — override yalnız total_kwh verdiğinde doğal
      // YEKDEM değerlerinin yine de okunması ve admin formunda placeholder
      // olarak gösterilebilmesi için.
      const yRow = await fetchSubYekdemForMahsup(supabase, {
        uid: userId,
        sub: subscriptionSerno,
        year: mahsupPeriod.year(),
        month: mahsupPeriod.month() + 1,
      });

      // DB kazanır; yalnız null alanlar backdated manuel girişinden dolar.
      mahsupNaturalYekdemValue =
        (yRow?.yekdem_value != null ? Number(yRow.yekdem_value) : null) ??
        yekdemFallback?.prevYekdemValue ??
        null;
      mahsupNaturalYekdemFinal =
        (yRow?.yekdem_final != null ? Number(yRow.yekdem_final) : null) ??
        yekdemFallback?.prevYekdemFinal ??
        null;

      // Override YOK → doğal mahsup (bugünkü davranışla birebir aynı).
      const natural = computeYekdemMahsupWithOverride({
        naturalTotalKwh: mahsupNaturalTotalKwh,
        naturalYekdemOld: mahsupNaturalYekdemValue,
        naturalYekdemNew: mahsupNaturalYekdemFinal,
        kbk,
        btvRate,
        vatRate,
      });
      yekdemMahsup = natural.mahsup;
      hasYekdemMahsup = natural.has;

      if (mahsupNaturalTotalKwh > 0 && natural.missing !== "none") {
        warnings.push(
          "Önceki dönem YEKDEM verileri eksik; mahsup 0 kabul edildi."
        );
      }
    } catch {
      warnings.push("Önceki dönem YEKDEM mahsubu hesaplanamadı; 0 kabul edildi.");
      yekdemMahsup = 0;
      hasYekdemMahsup = false;
    }
  }

  // Metod 2/3 girdileri (yalnız ilgili metotta; prevSumPos snapshot→saatlik, D3).
  let methodInputs: InvoiceMethodInputs | null = null;
  if (invoiceMethodId !== 1) {
    methodInputs = await assembleMethodInputs({
      supabase,
      userId,
      subscriptionSerno,
      periodYear,
      periodMonth,
      kbk,
      tahminiYekdem: monthlyYekdem,
      current: netAgg,
    });
    // Backdated manuel M-1 YEKDEM'i: assembleMethodInputs imzası değişmeden
    // (3 başka caller'ı var) yalnız null kalan prev alanları doldurulur; DB kazanır.
    if (methodInputs && yekdemFallback) {
      methodInputs = {
        ...methodInputs,
        prevTahminiYekdem:
          methodInputs.prevTahminiYekdem ?? yekdemFallback.prevYekdemValue ?? null,
        prevGerceklesenYekdem:
          methodInputs.prevGerceklesenYekdem ?? yekdemFallback.prevYekdemFinal ?? null,
      };
    }
  }

  return {
    ok: true,
    inputs: {
      periodYear,
      periodMonth,
      monthLabel,

      totalConsumptionKwh,
      unitPriceEnergy,
      unitPriceDistribution,
      btvRate,
      vatRate,
      tariffType,
      contractPowerKw,
      monthFinalDemandKw,
      powerPrice,
      powerExcessPrice,
      trafoDegeri,
      totalProductionKwh: totalGn,
      onYil,
      perakendeEnerjiBedeli,
      usdKur: monthlyUsdKur,
      lisansliSatis,
      excludeDistributionCharge: isKayseriOsb,
      netPositiveDrawKwh,
      netExcessFeedKwh,

      totalRi,
      totalRc,
      reactiveUnitPrice,

      yekdemMahsup,
      hasYekdemMahsup,
      digerDegerler,

      mahsupPeriodLabel,
      mahsupNaturalTotalKwh,
      mahsupNaturalYekdemValue,
      mahsupNaturalYekdemFinal,

      monthlyPTF,
      monthlyYekdem,
      kbk,
      unitPriceAdjustment,
      multiplier,
      hasDemandData,
      isKayseriOsb,
      provider,
      invoiceMethodId,
      invoiceFrom,
      methodInputs,
      terim,
      dagitimUreticiBedeli,
      allocatedGesKwh,
      ptfCoveredKwh,
      ptfMissingKwh,

      warnings,
    },
  };
}

export type BilledInvoiceResult = {
  breakdown: MethodInvoiceBreakdown;
  riPercent: number;
  rcPercent: number;
  reactivePenaltyCharge: number;
  /** Efektif YEKDEM mahsubu (override uygulanmış). */
  yekdemMahsup: number;
  hasYekdemMahsup: boolean;
  totalWithMahsup: number;
};

/**
 * Girdilerden breakdown üretir. SAF — sorgu yok, form her değiştiğinde
 * çağrılabilir.
 *
 * Reaktif akışı InvoiceDetail:696-719 ile birebir aynı: payload override'ı
 * Ri/Rc toplamlarını mutlak değiştirir → yüzdeler ve ceza bu değerlerden
 * hesaplanır → kalem seviyesi (exclude/amount) override'ı calculateInvoice
 * içinde bunun ÜSTÜNE uygulanır.
 *
 * overrides verilmezse çıktı doğal faturadır (bit-identik garanti).
 */
export function buildBreakdownFromInputs(
  inputs: BilledInvoiceInputs,
  overrides?: InvoiceOverrides | null
): BilledInvoiceResult {
  const { riSum, rcSum } = applyReactiveValueOverrides(
    inputs.totalRi,
    inputs.totalRc,
    overrides
  );

  const riPercent =
    inputs.totalConsumptionKwh > 0 ? (riSum / inputs.totalConsumptionKwh) * 100 : 0;
  const rcPercent =
    inputs.totalConsumptionKwh > 0 ? (rcSum / inputs.totalConsumptionKwh) * 100 : 0;

  const penaltyEnergy =
    (riPercent > REACTIVE_LIMIT_RI ? riSum : 0) +
    (rcPercent > REACTIVE_LIMIT_RC ? rcSum : 0);
  const reactivePenaltyCharge = penaltyEnergy * inputs.reactiveUnitPrice;

  const breakdown = calculateInvoiceForMethod(
    inputs.invoiceMethodId,
    {
      totalConsumptionKwh: inputs.totalConsumptionKwh,
      unitPriceEnergy: inputs.unitPriceEnergy,
      unitPriceDistribution: inputs.unitPriceDistribution,
      btvRate: inputs.btvRate,
      vatRate: inputs.vatRate,
      tariffType: inputs.tariffType,
      contractPowerKw: inputs.contractPowerKw,
      monthFinalDemandKw: inputs.monthFinalDemandKw,
      powerPrice: inputs.powerPrice,
      powerExcessPrice: inputs.powerExcessPrice,
      reactivePenaltyCharge,
      trafoDegeri: inputs.trafoDegeri,
      totalProductionKwh: inputs.totalProductionKwh,
      onYil: inputs.onYil,
      perakendeEnerjiBedeli: inputs.perakendeEnerjiBedeli,
      usdKur: inputs.usdKur,
      lisansliSatis: inputs.lisansliSatis,
      excludeDistributionCharge: inputs.excludeDistributionCharge,
      netPositiveDrawKwh: inputs.netPositiveDrawKwh,
      netExcessFeedKwh: inputs.netExcessFeedKwh,
      methodInputs: inputs.methodInputs ?? undefined,
    },
    overrides
  );

  // YEKDEM mahsubu: override YOKSA doğal değer AYNEN kullanılır (bit-identiklik).
  // Lisanslı satış tesisinde mahsup hiç uygulanmaz — override diriltemez.
  // D4: Metod 2/3'te YEKDEM farkı zaten KDV matrahındaki bir KALEM (yekFarkiCharge)
  // olarak var → toplam-sonrası mahsup 0'a zorlanır (çift sayım önlenir).
  const isNetMethod = inputs.invoiceMethodId === 2 || inputs.invoiceMethodId === 3;
  const mahsupOv = overrides?.yekdem_mahsup;
  let yekdemMahsup = isNetMethod ? 0 : inputs.yekdemMahsup;
  let hasYekdemMahsup = isNetMethod ? false : inputs.hasYekdemMahsup;

  if (!isNetMethod && mahsupOv && !inputs.lisansliSatis) {
    const eff = computeYekdemMahsupWithOverride({
      naturalTotalKwh: inputs.mahsupNaturalTotalKwh,
      naturalYekdemOld: inputs.mahsupNaturalYekdemValue,
      naturalYekdemNew: inputs.mahsupNaturalYekdemFinal,
      kbk: inputs.kbk,
      btvRate: inputs.btvRate,
      vatRate: inputs.vatRate,
      override: mahsupOv,
    });
    yekdemMahsup = eff.mahsup;
    hasYekdemMahsup = eff.has;
  }

  return {
    breakdown,
    riPercent,
    rcPercent,
    reactivePenaltyCharge: breakdown.reactivePenaltyCharge,
    yekdemMahsup,
    hasYekdemMahsup,
    totalWithMahsup:
      breakdown.totalInvoice + yekdemMahsup + inputs.digerDegerler,
  };
}
