// src/components/dashboard/shared/GesSavingsSection.tsx
//
// GES Detay sayfasında "GES Olmasaydı Faturanız" kartı wrapper'ı.
// EnergySoldCard ile paylaşılan tesis seçimine göre invoice_snapshots + yekdem + kbk
// fetch eder ve calculateGesOlmasaydi çağırarak GesSavingsCard'ı besler.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { Loader2 } from "lucide-react";
import {
  calculateGesOlmasaydi,
  type GesOlmasaydiResult,
} from "@/components/utils/calculateGesOlmasaydi";
import { getInvoiceSnapshot, recomputeSnapshotTotalWithMahsup } from "@/components/utils/invoiceSnapshots";
import GesSavingsCard from "@/components/dashboard/shared/GesSavingsCard";

interface Props {
  userId: string;
  subscriptionSerno: number | null;
  hasGesApi: boolean;
}

async function fetchYekdemValue(
  uid: string,
  sub: number,
  year: number,
  month: number,
): Promise<number> {
  const r1 = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (!r1.error) {
    return Number(r1.data?.yekdem_value) || 0;
  }
  const msg = String(r1.error?.message ?? "");
  if (msg.includes("period_year") || msg.includes("period_month")) {
    const r2 = await supabase
      .from("subscription_yekdem")
      .select("yekdem_value")
      .eq("user_id", uid)
      .eq("subscription_serno", sub)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    return Number(r2.data?.yekdem_value) || 0;
  }
  return 0;
}

export default function GesSavingsSection({ userId, subscriptionSerno, hasGesApi }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GesOlmasaydiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lisansliSatis, setLisansliSatis] = useState(false);

  useEffect(() => {
    // Placeholder variant — API yoksa hiç fetch yapma
    if (!hasGesApi) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!userId || subscriptionSerno == null) {
      setResult(null);
      return;
    }

    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      setResult(null);
      setLisansliSatis(false);
      try {
        const prev = dayjsTR().subtract(1, "month");
        const periodYear = prev.year();
        const periodMonth = prev.month() + 1;

        const [snap, kbkRow, yekdem] = await Promise.all([
          getInvoiceSnapshot({
            userId,
            subscriptionSerno,
            periodYear,
            periodMonth,
            invoiceType: "billed",
          }),
          supabase
            .from("subscription_settings")
            .select("kbk, lisansli_satis")
            .eq("user_id", userId)
            .eq("subscription_serno", subscriptionSerno)
            .maybeSingle(),
          fetchYekdemValue(userId, subscriptionSerno, periodYear, periodMonth),
        ]);

        if (cancel) return;

        // Lisanslı Satış tesisleri: kart anlam taşımıyor (mahsuplaşma yok,
        // tasarruf kavramı için ayrı bir görselleme gerek), gizle.
        const isLisansliSatis = !!(kbkRow.data as any)?.lisansli_satis;
        setLisansliSatis(isLisansliSatis);
        if (isLisansliSatis) {
          setResult(null);
          setError(null);
          setLoading(false);
          return;
        }

        if (!snap) {
          setError("Geçen ayın fatura kaydı henüz oluşturulmadı.");
          setLoading(false);
          return;
        }

        const kbk = Number(kbkRow.data?.kbk) || 1;

        const res = await calculateGesOlmasaydi({
          supabase,
          userId,
          subscriptionSerno,
          periodYear,
          periodMonth,
          // Eski snapshot'larda dağıtım bedeli yanlış kayıtlı olabileceği
          // için canlı recompute ile düzeltilmiş "ödenecek toplam"ı kullanıyoruz.
          mevcutFatura: recomputeSnapshotTotalWithMahsup(snap),
          mevcutBirimFiyat: Number(snap.unit_price_energy) || 0,
          mevcutTuketimKwh: Number(snap.total_consumption_kwh) || 0,
          monthlyYekdem: yekdem,
          kbk,
          unitPriceDistribution: Number(snap.unit_price_distribution) || 0,
          btvRate: Number(snap.btv_rate) || 0,
          vatRate: Number(snap.vat_rate) || 0,
          tariffType: (snap.tariff_type as any) ?? "tek",
          contractPowerKw: Number(snap.contract_power_kw) || 0,
          monthFinalDemandKw: Number(snap.month_final_demand_kw) || 0,
          powerPrice: Number(snap.power_price) || 0,
          powerExcessPrice: Number(snap.power_excess_price) || 0,
          reactivePenaltyCharge: Number(snap.reactive_penalty_charge) || 0,
          trafoDegeri: Number(snap.trafo_degeri) || 0,
          onYil: snap.on_yil ?? undefined,
          perakendeEnerjiBedeli: snap.perakende_enerji_bedeli ?? undefined,
        });

        if (cancel) return;
        if (!res) {
          setError("GES üretim verisi bulunamadı.");
        } else {
          setResult(res);
        }
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Hesaplama başarısız.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [userId, subscriptionSerno, hasGesApi]);

  // Sadece-verişli kullanıcı: placeholder kart
  if (!hasGesApi) {
    return (
      <section className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm p-6">
        <GesSavingsCard variant="placeholder" />
      </section>
    );
  }

  // API'li kullanıcı — aktif tesis seçimi bekleniyor
  if (subscriptionSerno == null) {
    return null;
  }

  // Lisanslı Satış tesisi: kartı tamamen gizle.
  if (lisansliSatis) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm p-6">
      {loading && (
        <div className="flex items-center justify-center py-10 text-neutral-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-sm">GES tasarrufu hesaplanıyor…</span>
        </div>
      )}
      {!loading && error && (
        <p className="text-sm text-neutral-500 text-center py-6">{error}</p>
      )}
      {!loading && !error && result && (
        <GesSavingsCard variant="inline" result={result} />
      )}
    </section>
  );
}
