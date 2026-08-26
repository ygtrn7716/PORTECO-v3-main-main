// src/components/dashboard/EnergySoldCard.tsx
//
// Geçen ay için "Mahsup Edilen Enerji Bedeli" (sol) + "Devlete Satılan Enerji
// Bedeli" (sağ) + "Yıllık Satış Hakkı" üç kartlı görünüm.
//
// TEK KAYNAK: mahsup/satış ayrımı fatura motorundan gelir — ayrı paralel hesap
// YOKTUR. Akış fatura sayfası (InvoiceDetail) ile birebir aynı:
//   • Snapshot varsa → buildSnapshotBreakdown replay'i
//     (/dashboard/invoices/:sub/:year/:month sayfasıyla aynı).
//   • Snapshot yoksa → fetchBilledInvoiceInputs + buildBreakdownFromInputs
//     canlı hesabı (fatura sayfasının pipeline'ının yazma yapmayan kopyası;
//     talep birleştirme, metot 1-4, override'lar dahil). "Fatura dönemi
//     kapanmamış" boş hali YOK.
//   • İki yol da deriveGesSatisMahsup'a akar: metod-bazlı mahsup sunumu ve
//     Metod 4 satış kuralı (satış = toplam üretim) fatura sayfasıyla ortak.
// Bu bileşen HİÇBİR ŞEY YAZMAZ (snapshot upsert'i yalnız fatura sayfasında).

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import {
  getInvoiceSnapshot,
  buildSnapshotBreakdown,
} from "@/components/utils/invoiceSnapshots";
import {
  fetchBilledInvoiceInputs,
  buildBreakdownFromInputs,
} from "@/components/utils/billedInvoiceInputs";
import {
  fetchInvoiceOverrides,
  resolveUnitPriceOverride,
  type InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";
import { getFacilityAllocation } from "@/components/utils/gesAllocation";
import { coerceInvoiceMethodId } from "@/lib/invoiceMethods";
import {
  deriveGesSatisMahsup,
  type GesSatisMahsupResult,
} from "@/lib/ges/gesSatisMahsup";
import { resolveGesSatisDagitimRate } from "@/lib/ges/gesSatisDagitimRate";
import { calcYearlySatisHakkiUsage } from "@/components/utils/yearlySatisHakki";
import { GesUretimSatisiBody } from "@/components/dashboard/shared/GesUretimSatisiCard";
import TalepBirlestirmeBanner, {
  type GesAllocSummary,
} from "@/components/dashboard/shared/TalepBirlestirmeBanner";

type OsosSub = {
  subscription_serno: number;
  title: string | null;
  nickname: string | null;
};

type CalcResult = {
  donem: string;
  /** Rakamların kaynağı: fatura snapshot replay'i mi, canlı fatura hesabı mı. */
  source: "snapshot" | "live";
  /** Metod-bazlı mahsup/satış ayrımı (fatura sayfasıyla ortak türetici).
   *  null → hesap yapılamadı; liveReason nedeni taşır. */
  derived: GesSatisMahsupResult | null;
  /** Canlı hesap yapılamadığında sebep (billedInvoiceInputs ok:false mesajı). */
  liveReason: string | null;
  lisansliSatis: boolean;
  onYil: boolean;
  /** Talep Birleştirme rolü — fatura sayfasındaki banner ile aynı eşleme. */
  alloc: GesAllocSummary | null;
  // Yıllık satış hakkı (subscription_settings.satis_hakki) — takvim yılı kümülatifi
  yillikMaxSatisKwh: number | null;     // null = admin tanımlamamış
  yillikKullanilanKwh: number;          // 1 Oca → bugün arası ay-bazlı satış toplamı
  yillikKalanKwh: number | null;        // max - kullanılan; max yoksa null
  yillikKullanimYuzde: number;          // 0-100 arası (max yoksa 0)
};

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const fmtKwh = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtUnit = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

interface EnergySoldCardProps {
  onSernoChange?: (serno: number | null) => void;
}

export default function EnergySoldCard({ onSernoChange }: EnergySoldCardProps = {}) {
  const { session, loading: sessionLoading } = useSession();
  const uid = session?.user?.id ?? null;

  const [subs, setSubs] = useState<OsosSub[]>([]);
  const [selectedSerno, setSelectedSerno] = useState<number | null>(null);

  useEffect(() => {
    onSernoChange?.(selectedSerno);
  }, [selectedSerno, onSernoChange]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1) OSOS tesislerini yükle (nickname + gizli filtresi ile)
  useEffect(() => {
    if (sessionLoading || !uid) return;
    let cancel = false;

    (async () => {
      // Tesisleri al
      const { data: subsData, error: err } = await supabase
        .from("owner_subscriptions")
        .select("subscription_serno, title")
        .eq("user_id", uid);

      if (cancel) return;
      if (err) {
        setError(err.message);
        return;
      }

      const sernos = (subsData ?? [])
        .map((r: any) => Number(r.subscription_serno))
        .filter(Number.isFinite);

      // Settings'ten nickname + is_hidden al
      const nickMap = new Map<number, string | null>();
      const hiddenSet = new Set<number>();
      if (sernos.length > 0) {
        const { data: ssData } = await supabase
          .from("subscription_settings")
          .select("subscription_serno, nickname, is_hidden")
          .eq("user_id", uid)
          .in("subscription_serno", sernos);
        for (const r of (ssData ?? []) as any[]) {
          const k = Number(r.subscription_serno);
          if (!Number.isFinite(k)) continue;
          nickMap.set(k, r.nickname ?? null);
          if (r.is_hidden) hiddenSet.add(k);
        }
      }
      if (cancel) return;

      const merged: OsosSub[] = (subsData ?? [])
        .map((r: any) => ({
          subscription_serno: Number(r.subscription_serno),
          title: r.title ?? null,
          nickname: nickMap.get(Number(r.subscription_serno)) ?? null,
        }))
        .filter((s) => !hiddenSet.has(s.subscription_serno));

      setSubs(merged);
    })();

    return () => { cancel = true; };
  }, [uid, sessionLoading]);

  // 2) Hesaplama — snapshot-first, canlı fallback
  useEffect(() => {
    if (!uid || selectedSerno == null) {
      setResult(null);
      return;
    }
    let cancel = false;

    (async () => {
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        // Dönem = geçen ay (fatura sayfasıyla aynı sabit dönem davranışı).
        // Aralık konvansiyonu ay başı → sonraki ay başı (exclusive) —
        // fetchBilledInvoiceInputs / InvoiceDetail ile aynı; tahsis cache'i paylaşılır.
        const prevMonth = dayjsTR().subtract(1, "month");
        const monthStart = prevMonth.startOf("month");
        const monthEndExclusive = monthStart.clone().add(1, "month");
        const startIso = monthStart.toDate().toISOString();
        const endIso = monthEndExclusive.toDate().toISOString();
        const donem = `${MONTH_NAMES[prevMonth.month()]} ${prevMonth.year()}`;
        const periodYear = prevMonth.year();
        const periodMonth = prevMonth.month() + 1;

        // 2a) Fatura kalem override'ları — fail-closed (InvoiceDetail ile aynı):
        // override'sız doğal rakamları override'lı faturanın yanına asla koyma.
        let overrides: InvoiceOverrides | null;
        try {
          overrides = await fetchInvoiceOverrides({
            userId: uid,
            subscriptionSerno: selectedSerno,
            periodYear,
            periodMonth,
          });
        } catch (e) {
          console.error("invoice overrides load error (energy sold):", e);
          if (!cancel) {
            setError("Fatura düzeltmeleri yüklenemedi.");
            setLoading(false);
          }
          return;
        }
        if (cancel) return;

        // 2b) Paralel: snapshot + yıllık hak limiti + Talep Birleştirme görünümü
        const [snap, settingsRes, allocView] = await Promise.all([
          getInvoiceSnapshot({
            userId: uid,
            subscriptionSerno: selectedSerno,
            periodYear,
            periodMonth,
            invoiceType: "billed",
          }).catch(() => null),
          supabase
            .from("subscription_settings")
            .select("satis_hakki")
            .eq("user_id", uid)
            .eq("subscription_serno", selectedSerno)
            .maybeSingle(),
          getFacilityAllocation({
            supabase,
            userId: uid,
            subscriptionSerno: selectedSerno,
            startIso,
            endIso,
          }).catch(() => null),
        ]);
        if (cancel) return;

        // 2c) Breakdown: snapshot replay → olmazsa canlı fatura hesabı
        let derived: GesSatisMahsupResult | null = null;
        let liveReason: string | null = null;
        let source: CalcResult["source"] = "snapshot";
        let lisansliSatis = false;
        let onYil = false;
        let snapshotOk = false;

        if (snap) {
          try {
            // InvoiceSnapshotDetail ile aynı replay: saklı girdiler + override'lar.
            const breakdown = buildSnapshotBreakdown(snap, overrides ?? undefined);
            const methodId = coerceInvoiceMethodId(snap.invoice_method);
            const dagitimRate = await resolveGesSatisDagitimRate({
              supabase,
              userId: uid,
              subscriptionSerno: selectedSerno,
              storedRate: snap.ges_satis_dagitim_bedeli,
              lisansliSatis: snap.lisansli_satis,
            });
            if (cancel) return;
            lisansliSatis = snap.lisansli_satis ?? false;
            onYil = snap.on_yil ?? false;
            derived = deriveGesSatisMahsup({
              invoiceMethodId: methodId,
              breakdown,
              totalProductionKwh: Number(snap.total_production_kwh ?? 0),
              lisansliSatis,
              onYil,
              usdKur: Number(snap.usd_kur ?? 0),
              perakendeEnerjiBedeli: Number(snap.perakende_enerji_bedeli ?? 0),
              dagitimBedeli: dagitimRate,
              // Snapshot efektif fiyatı zaten taşır; override idempotent uygulanır.
              unitPriceEnergy: resolveUnitPriceOverride(
                Number(snap.unit_price_energy ?? 0),
                overrides?.enerji
              ),
            });
            snapshotOk = true;
          } catch (e) {
            // Replay edilemeyen (çok eski/eksik) snapshot → canlı yola düş.
            console.error("snapshot breakdown replay error (energy sold):", e);
          }
        }

        if (!snapshotOk) {
          source = "live";
          const res = await fetchBilledInvoiceInputs({
            supabase,
            userId: uid,
            subscriptionSerno: selectedSerno,
            periodYear,
            periodMonth,
            methodContext: "self",
          });
          if (cancel) return;
          if (!res.ok) {
            liveReason = res.reason;
          } else {
            const { breakdown } = buildBreakdownFromInputs(
              res.inputs,
              overrides ?? undefined
            );
            lisansliSatis = res.inputs.lisansliSatis;
            onYil = res.inputs.onYil;
            derived = deriveGesSatisMahsup({
              invoiceMethodId: res.inputs.invoiceMethodId,
              breakdown,
              totalProductionKwh: res.inputs.totalProductionKwh,
              lisansliSatis,
              onYil,
              usdKur: res.inputs.usdKur,
              perakendeEnerjiBedeli: res.inputs.perakendeEnerjiBedeli,
              dagitimBedeli: res.inputs.dagitimUreticiBedeli,
              unitPriceEnergy: resolveUnitPriceOverride(
                res.inputs.unitPriceEnergy,
                overrides?.enerji
              ),
            });
          }
        }
        if (cancel) return;

        // 2d) Talep Birleştirme banner özeti — InvoiceDetail'in gesAlloc eşlemesiyle aynı.
        let alloc: GesAllocSummary | null = null;
        if (allocView) {
          if (allocView.role === "assigned") {
            const allocatedKwh =
              snapshotOk && snap?.allocated_ges_kwh != null
                ? Number(snap.allocated_ges_kwh)
                : allocView.allocTotal;
            alloc = {
              role: "assigned",
              priority: allocView.priority,
              allocatedKwh,
              isSource: allocView.isSource,
            };
          } else {
            alloc = { role: "source" };
          }
        }

        // ── Yıllık Satış Hakkı (subscription_settings.satis_hakki) ──────────
        // Cari takvim yılındaki kümülatif satış kWh'ı: sadece devlete satılan
        // veriş fazlası — mahsup edilen kısım hariç. Hesap calcYearlySatisHakkiUsage
        // helper'ında, ay-bazlı `Σ max(0, ayVeriş - ayÇekiş)` ile yapılır.
        const yillikKullanilanKwh = await calcYearlySatisHakkiUsage({
          supabase,
          userId: uid,
          subscriptionSernos: [selectedSerno],
        });
        if (cancel) return;

        // Yıllık satış hakkı limiti subscription_settings.satis_hakki kolonundan okunur.
        // (Eski ges_satis_hakki tablosu legacy — bu sürümde artık sorgulanmaz.)
        const rawSatisHakki = (settingsRes.data as any)?.satis_hakki;
        const yillikMaxSatisKwh =
          rawSatisHakki != null && Number.isFinite(Number(rawSatisHakki)) && Number(rawSatisHakki) > 0
            ? Number(rawSatisHakki)
            : null;

        const yillikKalanKwh =
          yillikMaxSatisKwh != null
            ? Math.max(0, yillikMaxSatisKwh - yillikKullanilanKwh)
            : null;

        const yillikKullanimYuzde =
          yillikMaxSatisKwh != null && yillikMaxSatisKwh > 0
            ? Math.min(100, (yillikKullanilanKwh / yillikMaxSatisKwh) * 100)
            : 0;
        // ────────────────────────────────────────────────────────────────────

        if (cancel) return;
        setResult({
          donem,
          source,
          derived,
          liveReason,
          lisansliSatis,
          onYil,
          alloc,
          yillikMaxSatisKwh,
          yillikKullanilanKwh,
          yillikKalanKwh,
          yillikKullanimYuzde,
        });
      } catch (e: any) {
        if (!cancel) setError(e?.message || "Hesaplama sırasında bir hata oluştu.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [uid, selectedSerno]);

  const derived = result?.derived ?? null;

  // Satış kartı boş-durum metni — nedene göre (Metod 4'te "mahsup edildi" deme).
  const satisBosMesaj = !derived
    ? null
    : derived.mahsup.kind === "info-only"
    ? "Kepsaş faturalandırmasında veriş satışa/mahsuba yansımaz; veriş kWh'ı solda bilgi olarak gösterilir."
    : derived.mahsup.kind === "none" && derived.mahsup.reason === "method4"
    ? "Geçen ay üretim kaydı bulunamadı."
    : derived.mahsupKwh > 0
    ? "Geçen ay veriş tamamen mahsup edildi, devlete satılan fazla enerji yok."
    : "Geçen ay veriş kaydı bulunamadı.";

  return (
    <div>
      {/* Tesis Seçici */}
      <div className="mb-4">
        <select
          value={selectedSerno ?? ""}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            setSelectedSerno(v);
          }}
          className="h-10 md:h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 md:px-2 text-[16px] md:text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#0A66FF]"
        >
          <option value="">Tesis Seçin</option>
          {subs.map((s) => (
            <option key={s.subscription_serno} value={s.subscription_serno}>
              {s.nickname || s.title || `Tesis ${s.subscription_serno}`}
            </option>
          ))}
        </select>
      </div>

      {/* Tesis seçilmemiş */}
      {selectedSerno == null && !loading && (
        <p className="text-sm text-neutral-400 text-center py-8">
          Lütfen bir tesis seçin
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
          <span className="ml-2 text-sm text-neutral-500">Hesaplanıyor…</span>
        </div>
      )}

      {/* Hata */}
      {!loading && error && selectedSerno != null && (
        <p className="text-sm text-neutral-500 text-center py-8">
          {error}
        </p>
      )}

      {/* Sonuçlar — üç kart */}
      {!loading && result && (
        <div>
          <p className="text-xs text-neutral-500 mb-3">
            {result.donem}
            {result.source === "live" && derived && (
              <span className="ml-2 text-neutral-400">
                — canlı hesap, fatura sayfasıyla aynı yöntemle
              </span>
            )}
          </p>

          {/* Talep Birleştirme bilgi notu — fatura sayfasıyla ortak bileşen */}
          {derived && (
            <div className="mb-4">
              <TalepBirlestirmeBanner
                alloc={result.alloc}
                invoiceMethodId={derived.invoiceMethodId}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* SOL: Mahsup Edilen Enerji Bedeli */}
            <section className="rounded-xl border border-emerald-200/60 bg-emerald-50/30 p-5">
              <h3 className="text-sm font-semibold text-neutral-900">
                Mahsup Edilen Enerji Bedeli
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5 mb-4">
                Geçen ay faturanıza yansıyan mahsup
              </p>

              {!derived ? (
                <p className="text-sm text-neutral-500 py-6 text-center">
                  {result.liveReason ?? "Bu dönem için hesap yapılamadı."}
                </p>
              ) : derived.mahsup.kind === "none" ? (
                <p className="text-sm text-neutral-500 py-6 text-center">
                  {derived.mahsup.reason === "method4"
                    ? "Bu tesisin fatura metodunda mahsuplaşma uygulanmaz; tüm üretim satış olarak değerlendirilir."
                    : derived.mahsup.reason === "lisansli"
                    ? "Lisanslı satış tesisi: mahsuplaşma uygulanmaz; tüm veriş satılır."
                    : "Bu dönem mahsup edilen veriş yok."}
                </p>
              ) : derived.mahsup.kind === "implicit-net" ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Mahsup Edilen Veriş</span>
                      <span className="text-sm font-medium text-emerald-700">
                        {fmtKwh(derived.mahsup.kwh)} kWh
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-neutral-400">
                    Metot 2: mahsup faturada ayrı satır değil — enerji bedeli saatlik
                    mahsup sonrası net tüketim üzerinden hesaplanır.
                  </p>
                </>
              ) : derived.mahsup.kind === "info-only" ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Veriş (Bilgi)</span>
                      <span className="text-sm font-medium text-neutral-700">
                        {fmtKwh(derived.mahsup.kwh)} kWh
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-neutral-400">
                    Kepsaş faturalandırmasında veriş faturaya yansımaz (mahsup/kredi
                    yok); yalnızca bilgi amaçlı gösterilir.
                  </p>
                </>
              ) : derived.mahsup.kind === "muhtelif2" ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Mahsup Edilen Veriş</span>
                      <span className="text-sm font-medium text-emerald-700">
                        {fmtKwh(derived.mahsup.kwh)} kWh
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Mahsuplaşma Birim Fiyatı</span>
                      <span className="text-sm font-medium text-neutral-700">
                        {fmtUnit(derived.mahsup.unitPrice)} TL/kWh
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Mahsuplaşma Kredisi</span>
                      <span className="text-sm font-medium text-emerald-700">
                        −{fmtTL(derived.mahsup.kredi)} TL
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Dağıtım Bileşeni</span>
                      <span className="text-sm font-medium text-neutral-700">
                        +{fmtTL(derived.mahsup.dagitim)} TL
                      </span>
                    </div>

                    <div className="border-t border-emerald-200/70 my-2" />

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-neutral-800">Muhtelif-2 Net</span>
                      <span
                        className={`text-lg font-bold ${
                          derived.mahsup.net <= 0 ? "text-emerald-700" : "text-red-600"
                        }`}
                      >
                        {fmtTL(derived.mahsup.net)} TL
                      </span>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-neutral-400">
                    Faturanızdaki "Muhtelif-2" kalemiyle birebir aynı değerler.
                  </p>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Mahsup Edilen Veriş</span>
                      <span className="text-sm font-medium text-emerald-700">
                        {fmtKwh(derived.mahsup.kwh)} kWh
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Birim Fiyat</span>
                      <span className="text-sm font-medium text-neutral-700">
                        {fmtUnit(derived.mahsup.unitPrice)} TL/kWh
                        {derived.mahsup.capUygulandi && (
                          <span className="ml-1 text-xs text-amber-600">(perakende tavanı)</span>
                        )}
                      </span>
                    </div>

                    <div className="border-t border-emerald-200/70 my-2" />

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-neutral-800">Mahsup Tutarı</span>
                      <span className="text-lg font-bold text-emerald-700">
                        {fmtTL(derived.mahsup.tutar)} TL
                      </span>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-neutral-400">
                    Faturanızdaki "Veriş Mahsup" satırıyla birebir aynı birim fiyat ve tutar.
                  </p>
                </>
              )}
            </section>

            {/* SAĞ: Devlete Satılan Enerji Bedeli */}
            <section className="rounded-xl border border-amber-200/60 bg-amber-50/30 p-5">
              <h3 className="text-sm font-semibold text-neutral-900">
                Devlete Satılan Enerji Bedeli
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5 mb-4">
                Mahsup sonrası fazladan devlete satılan enerji
              </p>

              {!derived ? (
                <p className="text-sm text-neutral-500 py-6 text-center">
                  {result.liveReason ?? "Bu dönem için hesap yapılamadı."}
                </p>
              ) : !derived.satis ? (
                <p className="text-sm text-neutral-500 py-6 text-center">
                  {satisBosMesaj}
                </p>
              ) : (
                <GesUretimSatisiBody
                  result={derived.satis}
                  lisansliSatis={result.lisansliSatis}
                  showPerakendeFallbackNote={result.onYil}
                />
              )}
            </section>

            {/* 3. KART: Yıllık Satış Hakkı (subscription_settings.satis_hakki) */}
            <section className="rounded-xl border border-sky-200/60 bg-sky-50/30 p-5">
              <h3 className="text-sm font-semibold text-neutral-900">
                Yıllık Satış Hakkı
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5 mb-4">
                {dayjsTR().year()} yılı için kalan devlete satış hakkınız
              </p>

              {result.yillikMaxSatisKwh == null ? (
                <div className="py-6 text-center">
                  <span className="inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500">
                    Tanımlı değil
                  </span>
                  <p className="mt-3 text-xs text-neutral-400">
                    Yıllık satış hakkınız henüz sistem tarafından tanımlanmadı.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Toplam Hak</span>
                      <span className="text-sm font-medium text-sky-700">
                        {fmtKwh(result.yillikMaxSatisKwh)} kWh
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">
                        Kullanılan ({dayjsTR().year()})
                      </span>
                      <span className="text-sm font-medium text-amber-700">
                        {fmtKwh(result.yillikKullanilanKwh)} kWh
                      </span>
                    </div>

                    <div className="border-t border-sky-200/70 my-2" />

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-neutral-800">Kalan</span>
                      <span
                        className={`text-lg font-bold ${
                          (result.yillikKalanKwh ?? 0) > 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {fmtKwh(result.yillikKalanKwh ?? 0)} kWh
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-sky-100">
                      <div
                        className={`h-full transition-all ${
                          result.yillikKullanimYuzde >= 100
                            ? "bg-red-500"
                            : result.yillikKullanimYuzde >= 80
                            ? "bg-amber-500"
                            : "bg-sky-500"
                        }`}
                        style={{
                          width: `${Math.min(100, result.yillikKullanimYuzde)}%`,
                        }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
                      <span>0</span>
                      <span>%{result.yillikKullanimYuzde.toFixed(1)} kullanıldı</span>
                      <span>{fmtKwh(result.yillikMaxSatisKwh)} kWh</span>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-neutral-400">
                    1 Ocak {dayjsTR().year()} – bugün arası ay-bazlı kümülatif satış.
                  </p>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
