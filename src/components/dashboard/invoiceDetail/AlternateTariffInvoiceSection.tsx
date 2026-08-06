import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  type TariffType,
} from "@/components/utils/calculateInvoice";
import {
  calculateInvoiceForMethod,
  DEFAULT_INVOICE_METHOD,
  type InvoiceMethodId,
} from "@/lib/invoiceMethods";
import type {
  InvoiceMethodInputs,
  MethodInvoiceBreakdown,
} from "@/components/utils/calculateInvoiceNetMethods";

const fmtMoney2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtKwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const fmtUnit = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });

function mapTariffTypeToTerm(t: TariffType): "tek_terim" | "cift_terim" {
  return t === "dual" ? "cift_terim" : "tek_terim";
}

function flipTerm(term: "tek_terim" | "cift_terim") {
  return term === "cift_terim" ? "tek_terim" : "cift_terim";
}

function ogLike(gerilim: string) {
  const isLower = gerilim === gerilim.toLowerCase();
  return isLower ? "og" : "OG";
}

export default function AlternateTariffInvoiceSection(props: {
  uid: string;
  subscriptionSerno: number;

  tariffType: TariffType;
  totalConsumptionKwh: number;
  unitPriceEnergy: number;

  monthFinalDemandKw: number;
  hasDemandData: boolean;

  reactiveRiPercent: number;
  reactiveRcPercent: number;

  trafoDegeri: number;
  digerDegerler: number;

  currentTotalWithMahsup?: number;
  yekdemMahsup?: number;
  hasYekdemMahsup?: boolean;
  /** Ana faturanın çözülmüş (override-farkında) Önceki YEKDEM Mahsup / YEK Farkı TL'si
   *  (pre-VAT, m2/m3 matrah-içi). Alt karş-olgusala aynen taşınır (2H). */
  mainYekFarkiCharge?: number;

  totalProductionKwh?: number;
  onYil?: boolean;
  lisansliSatis?: boolean;
  perakendeEnerjiBedeli?: number;
  usdKur?: number;
  // Saatlik net mahsup (net üretici): alternatif tarife de aynı bazı kullanır.
  netPositiveDrawKwh?: number;
  netExcessFeedKwh?: number;
  // Tesisin fatura metodu — simülasyon da aynı metod motorunu kullansın.
  invoiceMethodId?: InvoiceMethodId;
  /** Metod 2/3 saatlik-net girdileri (InvoiceDetail'den). Metod 1'de null. */
  methodInputs?: InvoiceMethodInputs | null;
}) {
  const {
    uid,
    subscriptionSerno,
    tariffType,
    totalConsumptionKwh,
    unitPriceEnergy,
    monthFinalDemandKw,
    hasDemandData,
    reactiveRiPercent,
    reactiveRcPercent,
    trafoDegeri,
    digerDegerler,
    currentTotalWithMahsup,
    yekdemMahsup,
    hasYekdemMahsup,
    mainYekFarkiCharge,
    totalProductionKwh,
    onYil,
    lisansliSatis,
    perakendeEnerjiBedeli,
    usdKur,
    netPositiveDrawKwh,
    netExcessFeedKwh,
    invoiceMethodId = DEFAULT_INVOICE_METHOD,
    methodInputs = null,
  } = props;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // MethodInvoiceBreakdown: metod 2/3 alanları (yekTahminiCharge, muhtelif2*,
  // energyUnitPriceApplied ...) render'da açığa çıksın. Dispatcher zaten bu tipi döndürüyor.
  const [altBreakdown, setAltBreakdown] = useState<MethodInvoiceBreakdown | null>(
    null
  );
  const [altMeta, setAltMeta] = useState<{
    altTerm: "tek_terim" | "cift_terim";
    altGerilim: string;
    altTarife: string;
    altTariffType: TariffType;
    altUnitPriceDistribution: number;
    altBtvRate: number;
    altVatRate: number;
    altPowerPrice: number;
    altPowerExcessPrice: number;
    resolvedContractKw: number;
    powerSource: "limit" | "demand" | "none";
  } | null>(null);

  useEffect(() => {
    if (!uid || !subscriptionSerno) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setAltBreakdown(null);
        setAltMeta(null);

        const { data: settings, error: settingsErr } = await supabase
          .from("subscription_settings")
          .select("terim, gerilim, tarife, guc_bedel_limit")
          .eq("user_id", uid)
          .eq("subscription_serno", subscriptionSerno)
          .maybeSingle();

        if (cancel) return;
        if (settingsErr) throw settingsErr;
        if (!settings?.terim || !settings?.gerilim || !settings?.tarife) {
          throw new Error("Tesis ayarları eksik (terim/gerilim/tarife).");
        }

        // btv_enabled: owner_subscriptions'dan al
        const { data: osData } = await supabase
          .from("owner_subscriptions")
          .select("btv_enabled")
          .eq("user_id", uid)
          .eq("subscription_serno", subscriptionSerno)
          .maybeSingle();

        if (cancel) return;
        const btvEnabled = osData?.btv_enabled ?? true;

        const currentTerm = mapTariffTypeToTerm(tariffType);
        const altTerm = flipTerm(currentTerm);

        const gerilim = String(settings.gerilim);
        const tarife = String(settings.tarife);

        const altGerilim = altTerm === "cift_terim" ? ogLike(gerilim) : gerilim;

        const { data: tariffRow, error: tariffErr } = await supabase
          .from("distribution_tariff_official")
          .select(
            "dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel"
          )
          .eq("terim", altTerm)
          .eq("gerilim", altGerilim)
          .eq("tarife", tarife)
          .maybeSingle();

        if (cancel) return;
        if (tariffErr) throw tariffErr;
        if (!tariffRow)
          throw new Error(
            "Alternatif terim için uygun dağıtım tarifesi bulunamadı."
          );

        const altUnitPriceDistribution =
          tariffRow.dagitim_bedeli != null ? Number(tariffRow.dagitim_bedeli) : 0;

        const altPowerPrice =
          tariffRow.guc_bedeli != null ? Number(tariffRow.guc_bedeli) : 0;

        const altPowerExcessPrice =
          tariffRow.guc_bedeli_asim != null ? Number(tariffRow.guc_bedeli_asim) : 0;

        const altBtvRate = btvEnabled
          ? tariffRow.btv != null
            ? Number(tariffRow.btv) / 100
            : 0
          : 0;

        const altVatRate =
          tariffRow.kdv != null ? Number(tariffRow.kdv) / 100 : 0;

        const REACTIVE_LIMIT_RI = 20;
        const REACTIVE_LIMIT_RC = 15;

        const totalRi =
          (Number(reactiveRiPercent ?? 0) / 100) *
          (Number(totalConsumptionKwh ?? 0) || 0);
        const totalRc =
          (Number(reactiveRcPercent ?? 0) / 100) *
          (Number(totalConsumptionKwh ?? 0) || 0);

        const riPenaltyEnergy = reactiveRiPercent > REACTIVE_LIMIT_RI ? totalRi : 0;
        const rcPenaltyEnergy = reactiveRcPercent > REACTIVE_LIMIT_RC ? totalRc : 0;

        const reactiveUnitPrice =
          tariffRow.reaktif_bedel != null ? Number(tariffRow.reaktif_bedel) : 0;

        const reactivePenaltyChargeAlt =
          (riPenaltyEnergy + rcPenaltyEnergy) * reactiveUnitPrice;

        const altTariffType: TariffType = altTerm === "cift_terim" ? "dual" : "single";

        // Güç Bedeli kaynağı (öncelik): sözleşme gücü (guc_bedel_limit) → demand×1.1
        // türevi → yok. Sözleşme gücü ile demand ARTIK ayrı beslenir; motor güç aşımını
        // max(0, demand − sözleşme) × guc_bedeli_asim ile gerçek hesaplar (eskiden ikisi
        // eşitti, aşım yapısal olarak hep 0'dı).
        const contractKwFromLimit =
          settings.guc_bedel_limit != null &&
          Number.isFinite(Number(settings.guc_bedel_limit))
            ? Number(settings.guc_bedel_limit)
            : 0;
        const realDemandKw = hasDemandData ? Number(monthFinalDemandKw ?? 0) : 0;

        let resolvedContractKw = 0;
        let powerSource: "limit" | "demand" | "none" = "none";
        let contractPowerKw = 0;
        let monthFinalDemandKwForCalc = 0;
        let powerPriceForCalc = 0;
        let powerExcessPriceForCalc = 0;

        if (altTariffType === "dual") {
          if (contractKwFromLimit > 0) {
            resolvedContractKw = contractKwFromLimit;
            powerSource = "limit";
          } else if (realDemandKw > 0) {
            resolvedContractKw = realDemandKw * 1.1;
            powerSource = "demand";
          }

          contractPowerKw = resolvedContractKw;
          monthFinalDemandKwForCalc = realDemandKw;

          powerPriceForCalc = altPowerPrice;
          powerExcessPriceForCalc = altPowerExcessPrice;
        }

        const breakdown = calculateInvoiceForMethod(invoiceMethodId, {
          totalConsumptionKwh,
          unitPriceEnergy,
          unitPriceDistribution: altUnitPriceDistribution,
          btvRate: altBtvRate,
          vatRate: altVatRate,
          tariffType: altTariffType,
          contractPowerKw,
          monthFinalDemandKw: monthFinalDemandKwForCalc,
          powerPrice: powerPriceForCalc,
          powerExcessPrice: powerExcessPriceForCalc,
          reactivePenaltyCharge: reactivePenaltyChargeAlt,
          trafoDegeri,
          totalProductionKwh: totalProductionKwh ?? 0,
          onYil,
          lisansliSatis,
          perakendeEnerjiBedeli,
          usdKur,
          netPositiveDrawKwh,
          netExcessFeedKwh,
          methodInputs: methodInputs ?? undefined,
        });

        if (cancel) return;

        setAltBreakdown(breakdown);
        setAltMeta({
          altTerm,
          altGerilim,
          altTarife: tarife,
          altTariffType,
          altUnitPriceDistribution,
          altBtvRate,
          altVatRate,
          altPowerPrice,
          altPowerExcessPrice,
          resolvedContractKw,
          powerSource,
        });
      } catch (e: any) {
        if (!cancel) setErr(e?.message ?? "Alternatif terim hesabı yapılamadı.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [
    uid,
    subscriptionSerno,
    tariffType,
    totalConsumptionKwh,
    unitPriceEnergy,
    monthFinalDemandKw,
    hasDemandData,
    reactiveRiPercent,
    reactiveRcPercent,
    trafoDegeri,
    // Aşama 2B: metodlar ayrıştı — metod/girdi değişimi simülasyonu yeniden hesaplatmalı
    // (2A'da bilinçli ertelenmişti; artık stale-prop riski gerçek).
    invoiceMethodId,
    methodInputs,
  ]);

  // 2H — Ana faturanın dış mahsup kalemleri karş-olgusala AYNEN taşınır (yeniden hesap YOK):
  //  • yekFarki (m2/m3, matrah-içi KDV'li): altın kendi (override'sız) yekFarki'si ÇIKARILIR,
  //    ana faturanınki EKLENİR → alt zaten içeriyorsa delta 0, içermiyorsa tam fark. Doğal ve
  //    override durumu karşılıklı dışlayan olduğundan çift sayım yapısal olarak imkânsız.
  //  • m1 YEKDEM mahsubu (post-total imzalı TL) ve Diğer Bedeller: aynen (mevcut kural).
  // Böylece (ana Ödenecek − alt Ödenecek) yalnız dağıtım+güç ekseninden gelir.
  const carried = useMemo(() => {
    if (!altBreakdown) return null;
    const isNetMethod = invoiceMethodId === 2 || invoiceMethodId === 3;
    const vat = altMeta ? Number(altMeta.altVatRate) : 0;

    const yekFarkiCarried = isNetMethod
      ? (Number(mainYekFarkiCharge ?? 0) - Number(altBreakdown.yekFarkiCharge ?? 0)) * (1 + vat)
      : 0;
    const m1Mahsup =
      !isNetMethod && hasYekdemMahsup && yekdemMahsup != null ? Number(yekdemMahsup) : 0;
    const diger = Number(digerDegerler ?? 0) || 0;

    const payable = altBreakdown.totalInvoice + yekFarkiCarried + m1Mahsup + diger;
    return { yekFarkiCarried, m1Mahsup, diger, payable };
  }, [
    altBreakdown,
    altMeta,
    invoiceMethodId,
    hasYekdemMahsup,
    yekdemMahsup,
    mainYekFarkiCharge,
    digerDegerler,
  ]);

  const altTotalWithExtras = carried?.payable ?? null;

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm text-sm text-neutral-500">
        Alternatif terim hesabı yükleniyor…
      </div>
    );
  }

  if (err) {
    return (
      <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {err}
      </div>
    );
  }

  if (!altBreakdown || !altMeta) return null;

  const currentTermText = tariffType === "dual" ? "Çift Terim" : "Tek Terim";
  const altTermText = altMeta.altTariffType === "dual" ? "Çift Terim" : "Tek Terim";

  return (
    <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      {/* Header row + Detay */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-neutral-800">
            Alternatif Terim Hesabı ({currentTermText} → {altTermText})
          </h2>
          <p className="text-xs text-neutral-500">
            Tarife: {altMeta.altTarife} • Gerilim: {altMeta.altGerilim}
            {altMeta.altTariffType === "dual" && altMeta.resolvedContractKw > 0 && (
              <>
                {" "}• Sözleşme gücü: {fmtKwh(altMeta.resolvedContractKw)} kW
                {altMeta.powerSource === "demand" ? " (demand×1.1 varsayım)" : ""}
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          aria-expanded={open}
        >
          Detay
          <span className={"transition-transform " + (open ? "rotate-180" : "")}>▾</span>
        </button>
      </div>

      {/* Cards (tıklanınca aç/kapa) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-3 w-full text-left"
        aria-expanded={open}
      >
<div className="grid gap-3 md:grid-cols-2">
  <div className="rounded-xl border border-neutral-200 p-3">
    <div className="text-xs text-neutral-500">Genel Toplam (KDV Dahil)</div>
    <div className="text-base font-semibold text-neutral-900">
      {fmtMoney2(altBreakdown.totalInvoice)} TL
    </div>
  </div>

  <div className="rounded-xl border border-neutral-200 p-3">
    <div className="text-xs text-neutral-500">
      Ödenecek Toplam (Mahsup + Diğer dahil)
    </div>

    <div className="text-base font-semibold text-neutral-900">
      {fmtMoney2(altTotalWithExtras)} TL
    </div>

    {/* ✅ İşarete duyarlı: tasarruf / ek maliyet / optimal */}
    {currentTotalWithMahsup != null && altTotalWithExtras != null && (
      (() => {
        const diff = Number(currentTotalWithMahsup) - Number(altTotalWithExtras);
        // diff > 0 => alternatif daha ucuz => tasarruf; diff < 0 => daha pahalı => ek maliyet
        const EPS = 0.5;

        if (diff > EPS) {
          return (
            <div className="mt-1 text-xs font-medium text-emerald-700">
              {altTermText}e geçilince tasarruf: {fmtMoney2(diff)} TL
            </div>
          );
        }

        if (diff < -EPS) {
          return (
            <div className="mt-1 text-xs font-medium text-amber-700">
              {altTermText}e geçilince ek maliyet: {fmtMoney2(Math.abs(diff))} TL
            </div>
          );
        }

        return (
          <div className="mt-1 text-xs font-medium text-neutral-600">
            Kullandığınız tarife optimal
          </div>
        );
      })()
    )}
  </div>
</div>

      </button>

      {/* Sözleşme gücü kaynağı yoksa (limit tanımsız + demand yok) güç bedeli 0 — dürüst uyarı */}
      {altMeta.altTariffType === "dual" && altMeta.powerSource === "none" && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Sözleşme gücü tanımsız — karşılaştırma güç bedeli içermiyor.
        </div>
      )}

      {/* Smooth details */}
      <div
        className={
          "grid transition-all duration-300 ease-out " +
          (open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")
        }
      >
        <div className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b">
                  <th className="py-2 pr-4">Kalem</th>
                  <th className="py-2 pr-4">Açıklama</th>
                  <th className="py-2 pr-4 text-right">Tutar (TL)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4">Enerji Bedeli</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {/* Metod 2/3: taban NET pozitif çekiş, fiyat = wPos × KBK (T-0) */}
                    {invoiceMethodId === 2 || invoiceMethodId === 3 ? (
                      <>
                        {fmtUnit(altBreakdown.energyUnitPriceApplied ?? 0)} TL/kWh ×{" "}
                        {fmtKwh(altBreakdown.netEnergyKwh)} kWh
                      </>
                    ) : (
                      <>
                        {fmtUnit(unitPriceEnergy)} TL/kWh × {fmtKwh(totalConsumptionKwh)} kWh
                      </>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.energyCharge)}</td>
                </tr>

                {/* Metod 2: YEK Bedeli · Metod 3: Tahmini YEKDEM — taban NET (netEnergyKwh) */}
                {(invoiceMethodId === 2 || invoiceMethodId === 3) && (
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">
                      {invoiceMethodId === 2 ? "YEK Bedeli" : "Tahmini YEKDEM"}
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">
                      Tahmini YEKDEM × KBK × {fmtKwh(altBreakdown.netEnergyKwh)} kWh
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {fmtMoney2(altBreakdown.yekTahminiCharge ?? 0)}
                    </td>
                  </tr>
                )}

                {/* Önceki dönem YEKDEM farkı — veri yoksa 0 ve satır gizli */}
                {(invoiceMethodId === 2 || invoiceMethodId === 3) &&
                  (altBreakdown.yekFarkiCharge ?? 0) !== 0 && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4">
                        {invoiceMethodId === 2 ? "YEK Farkı" : "Önceki YEKDEM Mahsup"}
                      </td>
                      <td className="py-2 pr-4 text-neutral-600">
                        Önceki dönem net çekiş × (Gerçekleşen − Tahmini) × KBK
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {fmtMoney2(altBreakdown.yekFarkiCharge ?? 0)}
                      </td>
                    </tr>
                  )}

                {Number(trafoDegeri ?? 0) > 0 && (
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Trafo Kaybı</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {/* Metod 2/3: trafo da wPos × KBK ile fiyatlanır */}
                      {fmtUnit(
                        invoiceMethodId === 2 || invoiceMethodId === 3
                          ? altBreakdown.energyUnitPriceApplied ?? 0
                          : unitPriceEnergy
                      )}{" "}
                      TL/kWh × {fmtKwh(trafoDegeri)} kWh
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.trafoCharge)}</td>
                  </tr>
                )}

                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4">Dağıtım Bedeli</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {/* Efektif birim × mahsup bazı — tutarla uzlaşır (m1 saatlik-net gate dahil) */}
                    {fmtUnit(altBreakdown.effectiveDistributionUnitPrice)} TL/kWh ×{" "}
                    {fmtKwh(altBreakdown.distributionChargeKwh)} kWh
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.distributionCharge)}</td>
                </tr>

                {/* Metod 3: Muhtelif-2 (+mahsup×dağıtım − mahsup×mahsuplaşma) */}
                {invoiceMethodId === 3 && (
                  <tr className="border-b border-neutral-100">
                    <td
                      className={
                        "py-2 pr-4 " +
                        ((altBreakdown.muhtelif2Net ?? 0) < 0 ? "text-emerald-700" : "")
                      }
                    >
                      Muhtelif-2
                    </td>
                    <td className="py-2 pr-4 text-neutral-600">
                      +{fmtMoney2(altBreakdown.muhtelif2Dagitim ?? 0)} dağıtım −{" "}
                      {fmtMoney2(altBreakdown.muhtelif2MahsupKredisi ?? 0)} mahsuplaşma (
                      {fmtUnit(altBreakdown.mahsuplasmaUnitPriceApplied ?? 0)} TL/kWh ×{" "}
                      {fmtKwh(altBreakdown.verisMahsupKwh)} kWh)
                    </td>
                    <td
                      className={
                        "py-2 pr-4 text-right " +
                        ((altBreakdown.muhtelif2Net ?? 0) < 0 ? "text-emerald-700" : "")
                      }
                    >
                      {(altBreakdown.muhtelif2Net ?? 0) < 0 ? "−" : ""}
                      {fmtMoney2(Math.abs(altBreakdown.muhtelif2Net ?? 0))}
                    </td>
                  </tr>
                )}

                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4">BTV</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {invoiceMethodId === 3
                      ? "(Enerji + Tahmini YEKDEM − mahsuplaşma kredisi) × BTV"
                      : "Enerji bedeli × BTV"}
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.btvCharge)}</td>
                </tr>

                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4">Güç Bedeli</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {altMeta.altTariffType === "dual" ? (
                      altMeta.resolvedContractKw > 0 ? (
                        <>
                          {/* Gerçek çarpanlar: güç bedeli × sözleşme gücü (+ varsa aşım) */}
                          {fmtUnit(altMeta.altPowerPrice)} TL/kW ×{" "}
                          {fmtKwh(altMeta.resolvedContractKw)} kW
                          {(altBreakdown.powerExcessCharge ?? 0) > 0 && (
                            <>
                              {" "}+ aşım {fmtUnit(altMeta.altPowerExcessPrice)} TL/kW ×{" "}
                              {fmtKwh(
                                Math.max(0, Number(monthFinalDemandKw ?? 0) - altMeta.resolvedContractKw)
                              )}{" "}
                              kW
                            </>
                          )}
                        </>
                      ) : (
                        "Sözleşme gücü tanımsız"
                      )
                    ) : (
                      "Tek terimde yok"
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.powerTotalCharge)}</td>
                </tr>

                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4">Reaktif Ceza</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    Ri %{Number(reactiveRiPercent ?? 0).toFixed(1)} / Rc %{Number(reactiveRcPercent ?? 0).toFixed(1)}
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.reactivePenaltyCharge)}</td>
                </tr>

                <tr className="border-t border-neutral-200">
                  <td className="py-2 pr-4 font-semibold">KDV Hariç Toplam</td>
                  <td className="py-2 pr-4 text-neutral-600">Ara toplam</td>
                  <td className="py-2 pr-4 text-right font-semibold">
                    {fmtMoney2(altBreakdown.subtotalBeforeVat)}
                  </td>
                </tr>

                <tr className="border-b border-neutral-200">
                  <td className="py-2 pr-4 font-semibold">KDV</td>
                  <td className="py-2 pr-4 text-neutral-600">Ara toplam × KDV</td>
                  <td className="py-2 pr-4 text-right font-semibold">{fmtMoney2(altBreakdown.vatCharge)}</td>
                </tr>

                <tr>
                  <td className="py-2 pr-4 font-semibold">Genel Toplam (KDV Dahil)</td>
                  <td className="py-2 pr-4 text-neutral-600">Alternatif terim</td>
                  <td className="py-2 pr-4 text-right font-semibold">
                    {fmtMoney2(altBreakdown.totalInvoice)} TL
                  </td>
                </tr>

                {/* 2H — Ana faturadan taşınan dış mahsup kalemleri (post-total, yeniden hesap YOK).
                    Böylece Ödenecek ana faturayla aynı dış kalem setini içerir; fark yalnız
                    dağıtım+güç ekseninden gelir. */}
                {(invoiceMethodId === 2 || invoiceMethodId === 3) &&
                  (carried?.yekFarkiCarried ?? 0) !== 0 && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4">
                        {invoiceMethodId === 2 ? "YEK Farkı" : "Önceki YEKDEM Mahsup"}
                      </td>
                      <td className="py-2 pr-4 text-neutral-600">
                        Ana faturadan taşındı (KDV dahil)
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {carried!.yekFarkiCarried > 0 ? "+" : "-"}
                        {fmtMoney2(Math.abs(carried!.yekFarkiCarried))} TL
                      </td>
                    </tr>
                  )}

                {invoiceMethodId !== 2 &&
                  invoiceMethodId !== 3 &&
                  hasYekdemMahsup &&
                  (carried?.m1Mahsup ?? 0) !== 0 && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4 font-semibold">Önceki Dönem YEKDEM Mahsubu</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        Tedarikçi Tahmin − Gerçekleşen YEKDEM
                      </td>
                      <td
                        className={
                          "py-2 pr-4 text-right font-semibold " +
                          (carried!.m1Mahsup > 0 ? "text-red-600" : "text-emerald-600")
                        }
                      >
                        {carried!.m1Mahsup > 0 ? "+" : "-"}
                        {fmtMoney2(Math.abs(carried!.m1Mahsup))} TL
                      </td>
                    </tr>
                  )}

                {(carried?.diger ?? 0) !== 0 && (
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 font-semibold">Diğer Bedeller</td>
                    <td className="py-2 pr-4 text-neutral-600">KDV dahil şekilde Diğer Bedeller</td>
                    <td className="py-2 pr-4 text-right font-semibold">
                      {carried!.diger > 0 ? "+" : "-"}
                      {fmtMoney2(Math.abs(carried!.diger))} TL
                    </td>
                  </tr>
                )}

                {altTotalWithExtras != null &&
                  ((carried?.yekFarkiCarried ?? 0) !== 0 ||
                    (carried?.m1Mahsup ?? 0) !== 0 ||
                    (carried?.diger ?? 0) !== 0) && (
                    <tr className="border-t border-neutral-200">
                      <td className="py-3 pr-4 font-semibold text-neutral-900">
                        Genel Toplam (Ödenecek)
                      </td>
                      <td className="py-3 pr-4 text-neutral-600">Ödenecek toplam</td>
                      <td className="py-3 pr-4 text-right text-lg font-semibold text-neutral-900">
                        {fmtMoney2(altTotalWithExtras)} TL
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
