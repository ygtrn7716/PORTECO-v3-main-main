// src/components/dashboard/shared/GesSavingsSection.tsx
//
// GES Detay sayfasında "GES Olmasaydı Faturanız" kartı wrapper'ı.
// EnergySoldCard ile paylaşılan tesis seçimine göre invoice_snapshots + yekdem + kbk
// fetch eder ve calculateGesOlmasaydi çağırarak GesSavingsCard'ı besler.
//
// Dönem davranışı EnergySoldCard/InvoiceDetail ile ortak: snapshot varsa replay,
// yoksa fetchBilledInvoiceInputs + buildBreakdownFromInputs canlı fallback'i —
// "fatura kaydı henüz oluşturulmadı" boş hali yalnız hesap gerçekten
// yapılamıyorsa (ok:false) görünür.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { Loader2 } from "lucide-react";
import {
  calculateGesOlmasaydi,
  type GesOlmasaydiResult,
} from "@/components/utils/calculateGesOlmasaydi";
import {
  getInvoiceSnapshot,
  buildSnapshotBreakdown,
  methodInputsFromSnapshotRow,
  recomputeSnapshotTotalWithMahsup,
} from "@/components/utils/invoiceSnapshots";
import {
  fetchBilledInvoiceInputs,
  buildBreakdownFromInputs,
} from "@/components/utils/billedInvoiceInputs";
import {
  fetchInvoiceOverrides,
  resolveUnitPriceOverride,
} from "@/components/utils/invoiceOverrides";
import { coerceInvoiceMethodId } from "@/lib/invoiceMethods";
import { calculateGesUretimSatisi } from "@/lib/ges/gesUretimSatisi";
import { deriveGesSatisMahsup } from "@/lib/ges/gesSatisMahsup";
import { resolveGesSatisDagitimRate } from "@/lib/ges/gesSatisDagitimRate";
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
  let val: number | null = null;

  const r1 = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (!r1.error) {
    val = r1.data?.yekdem_value != null ? Number(r1.data.yekdem_value) : null;
  } else {
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
      val = r2.data?.yekdem_value != null ? Number(r2.data.yekdem_value) : null;
    }
  }

  if (val != null) return val || 0;

  // Tesise özel değer yoksa resmi YEKDEM'e düş (InvoiceDetail ile aynı sıra) —
  // aksi halde Kart 3 iki yüzeyde farklı çıkar. Tablo/satır yoksa 0.
  try {
    const off = await supabase
      .from("yekdem_official")
      .select("yekdem_value, yekdem_tl_per_kwh")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (!off.error && off.data) {
      if (off.data.yekdem_value != null) return Number(off.data.yekdem_value) || 0;
      if (off.data.yekdem_tl_per_kwh != null) return Number(off.data.yekdem_tl_per_kwh) || 0;
    }
  } catch {
    // yekdem_official erişilemiyorsa (lansman DB'de tablo olmayabilir) sessizce 0
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

        const [snap, kbkRow, yekdem, plantsRes] = await Promise.all([
          getInvoiceSnapshot({
            userId,
            subscriptionSerno,
            periodYear,
            periodMonth,
            invoiceType: "billed",
          }),
          supabase
            .from("subscription_settings")
            .select("kbk, lisansli_satis, anlik_uretim_kullanimi")
            .eq("user_id", userId)
            .eq("subscription_serno", subscriptionSerno)
            .maybeSingle(),
          fetchYekdemValue(userId, subscriptionSerno, periodYear, periodMonth),
          // Bu aboneliğe BAĞLI plant var mı? Yoksa ama mahsup tahsisi varsa
          // (talep birleştirme alıcısı) modül "receiver" modunda çalışır.
          supabase
            .from("ges_plants")
            .select("id")
            .eq("user_id", userId)
            .eq("is_active", true)
            .eq("linked_serno", subscriptionSerno),
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

        const hasOwnPlants = (plantsRes.data?.length ?? 0) > 0;

        // Fatura kalem override'ları — iki yolda da kullanılır. Fail-open:
        // sayfa yalnız okur; hata durumunda doğal değerler gösterilir.
        const lineOverrides = await fetchInvoiceOverrides({
          userId,
          subscriptionSerno,
          periodYear,
          periodMonth,
        }).catch((e) => {
          console.error("invoice overrides load error (ges savings):", e);
          return null;
        });
        if (cancel) return;

        let res: GesOlmasaydiResult | null;

        if (snap) {
          // ── SNAPSHOT YOLU (fatura snapshot replay'i — davranış değişmedi) ──
          const kbk = Number(kbkRow.data?.kbk) || 1;
          const allocatedKwh =
            snap.allocated_ges_kwh != null ? Number(snap.allocated_ges_kwh) : null;
          const mode =
            !hasOwnPlants && (allocatedKwh ?? 0) > 0 ? ("receiver" as const) : ("producer" as const);

          // Kart 1/2 girdileri fatura sayfasıyla (InvoiceDetail/InvoiceSnapshotDetail)
          // aynı kaynaktan: snapshot girdilerinden canlı recompute edilen breakdown.
          let verisMahsupKwh = 0;
          let satisKwh = 0;
          let satisNetGelir = 0;
          try {
            const bd = buildSnapshotBreakdown(snap);
            verisMahsupKwh = bd.verisMahsupKwh;
            satisKwh = bd.verisFazlaKwh;
            if (satisKwh > 0) {
              const dagitimRate = await resolveGesSatisDagitimRate({
                supabase,
                userId,
                subscriptionSerno,
                storedRate: snap.ges_satis_dagitim_bedeli,
                lisansliSatis: snap.lisansli_satis,
              });
              satisNetGelir = calculateGesUretimSatisi({
                satisKwh,
                onYil: snap.on_yil ?? false,
                usdKur: Number(snap.usd_kur) || 0,
                perakendeEnerjiBedeli: Number(snap.perakende_enerji_bedeli) || 0,
                dagitimBedeli: dagitimRate,
              }).satisNetGelir;
            }
          } catch {
            // recompute başarısızsa (eksik eski snapshot) mahsup/satış alt bilgileri 0 kalır
          }
          if (cancel) return;

          res = await calculateGesOlmasaydi({
            supabase,
            userId,
            subscriptionSerno,
            periodYear,
            periodMonth,
            mode,
            // Canlı okunur (snapshot kolonu gerekmez): fiziksel tesis özelliği;
            // sonradan düzeltilirse karşı-olgusalın geriye dönük düzelmesi istenir.
            anlikUretimKullanimi: (kbkRow.data as any)?.anlik_uretim_kullanimi ?? null,
            // Kart 1 = fatura sayfasındaki Ödenecek Toplam ile birebir
            // (canlı recompute + kalem override'ları; eski snapshot'larda stored total'a düşer).
            mevcutFatura: recomputeSnapshotTotalWithMahsup(snap, lineOverrides ?? undefined),
            mevcutBirimFiyat: Number(snap.unit_price_energy) || 0,
            mevcutTuketimKwh: Number(snap.total_consumption_kwh) || 0,
            verisMahsupKwh,
            satisKwh,
            satisNetGelir,
            yekdemMahsup: Number(snap.yekdem_mahsup) || 0,
            digerDegerler: Number(snap.diger_degerler) || 0,
            allocatedKwh,
            monthlyYekdem: yekdem,
            kbk,
            // Snapshot'a yazılan düzeltmeyi kullan → karşı-olgusal birim fiyat,
            // mevcutBirimFiyat (snap.unit_price_energy) ile aynı bazda kalır.
            unitPriceAdjustment: Number(snap.unit_price_adjustment) || 0,
            unitPriceDistribution: Number(snap.unit_price_distribution) || 0,
            btvRate: Number(snap.btv_rate) || 0,
            vatRate: Number(snap.vat_rate) || 0,
            tariffType: (snap.tariff_type as any) ?? "single",
            contractPowerKw: Number(snap.contract_power_kw) || 0,
            monthFinalDemandKw: Number(snap.month_final_demand_kw) || 0,
            powerPrice: Number(snap.power_price) || 0,
            powerExcessPrice: Number(snap.power_excess_price) || 0,
            reactivePenaltyCharge: Number(snap.reactive_penalty_charge) || 0,
            trafoDegeri: Number(snap.trafo_degeri) || 0,
            onYil: snap.on_yil ?? undefined,
            perakendeEnerjiBedeli: snap.perakende_enerji_bedeli ?? undefined,
            // Metod snapshot'tan okunur (null = eski kayıt → metod 1).
            invoiceMethodId: coerceInvoiceMethodId(snap.invoice_method),
            // Metod 2/3: karşı-olgusalın önceki dönem YEKDEM alanları snapshot'tan.
            methodInputs: methodInputsFromSnapshotRow(snap) ?? null,
          });
        } else {
          // ── CANLI FALLBACK (snapshot yok — fatura sayfasının canlı pipeline'ı) ──
          const live = await fetchBilledInvoiceInputs({
            supabase,
            userId,
            subscriptionSerno,
            periodYear,
            periodMonth,
            methodContext: "self",
          });
          if (cancel) return;
          if (!live.ok) {
            setError(live.reason);
            setLoading(false);
            return;
          }
          const inputs = live.inputs;
          const built = buildBreakdownFromInputs(inputs, lineOverrides ?? undefined);
          const effUnitPriceEnergy = resolveUnitPriceOverride(
            inputs.unitPriceEnergy,
            lineOverrides?.enerji
          );

          // Mahsup/satış ayrımı fatura sayfasıyla ortak türeticiden (Metod 4
          // satış kuralı dahil — snapshot yolundaki verisFazlaKwh kısıtı yok).
          const derived = deriveGesSatisMahsup({
            invoiceMethodId: inputs.invoiceMethodId,
            breakdown: built.breakdown,
            totalProductionKwh: inputs.totalProductionKwh,
            lisansliSatis: inputs.lisansliSatis,
            onYil: inputs.onYil,
            usdKur: inputs.usdKur,
            perakendeEnerjiBedeli: inputs.perakendeEnerjiBedeli,
            dagitimBedeli: inputs.dagitimUreticiBedeli,
            unitPriceEnergy: effUnitPriceEnergy,
          });

          const allocatedKwh = inputs.allocatedGesKwh;
          const mode =
            !hasOwnPlants && (allocatedKwh ?? 0) > 0 ? ("receiver" as const) : ("producer" as const);

          res = await calculateGesOlmasaydi({
            supabase,
            userId,
            subscriptionSerno,
            periodYear,
            periodMonth,
            mode,
            anlikUretimKullanimi: (kbkRow.data as any)?.anlik_uretim_kullanimi ?? null,
            // Kart 1 = fatura sayfasının canlı "Ödenecek Toplam"ı ile birebir.
            mevcutFatura: built.totalWithMahsup,
            mevcutBirimFiyat: effUnitPriceEnergy,
            mevcutTuketimKwh: inputs.totalConsumptionKwh,
            verisMahsupKwh: derived.mahsupKwh,
            satisKwh: derived.satisKwh,
            satisNetGelir: derived.satis?.satisNetGelir ?? 0,
            yekdemMahsup: built.yekdemMahsup,
            digerDegerler: inputs.digerDegerler,
            allocatedKwh,
            monthlyYekdem: inputs.monthlyYekdem,
            kbk: inputs.kbk,
            unitPriceAdjustment: inputs.unitPriceAdjustment,
            unitPriceDistribution: inputs.unitPriceDistribution,
            btvRate: inputs.btvRate,
            vatRate: inputs.vatRate,
            tariffType: inputs.tariffType,
            contractPowerKw: inputs.contractPowerKw,
            monthFinalDemandKw: inputs.monthFinalDemandKw,
            powerPrice: inputs.powerPrice,
            powerExcessPrice: inputs.powerExcessPrice,
            reactivePenaltyCharge: built.reactivePenaltyCharge,
            trafoDegeri: inputs.trafoDegeri,
            onYil: inputs.onYil,
            perakendeEnerjiBedeli: inputs.perakendeEnerjiBedeli,
            invoiceMethodId: inputs.invoiceMethodId,
            methodInputs: inputs.methodInputs,
          });
        }

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
