import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  calculateInvoice,
  type InvoiceBreakdown,
  type TariffType,
} from "@/components/utils/calculateInvoice";

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
  } = props;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [altBreakdown, setAltBreakdown] = useState<InvoiceBreakdown | null>(
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
    assumedContractKw: number;
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
          .select("terim, gerilim, tarife, btv_enabled")
          .eq("user_id", uid)
          .eq("subscription_serno", subscriptionSerno)
          .maybeSingle();

        if (cancel) return;
        if (settingsErr) throw settingsErr;
        if (!settings?.terim || !settings?.gerilim || !settings?.tarife) {
          throw new Error("Tesis ayarları eksik (terim/gerilim/tarife).");
        }

        const currentTerm = mapTariffTypeToTerm(tariffType);
        const altTerm = flipTerm(currentTerm);

        const gerilim = String(settings.gerilim);
        const tarife = String(settings.tarife);
        const btvEnabled = settings.btv_enabled ?? true;

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

        let assumedContractKw = 0;
        let contractPowerKw = 0;
        let monthFinalDemandKwForCalc = 0;
        let powerPriceForCalc = 0;
        let powerExcessPriceForCalc = 0;

        if (altTariffType === "dual") {
          const base = hasDemandData ? Number(monthFinalDemandKw ?? 0) : 0;
          assumedContractKw = base > 0 ? base * 1.1 : 0;

          contractPowerKw = assumedContractKw;
          monthFinalDemandKwForCalc = assumedContractKw;

          powerPriceForCalc = altPowerPrice;
          powerExcessPriceForCalc = altPowerExcessPrice;
        }

        const breakdown = calculateInvoice({
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
          assumedContractKw,
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
  ]);

  const altTotalWithExtras = useMemo(() => {
    if (!altBreakdown) return null;
    const m = hasYekdemMahsup && yekdemMahsup != null ? Number(yekdemMahsup) : 0;
    return altBreakdown.totalInvoice + m + (Number(digerDegerler ?? 0) || 0);
  }, [altBreakdown, hasYekdemMahsup, yekdemMahsup, digerDegerler]);

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
            {altMeta.altTariffType === "dual" && altMeta.assumedContractKw > 0 && (
              <> • Varsayılan sözleşme gücü: {altMeta.assumedContractKw.toFixed(3)} kW (demand×1.1)</>
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

    {/* ✅ Tasarruf / Optimal */}
    {currentTotalWithMahsup != null && altTotalWithExtras != null && (
      (() => {
        const diff = Number(currentTotalWithMahsup) - Number(altTotalWithExtras); 
        // diff > 0 => alternatif daha ucuz => tasarruf

        if (diff > 0) {
          return (
            <div className="mt-1 text-xs font-medium text-emerald-700">
              Tek terime geçilince tasarruf: {fmtMoney2(diff)} TL
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
                    {fmtUnit(unitPriceEnergy)} TL/kWh × {fmtKwh(totalConsumptionKwh)} kWh
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.energyCharge)}</td>
                </tr>

                {Number(trafoDegeri ?? 0) > 0 && (
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Trafo Kaybı</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {fmtUnit(unitPriceEnergy)} TL/kWh × {fmtKwh(trafoDegeri)} kWh
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.trafoCharge)}</td>
                  </tr>
                )}

                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4">Dağıtım Bedeli</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {fmtUnit(altMeta.altUnitPriceDistribution)} TL/kWh × {fmtKwh(totalConsumptionKwh)} kWh
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.distributionCharge)}</td>
                </tr>

                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4">BTV</td>
                  <td className="py-2 pr-4 text-neutral-600">Enerji bedeli × BTV</td>
                  <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.btvCharge)}</td>
                </tr>

                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-4">Güç Bedeli</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {altMeta.altTariffType === "dual"
                      ? "Güç bedeli × varsayılan sözleşme gücü"
                      : "Tek terimde yok"}
                  </td>
                  <td className="py-2 pr-4 text-right">{fmtMoney2(altBreakdown.powerBaseCharge)}</td>
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
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
