//src/pages/InvoiceSnapshotDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { getInvoiceSnapshot, type InvoiceSnapshotRow } from "@/components/utils/invoiceSnapshots";
import { calculateInvoice, type InvoiceBreakdown, type TariffType } from "@/components/utils/calculateInvoice";
import GesUretimSatisiCard from "@/components/dashboard/shared/GesUretimSatisiCard";
import { calculateGesUretimSatisi } from "@/lib/ges/gesUretimSatisi";

const fmtMoney2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtKwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const fmtUnit = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

export default function InvoiceSnapshotDetail() {
  const { session, loading: sessionLoading } = useSession();
  const uid = session?.user?.id ?? null;
  const navigate = useNavigate();

  const params = useParams();
  const sub = Number(params.sub);
  const year = Number(params.year);
  const month = Number(params.month);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [row, setRow] = useState<InvoiceSnapshotRow | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const data = await getInvoiceSnapshot({
          userId: uid,
          subscriptionSerno: sub,
          periodYear: year,
          periodMonth: month,
          invoiceType: "billed",
        });

        if (cancel) return;
        if (!data) throw new Error("Bu dönem için kayıtlı snapshot bulunamadı.");

        setRow(data);
      } catch (e: any) {
        if (!cancel) setErr(e?.message ?? "Fatura snapshot detayı yüklenemedi.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, sub, year, month]);

const yekdemCell = useMemo(() => {
  if (!row) return null;

  if (!row.has_yekdem_mahsup) {
    return {
      text: "Önceki dönem YEKDEM verileri girilmemiş.",
      cls: "text-neutral-900",
    };
  }

  const v = Number(row.yekdem_mahsup ?? 0);
  const cls = v > 0 ? "text-red-600" : "text-emerald-600";
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";

  return { text: `${sign}${fmtMoney2(Math.abs(v))} TL`, cls };
}, [row]);



    const digerDegerler = useMemo(() => {
    if (!row) return 0;
    const v = Number((row as any).diger_degerler ?? 0);
    return Number.isFinite(v) ? v : 0;
  }, [row]);

  // Eski snapshot'larda dağıtım bedeli yanlış kayıtlı olabilir (üretim>tüketim
  // durumunda negatif). Saklı input'lardan canlı hesaplayıp doğru değerleri
  // gösteriyoruz. Yeni snapshot'lar zaten doğru yazılıyor.
  const liveBreakdown = useMemo<InvoiceBreakdown | null>(() => {
    if (!row) return null;
    try {
      return calculateInvoice({
        totalConsumptionKwh: Number(row.total_consumption_kwh ?? 0),
        unitPriceEnergy: Number(row.unit_price_energy ?? 0),
        unitPriceDistribution: Number(row.unit_price_distribution ?? 0),
        btvRate: Number(row.btv_rate ?? 0),
        vatRate: Number(row.vat_rate ?? 0),
        tariffType: ((row.tariff_type as TariffType) ?? "single"),
        contractPowerKw: Number(row.contract_power_kw ?? 0),
        monthFinalDemandKw: Number(row.month_final_demand_kw ?? 0),
        powerPrice: Number(row.power_price ?? 0),
        powerExcessPrice: Number(row.power_excess_price ?? 0),
        reactivePenaltyCharge: Number(row.reactive_penalty_charge ?? 0),
        trafoDegeri: Number(row.trafo_degeri ?? 0),
        totalProductionKwh: Number(row.total_production_kwh ?? 0),
        onYil: row.on_yil ?? true,
        perakendeEnerjiBedeli: Number(row.perakende_enerji_bedeli ?? 0),
        usdKur: Number(row.usd_kur ?? 0),
        lisansliSatis: (row as any).lisansli_satis ?? false,
      });
    } catch {
      return null;
    }
  }, [row]);

  // Eski toplam (mahsup dahil) ile yeni toplamı tutarlı şekilde gösterelim.
  const liveTotalWithMahsup = useMemo(() => {
    if (!row || !liveBreakdown) return Number(row?.total_with_mahsup ?? 0);
    const yekdem = Number(row.yekdem_mahsup ?? 0);
    return liveBreakdown.totalInvoice + yekdem + digerDegerler;
  }, [row, liveBreakdown, digerDegerler]);

  // GES Üretim Satışı dağıtım kesinti oranı:
  //  • Yeni snapshot'larda donmuş değer (row.ges_satis_dagitim_bedeli) kullanılır.
  //  • Eski snapshot'larda (null) subscription_settings + distribution_tariff_official'dan
  //    canlı fallback ile çekilir (GES sayfasının davranışıyla tutarlı).
  const [gesSatisDagitimRate, setGesSatisDagitimRate] = useState<number | null>(null);
  useEffect(() => {
    if (!row || !uid) {
      setGesSatisDagitimRate(null);
      return;
    }
    // Fazla satışı yoksa hesaba gerek yok.
    const fazlaKwh = Number(liveBreakdown?.verisFazlaKwh ?? 0);
    if (!(fazlaKwh > 0)) {
      setGesSatisDagitimRate(null);
      return;
    }

    const stored = (row as any).ges_satis_dagitim_bedeli;
    if (stored != null && Number.isFinite(Number(stored))) {
      setGesSatisDagitimRate(Number(stored));
      return;
    }

    let cancel = false;
    (async () => {
      try {
        const settingsRes = await supabase
          .from("subscription_settings")
          .select("terim, gerilim, tarife, lisansli_satis")
          .eq("user_id", uid)
          .eq("subscription_serno", sub)
          .maybeSingle();
        if (cancel || !settingsRes.data) return;

        const lisansliSatis =
          (row as any).lisansli_satis ?? (settingsRes.data as any).lisansli_satis ?? false;

        const tariff = await supabase
          .from("distribution_tariff_official")
          .select("dagitim_uretici_1, dagitim_uretici_2")
          .eq("terim", settingsRes.data.terim)
          .eq("gerilim", settingsRes.data.gerilim)
          .eq("tarife", settingsRes.data.tarife)
          .maybeSingle();
        if (cancel) return;

        const rate = lisansliSatis
          ? Number(tariff.data?.dagitim_uretici_1) || 0
          : Number(tariff.data?.dagitim_uretici_2) || 0;
        setGesSatisDagitimRate(rate);
      } catch {
        if (!cancel) setGesSatisDagitimRate(0);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [row, uid, sub, liveBreakdown]);

  // GES Üretim Satışı kart sonucu (fazla satışı + donmuş/canlı dağıtım oranı).
  const gesSatisResult = useMemo(() => {
    if (!row || !liveBreakdown) return null;
    const fazlaKwh = Number(liveBreakdown.verisFazlaKwh ?? 0);
    if (!(fazlaKwh > 0) || gesSatisDagitimRate == null) return null;
    return calculateGesUretimSatisi({
      satisKwh: fazlaKwh,
      onYil: row.on_yil ?? false,
      usdKur: Number(row.usd_kur ?? 0),
      perakendeEnerjiBedeli: Number(row.perakende_enerji_bedeli ?? 0),
      dagitimBedeli: gesSatisDagitimRate,
    });
  }, [row, liveBreakdown, gesSatisDagitimRate]);



  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Fatura Detay (Snapshot)</h1>
          <p className="text-sm text-neutral-500">
            {row?.month_label ?? `${String(month).padStart(2, "0")}.${year}`} • Tesis {sub}
          </p>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-[14px] text-neutral-700 hover:bg-neutral-50"
        >
          ← Geri
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading && <div className="text-sm text-neutral-500">Yükleniyor…</div>}

      {!loading && row && (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500 mb-1">Toplam Tüketim (kWh)</p>
              <p className="text-xl font-semibold text-neutral-900">{fmtKwh(row.total_consumption_kwh)}</p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500 mb-1">Enerji Birim Fiyatı</p>
              <p className="text-sm text-neutral-500">(PTF + YEKDEM) × KBK</p>
              <p className="mt-1 text-xl font-semibold text-neutral-900">
                {fmtUnit(row.unit_price_energy)} TL/kWh
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500 mb-1">Ödenecek Toplam (Mahsup Dahil)</p>
              <p className="mt-1 text-xl font-semibold text-neutral-900">
                {fmtMoney2(liveTotalWithMahsup)} TL
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-800 mb-2">Güç & Demand</h2>
            <p className="text-sm text-neutral-600">
              Maks demand: <span className="font-semibold">{Number(row.month_final_demand_kw ?? 0).toFixed(3)} kW</span>
              {" • "}Sözleşme gücü: <span className="font-semibold">{Number(row.contract_power_kw ?? 0).toFixed(3)} kW</span>
            </p>
            {!row.has_demand_data && (
              <p className="mt-1 text-xs text-neutral-500">Not: Bu ay için demand verisi yoksa 0 kaydedilmiş olabilir.</p>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3">Fatura Kalemleri</h2>

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
                      {fmtUnit(row.unit_price_energy)} TL/kWh × {fmtKwh(row.total_consumption_kwh)} kWh
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtMoney2(liveBreakdown?.energyCharge ?? row.energy_charge)}</td>
                  </tr>

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Dağıtım Bedeli</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {fmtUnit(liveBreakdown?.effectiveDistributionUnitPrice ?? row.effective_distribution_unit_price ?? row.unit_price_distribution)} TL/kWh × {fmtKwh(liveBreakdown?.distributionChargeKwh ?? (Number(row.total_consumption_kwh ?? 0) - Number(row.veris_kwh ?? 0)))} kWh
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtMoney2(liveBreakdown?.distributionCharge ?? row.distribution_charge)}</td>
                  </tr>

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">BTV (%{((Number(row.btv_rate ?? 0)) * 100).toFixed(2)})</td>
                    <td className="py-2 pr-4 text-neutral-600">Net enerji bedeli × BTV oranı</td>
                    <td className="py-2 pr-4 text-right">{fmtMoney2(liveBreakdown?.btvCharge ?? row.btv_charge)}</td>
                  </tr>

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Güç Bedeli (Limit içi)</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {row.tariff_type === "dual" ? "Güç bedeli × sözleşme gücü" : "Tek terimde güç bedeli yok"}
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtMoney2(liveBreakdown?.powerBaseCharge ?? row.power_base_charge)}</td>
                  </tr>

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Güç Bedeli Aşım</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      {row.tariff_type === "dual" ? "Aşan kısım × aşım birim fiyatı" : "Tek terimde yok"}
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtMoney2(liveBreakdown?.powerExcessCharge ?? row.power_excess_charge)}</td>
                  </tr>

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">Reaktif Ceza Bedeli</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      Ri %{Number(row.reactive_ri_percent ?? 0).toFixed(1)} / Rc %{Number(row.reactive_rc_percent ?? 0).toFixed(1)}
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtMoney2(liveBreakdown?.reactivePenaltyCharge ?? row.reactive_penalty_charge)}</td>
                  </tr>

                  {Number(row.trafo_degeri ?? 0) > 0 && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4">Trafo Bedeli</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {fmtUnit(row.unit_price_energy)} TL/kWh × {fmtKwh(row.trafo_degeri)} kWh
                      </td>
                      <td className="py-2 pr-4 text-right">{fmtMoney2(liveBreakdown?.trafoCharge ?? row.trafo_charge)}</td>
                    </tr>
                  )}

                  {/* Yalnızca veriş MAHSUBU faturadan düşülür. Fazla üretim satışı
                      aşağıdaki "GES Üretim Satışı" kartında ayrı gösterilir. */}
                  {Number(liveBreakdown?.verisMahsupBedeli ?? 0) > 0 && (
                    <tr className="border-b border-neutral-100">
                      <td className="py-2 pr-4 text-emerald-700">Veriş Mahsup (Birim Fiyat)</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {fmtUnit(row.unit_price_energy)} TL/kWh × {fmtKwh(Number(liveBreakdown?.verisMahsupKwh ?? 0))} kWh
                      </td>
                      <td className="py-2 pr-4 text-right text-emerald-700">
                        −{fmtMoney2(liveBreakdown?.verisMahsupBedeli)}
                      </td>
                    </tr>
                  )}

                  <tr className="border-t border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">KDV Hariç Toplam</td>
                    <td className="py-2 pr-4 text-neutral-600">Ara toplam</td>
                    <td className="py-2 pr-4 text-right font-semibold">{fmtMoney2(liveBreakdown?.subtotalBeforeVat ?? row.subtotal_before_vat)}</td>
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">KDV (%{((Number(row.vat_rate ?? 0)) * 100).toFixed(2)})</td>
                    <td className="py-2 pr-4 text-neutral-600">Ara toplam × KDV</td>
                    <td className="py-2 pr-4 text-right font-semibold">{fmtMoney2(liveBreakdown?.vatCharge ?? row.vat_charge)}</td>
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">Genel Toplam (KDV Dahil)</td>
                    <td className="py-2 pr-4 text-neutral-600">Bu dönem (mahsup hariç)</td>
                    <td className="py-2 pr-4 text-right font-semibold">{fmtMoney2(liveBreakdown?.totalInvoice ?? row.total_invoice)} TL</td>
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-2 pr-4 font-semibold">Önceki Dönem YEKDEM Mahsubu</td>
                    <td className="py-2 pr-4 text-neutral-600">M-1 için (yekdem_final - yekdem_value)</td>
                    <td className={`py-2 pr-4 text-right font-semibold ${yekdemCell?.cls ?? ""}`}>
                      {yekdemCell?.text ?? "—"}
                    </td>
                  </tr>

{digerDegerler !== 0 && (
  <tr className="border-b border-neutral-100">
    <td className="py-2 pr-4 font-semibold">Diğer Bedeller</td>
    <td className="py-2 pr-4 text-neutral-600">
      KDV dahil şekilde Diğer Bedeller
    </td>
    <td className="py-2 pr-4 text-right font-semibold">
      {digerDegerler > 0 ? "+" : "-"}
      {fmtMoney2(Math.abs(digerDegerler))} TL
    </td>
  </tr>
)}

                  <tr>
                    <td className="py-3 pr-4 font-semibold text-neutral-900">Genel Toplam (YEKDEM Mahsubu Dahil)</td>
                    <td className="py-3 pr-4 text-neutral-600">Ödenecek toplam</td>
                    <td className="py-3 pr-4 text-right text-lg font-semibold text-neutral-900">
                      {fmtMoney2(liveTotalWithMahsup)} TL
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* GES Üretim Satışı — fazla üretim satışı, faturaya dahil DEĞİL */}
          {gesSatisResult && (
            <GesUretimSatisiCard
              result={gesSatisResult}
              lisansliSatis={(row as any).lisansli_satis ?? false}
            />
          )}
        </>
      )}
    </DashboardShell>
  );
}
