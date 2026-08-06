//src/components/dashboard/shared/SnapshotGesOlmasaydiCard.tsx
//
// Snapshot detay sayfasının en altındaki "GES Olmasaydı Faturanız" kartı.
// Model: GesSavingsSection'ın SNAPSHOT dalı; bilinçli farklar:
//  • Dönem = snapshot'ın kendi dönemi (M-1'e sabit değil) → backdated dahil çalışır.
//  • lisansli_satis'ta GİZLENMEZ — parametre motora geçilir (lisanslı satış dalı
//    erişilebilir kalır; dört dal aynen korunur).
//  • yekdem_official fallback YOK (tablo canlı DB'de yok): monthly_yekdem
//    (snapshot, 20260806_002) → subscription_yekdem canlı → eksikse hesap YOK.
//  • mevcutFatura sayfanın "Ödenecek Toplam"ının (liveTotalWithMahsup)
//    pass-through'u — ASLA yeniden türetilmez.
//  • reactivePenaltyCharge liveBreakdown'dan (override-farkındalıklı) — Kart 1
//    ile aynı bazda kalması için (GesSavingsSection ham snapshot değeri okur).
// Eksik veri → kart hiç render edilmez; tek satır nötr mesaj (eksik veri adlı).
// GES ilişkisi olmayan tesis veya Metod 4 → hiçbir şey render edilmez
// (InvoiceDetail'deki FAB kapısının aynası: methodId !== 4 && (hasGes || alıcı)).

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import GesSavingsCard from "@/components/dashboard/shared/GesSavingsCard";
import {
  calculateGesOlmasaydi,
  type GesOlmasaydiResult,
} from "@/components/utils/calculateGesOlmasaydi";
import {
  methodInputsFromSnapshotRow,
  type InvoiceSnapshotRow,
} from "@/components/utils/invoiceSnapshots";
import { coerceInvoiceMethodId } from "@/lib/invoiceMethods";
import type { MethodInvoiceBreakdown } from "@/components/utils/calculateInvoiceNetMethods";
import type { GesUretimSatisiResult } from "@/lib/ges/gesUretimSatisi";

type Props = {
  userId: string;
  row: InvoiceSnapshotRow;
  /** Sayfanın override-farkındalıklı replay'i (buildSnapshotBreakdown). */
  liveBreakdown: MethodInvoiceBreakdown | null;
  /** Sayfadaki "Ödenecek Toplam (Mahsup Dahil)" — Kart 1 pass-through. */
  liveTotalWithMahsup: number;
  /** Efektif (override'lı) enerji birim fiyatı — sayfadaki kartla aynı kaynak. */
  effUnitPriceEnergy: number | null;
  /** Sayfanın GES Üretim Satışı sonucu (donmuş/canlı dağıtım oranıyla). */
  gesSatisResult: GesUretimSatisiResult | null;
};

type ViewState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "info"; message: string }
  | { kind: "result"; result: GesOlmasaydiResult };

export default function SnapshotGesOlmasaydiCard({
  userId,
  row,
  liveBreakdown,
  liveTotalWithMahsup,
  effUnitPriceEnergy,
  gesSatisResult,
}: Props) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    const methodId = coerceInvoiceMethodId(row.invoice_method);
    // Metod 4 (GES'siz düz fatura): kart anlam taşımıyor → hiç render etme.
    if (methodId === 4) {
      setView({ kind: "hidden" });
      return;
    }

    let cancel = false;
    (async () => {
      try {
        setView({ kind: "loading" });

        const periodLabel =
          row.month_label ??
          `${String(row.period_month).padStart(2, "0")}.${row.period_year}`;

        const [settingsRes, plantsRes] = await Promise.all([
          supabase
            .from("subscription_settings")
            .select("kbk, lisansli_satis, anlik_uretim_kullanimi")
            .eq("user_id", userId)
            .eq("subscription_serno", row.subscription_serno)
            .maybeSingle(),
          supabase
            .from("ges_plants")
            .select("id")
            .eq("user_id", userId)
            .eq("is_active", true)
            .eq("linked_serno", row.subscription_serno),
        ]);
        if (cancel) return;
        if (plantsRes.error) throw plantsRes.error;

        const settings = (settingsRes.data ?? null) as {
          kbk: number | null;
          lisansli_satis: boolean | null;
          anlik_uretim_kullanimi: boolean | null;
        } | null;

        const hasOwnPlants = (plantsRes.data?.length ?? 0) > 0;
        const allocatedKwh =
          row.allocated_ges_kwh != null ? Number(row.allocated_ges_kwh) : null;

        // GES ilişkisi yok (kendi santrali yok + mahsup tahsisi yok) → kart da mesaj da yok.
        if (!hasOwnPlants && !((allocatedKwh ?? 0) > 0)) {
          setView({ kind: "hidden" });
          return;
        }

        if (!liveBreakdown) {
          setView({
            kind: "info",
            message: `${periodLabel} fatura kalemleri yeniden hesaplanamadığından GES Olmasaydı hesabı yapılamadı.`,
          });
          return;
        }

        if (effUnitPriceEnergy == null) {
          setView({
            kind: "info",
            message: `${periodLabel} enerji birim fiyatı bulunmadığından GES Olmasaydı hesabı yapılamadı.`,
          });
          return;
        }

        // monthlyYekdem: snapshot (monthly_yekdem) → canlı subscription_yekdem → eksik.
        // Eksik veri 0 SAYILMAZ — hesap hiç gösterilmez (spec).
        let monthlyYekdem =
          row.monthly_yekdem != null ? Number(row.monthly_yekdem) : null;
        if (monthlyYekdem == null) {
          const yekRes = await supabase
            .from("subscription_yekdem")
            .select("yekdem_value")
            .eq("user_id", userId)
            .eq("subscription_serno", row.subscription_serno)
            .eq("period_year", row.period_year)
            .eq("period_month", row.period_month)
            .maybeSingle();
          if (cancel) return;
          if (yekRes.error) throw yekRes.error;
          monthlyYekdem =
            yekRes.data?.yekdem_value != null ? Number(yekRes.data.yekdem_value) : null;
        }
        if (monthlyYekdem == null) {
          setView({
            kind: "info",
            message: `${periodLabel} YEKDEM değeri bulunmadığından GES Olmasaydı hesabı yapılamadı.`,
          });
          return;
        }

        // KBK: snapshot-önce (m2/3 + backdated damgası) → canlı ayar → motor default'u 1.
        const kbkSnap = row.kbk != null ? Number(row.kbk) : null;
        const kbkLive = settings?.kbk != null ? Number(settings.kbk) : null;
        const kbk = (kbkSnap ?? kbkLive ?? 1) || 1;

        const mode: "producer" | "receiver" =
          !hasOwnPlants && (allocatedKwh ?? 0) > 0 ? "receiver" : "producer";

        const res = await calculateGesOlmasaydi({
          supabase,
          userId,
          subscriptionSerno: Number(row.subscription_serno),
          periodYear: row.period_year,
          periodMonth: row.period_month,
          mode,
          // Bilinçli canlı okuma (GesSavingsSection ile aynı gerekçe): fiziksel
          // tesis özelliği; sonradan düzeltilirse karşı-olgusal geriye dönük düzelsin.
          anlikUretimKullanimi: settings?.anlik_uretim_kullanimi ?? null,
          // Kart 1 = sayfadaki Ödenecek Toplam ile birebir (pass-through).
          mevcutFatura: liveTotalWithMahsup,
          mevcutBirimFiyat: effUnitPriceEnergy,
          mevcutTuketimKwh: Number(row.total_consumption_kwh) || 0,
          verisMahsupKwh: Number(liveBreakdown.verisMahsupKwh) || 0,
          satisKwh: Number(liveBreakdown.verisFazlaKwh) || 0,
          // Sayfanın GES Üretim Satışı sonucu; oran hâlâ çözülüyorsa 0 ile
          // hesaplanır, sonuç gelince effect yeniden koşar (deps'te).
          satisNetGelir: gesSatisResult?.satisNetGelir ?? 0,
          yekdemMahsup: Number(row.yekdem_mahsup) || 0,
          digerDegerler: Number(row.diger_degerler) || 0,
          allocatedKwh,
          monthlyYekdem,
          kbk,
          unitPriceAdjustment: Number(row.unit_price_adjustment) || 0,
          unitPriceDistribution: Number(row.unit_price_distribution) || 0,
          btvRate: Number(row.btv_rate) || 0,
          vatRate: Number(row.vat_rate) || 0,
          tariffType: (row.tariff_type as "single" | "dual") ?? "single",
          contractPowerKw: Number(row.contract_power_kw) || 0,
          monthFinalDemandKw: Number(row.month_final_demand_kw) || 0,
          powerPrice: Number(row.power_price) || 0,
          powerExcessPrice: Number(row.power_excess_price) || 0,
          reactivePenaltyCharge: Number(liveBreakdown.reactivePenaltyCharge) || 0,
          trafoDegeri: Number(row.trafo_degeri) || 0,
          onYil: row.on_yil ?? undefined,
          perakendeEnerjiBedeli: row.perakende_enerji_bedeli ?? undefined,
          // Snapshot-önce; dört dalın lisanslı satış dalı erişilebilir kalır.
          lisansliSatis: row.lisansli_satis ?? settings?.lisansli_satis ?? false,
          invoiceMethodId: methodId,
          // Metod 2/3 karşı-olgusal YEK Farkı girdileri snapshot'tan.
          methodInputs: methodInputsFromSnapshotRow(row) ?? null,
        });
        if (cancel) return;

        if (!res) {
          setView({
            kind: "info",
            message: `${periodLabel} için GES üretim/veriş verisi bulunmadığından GES Olmasaydı hesabı yapılamadı.`,
          });
          return;
        }

        setView({ kind: "result", result: res });
      } catch (e: any) {
        console.error("SnapshotGesOlmasaydiCard error:", e);
        if (!cancel) {
          setView({
            kind: "info",
            message: "GES Olmasaydı hesabı bu dönem için yapılamadı.",
          });
        }
      }
    })();

    return () => {
      cancel = true;
    };
  }, [userId, row, liveBreakdown, liveTotalWithMahsup, effUnitPriceEnergy, gesSatisResult]);

  if (view.kind === "hidden") return null;

  if (view.kind === "loading") {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        GES Olmasaydı hesaplanıyor…
      </p>
    );
  }

  if (view.kind === "info") {
    // Eksik veri: kart YOK — tek satır nötr bilgi (spec).
    return <p className="mt-4 text-sm text-neutral-500">{view.message}</p>;
  }

  return (
    <section className="mt-4 rounded-2xl border border-neutral-200/60 bg-white shadow-sm p-6">
      <GesSavingsCard variant="inline" result={view.result} />
    </section>
  );
}
