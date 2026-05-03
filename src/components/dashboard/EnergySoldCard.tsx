// src/components/dashboard/EnergySoldCard.tsx
//
// Geçen ay için "Mahsup Edilen Enerji Bedeli" (sol) + "Devlete Satılan Enerji Bedeli" (sağ)
// iki kartlı görünüm.
//
// Sol kart (mahsup): fatura ile birebir tutması için invoice_snapshots'tan
//   unit_price_energy + veris_kwh + total_consumption_kwh okur; mahsupKwh
//   client'ta min(cekis, veris) ile hesaplanır. Snapshot yoksa empty state.
// Sağ kart (satış): brüt gelir = satisKwh × perakende_enerji_bedeli (on_yil farketmez).
//   Saat-bazlı PTF mantığı kaldırıldı. Tüm satış kWh'ı, tesisin terim/gerilim/tarife
//   eşleşmesindeki perakende enerji bedeliyle çarpılır.
//   Dağıtım kesintisi on_yil flag'ine göre sabit oranla uygulanır:
//     on_yil = true  → 1,575810 TL/kWh (10 yıl üstü)
//     on_yil = false → 0,496738 TL/kWh (10 yıl altı)
//   Kaynak tablolar: consumption_hourly (gn, cn), subscription_settings (tarife, on_yil),
//   distribution_tariff_official (perakende_enerji_bedeli).

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { fetchAllConsumption } from "@/lib/paginatedFetch";
import { getInvoiceSnapshot } from "@/components/utils/invoiceSnapshots";

type OsosSub = {
  subscription_serno: number;
  title: string | null;
  nickname: string | null;
};

type CalcResult = {
  donem: string;
  toplamVerisKwh: number;
  toplamCekisKwh: number;
  mahsupKwh: number;
  satisKwh: number;
  // Sol kart (mahsup) — snapshot'tan
  hasSnapshot: boolean;
  unitPriceEnergy: number;   // snapshot.unit_price_energy [TL/kWh]
  mahsupTutari: number;      // TL
  // Sağ kart (satış) — hourly hesap
  satisBrutGelir: number;    // TL
  satisDagitimKesintisi: number; // TL
  satisNetGelir: number;     // TL
  dagitimBedeli: number;     // TL/kWh (bilgi) — on_yil'e göre sabit oran
  onYil: boolean;            // 10 yıl üstü/altı bilgisi (açıklama metni için)
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

// Devlete satılan enerji bedelinde uygulanan sabit dağıtım bedelleri (TL/kWh).
// SADECE bu kart için geçerli — fatura sayfası (calculateInvoice) dokunulmaz.
//   on_yil = true  (10 yıl üstü) → 1,575810 TL/kWh
//   on_yil = false (10 yıl altı) → 0,496738 TL/kWh
const DAGITIM_BEDELI_ON_YIL_USTU = 1.575810;
const DAGITIM_BEDELI_ON_YIL_ALTI = 0.496738;

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

  // 2) Hesaplama
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
        const prevMonth = dayjsTR().subtract(1, "month");
        const startIso = prevMonth.startOf("month").toISOString();
        const endIso = prevMonth.endOf("month").toISOString();
        const donem = `${MONTH_NAMES[prevMonth.month()]} ${prevMonth.year()}`;
        const prevYear = prevMonth.year();
        const prevMonthNum = prevMonth.month() + 1;

        // Yıllık satış hakkı için takvim yılı aralığı (1 Oca → bugün)
        const now = dayjsTR();
        const yearStart = now.startOf("year");
        const yearStartIso = yearStart.toDate().toISOString();
        const yearEndIso = now.toDate().toISOString();

        // Paralel fetch:
        //   1) Geçen ay tüketim (sağ kart cn/gn toplama)
        //   2) Settings (tarife/on_yil + satis_hakki) — yıllık satış hakkı dahil
        //   3) Geçen ay snapshot (sol kart)
        //   4) Yıllık tüketim (cari yılın 1 Oca'dan bugüne — yıllık satış hakkı kümülatifi)
        // PTF artık kullanılmıyor — brüt gelir saat-bazlı PTF değil, sabit perakende.
        // Not: ges_satis_hakki tablosu legacy; satis_hakki artık subscription_settings'te.
        const [
          hourlyRes,
          settingsRes,
          snapshotData,
          yearlyHourlyRes,
        ] = await Promise.all([
          fetchAllConsumption({
            supabase,
            userId: uid,
            subscriptionSerno: selectedSerno,
            columns: "ts, gn, cn",
            startIso,
            endIso,
            endInclusive: true,
          }),
          supabase
            .from("subscription_settings")
            .select("terim, gerilim, tarife, on_yil, satis_hakki")
            .eq("user_id", uid)
            .eq("subscription_serno", selectedSerno)
            .maybeSingle(),
          getInvoiceSnapshot({
            userId: uid,
            subscriptionSerno: selectedSerno,
            periodYear: prevYear,
            periodMonth: prevMonthNum,
            invoiceType: "billed",
          }).catch(() => null),
          fetchAllConsumption({
            supabase,
            userId: uid,
            subscriptionSerno: selectedSerno,
            columns: "ts, gn, cn",
            startIso: yearStartIso,
            endIso: yearEndIso,
            endInclusive: true,
          }),
        ]);

        if (cancel) return;

        if (hourlyRes.error) {
          setError("Veriş verileri yüklenemedi.");
          setLoading(false);
          return;
        }

        const hourlyData = hourlyRes.data ?? [];
        if (hourlyData.length === 0) {
          setError("Seçilen tesiste geçen ay veriş kaydı bulunamadı.");
          setLoading(false);
          return;
        }

        // Saat bazında: toplam çekiş + veriş (sağ kart için satisKwh bölüşümünde kullanılır)
        let toplamVerisKwh = 0;
        let toplamCekisKwh = 0;
        for (const hour of hourlyData) {
          toplamCekisKwh += Number((hour as any).cn) || 0;
          toplamVerisKwh += Number(hour.gn) || 0;
        }

        // Sağ kart için satış kWh: net fazla üretim (veriş - çekiş, negatife düşmez).
        // Mahsup miktarı (sol kart) snapshot'tan ayrı çekiliyor; bu hesabı etkilemez.
        const satisKwh = Math.max(0, toplamVerisKwh - toplamCekisKwh);

        // Sol kart: fatura ile birebir tutmak için snapshot'tan oku
        let hasSnapshot = false;
        let mahsupKwh = 0;
        let unitPriceEnergy = 0;
        let mahsupTutari = 0;
        if (snapshotData) {
          hasSnapshot = true;
          const snapVeris = Number(snapshotData.veris_kwh) || 0;
          const snapCekis = Number(snapshotData.total_consumption_kwh) || 0;
          mahsupKwh = Math.min(snapCekis, snapVeris);
          unitPriceEnergy = Number(snapshotData.unit_price_energy) || 0;
          mahsupTutari = mahsupKwh * unitPriceEnergy;
        }

        // Sağ kart: satış hesabı.
        //
        // BRÜT GELIR (on_yil farketmez):
        //   satisBrutGelir = satisKwh × distribution_tariff_official.perakende_enerji_bedeli
        //   (tesisin terim/gerilim/tarife eşleşmesinden çekilir)
        //
        // DAĞITIM KESİNTİSİ (on_yil'e göre sabit oran):
        //   on_yil = true  → 1,575810 TL/kWh (10 yıl üstü tesisler)
        //   on_yil = false → 0,496738 TL/kWh (10 yıl altı tesisler)
        //
        // NOT: Saat-bazlı PTF mantığı tamamen kaldırıldı. Tariff tablosundaki
        // dagitim_bedeli artık bu kartta kullanılmıyor.
        const onYil = (settingsRes.data as any)?.on_yil ?? false;
        let dagitimBedeli = 0;
        let perakendeRate = 0;
        if (settingsRes.data) {
          dagitimBedeli = onYil
            ? DAGITIM_BEDELI_ON_YIL_USTU
            : DAGITIM_BEDELI_ON_YIL_ALTI;

          const { data: tariff } = await supabase
            .from("distribution_tariff_official")
            .select("perakende_enerji_bedeli")
            .eq("terim", settingsRes.data.terim)
            .eq("gerilim", settingsRes.data.gerilim)
            .eq("tarife", settingsRes.data.tarife)
            .maybeSingle();
          if (cancel) return;
          perakendeRate = Number(tariff?.perakende_enerji_bedeli) || 0;
        }

        // Brüt gelir: tek formül, on_yil farketmez.
        const satisBrutGelir = satisKwh > 0 ? satisKwh * perakendeRate : 0;

        // Dağıtım kesintisi: on_yil'e göre seçilmiş sabit oran × satış kWh.
        const satisDagitimKesintisi = satisKwh * dagitimBedeli;
        const satisNetGelir = satisBrutGelir - satisDagitimKesintisi;

        // ── Yıllık Satış Hakkı (subscription_settings.satis_hakki) ──────────
        // Cari takvim yılındaki kümülatif satış kWh'ı: her ay için
        // max(0, ayVeris - ayCekis), aylar boyu toplanır.
        const yearlyHourlyData = yearlyHourlyRes.data ?? [];
        const monthlyTotals = new Map<string, { veris: number; cekis: number }>();
        for (const hour of yearlyHourlyData) {
          const tsStr = String((hour as any).ts ?? "");
          const monthKey = tsStr.slice(0, 7); // "YYYY-MM"
          if (!monthKey) continue;
          const cur = monthlyTotals.get(monthKey) ?? { veris: 0, cekis: 0 };
          cur.veris += Number((hour as any).gn) || 0;
          cur.cekis += Number((hour as any).cn) || 0;
          monthlyTotals.set(monthKey, cur);
        }

        let yillikKullanilanKwh = 0;
        for (const { veris, cekis } of monthlyTotals.values()) {
          yillikKullanilanKwh += Math.max(0, veris - cekis);
        }

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
          toplamVerisKwh,
          toplamCekisKwh,
          mahsupKwh,
          satisKwh,
          hasSnapshot,
          unitPriceEnergy,
          mahsupTutari,
          satisBrutGelir,
          satisDagitimKesintisi,
          satisNetGelir,
          dagitimBedeli,
          onYil,
          yillikMaxSatisKwh,
          yillikKullanilanKwh,
          yillikKalanKwh,
          yillikKullanimYuzde,
        });
      } catch {
        if (!cancel) setError("Hesaplama sırasında bir hata oluştu.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [uid, selectedSerno]);

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

      {/* Hata (veriş yoksa) */}
      {!loading && error && selectedSerno != null && (
        <p className="text-sm text-neutral-500 text-center py-8">
          {error}
        </p>
      )}

      {/* Sonuçlar — iki kart */}
      {!loading && result && (
        <div>
          <p className="text-xs text-neutral-500 mb-3">{result.donem}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* SOL: Mahsup Edilen Enerji Bedeli */}
            <section className="rounded-xl border border-emerald-200/60 bg-emerald-50/30 p-5">
              <h3 className="text-sm font-semibold text-neutral-900">
                Mahsup Edilen Enerji Bedeli
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5 mb-4">
                Geçen ay faturanıza yansıyan mahsup tutarı
              </p>

              {!result.hasSnapshot ? (
                <p className="text-sm text-neutral-500 py-6 text-center">
                  Fatura dönemi henüz kapanmamış.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Mahsup Edilen Veriş</span>
                      <span className="text-sm font-medium text-emerald-700">
                        {fmtKwh(result.mahsupKwh)} kWh
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Birim Fiyat</span>
                      <span className="text-sm font-medium text-neutral-700">
                        {fmtUnit(result.unitPriceEnergy)} TL/kWh
                      </span>
                    </div>

                    <div className="border-t border-emerald-200/70 my-2" />

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-neutral-800">Mahsup Tutarı</span>
                      <span className="text-lg font-bold text-emerald-700">
                        {fmtTL(result.mahsupTutari)} TL
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

              {result.satisKwh <= 0 ? (
                <p className="text-sm text-neutral-500 py-6 text-center">
                  Geçen ay veriş tamamen mahsup edildi, devlete satılan fazla enerji yok.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Satılan Veriş</span>
                      <span className="text-sm font-medium text-amber-700">
                        {fmtKwh(result.satisKwh)} kWh
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Brüt Gelir</span>
                      <span className="text-sm font-medium text-emerald-600">
                        {fmtTL(result.satisBrutGelir)} TL
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Dağıtım Kesintisi</span>
                      <span className="text-sm font-medium text-red-500">
                        -{fmtTL(result.satisDagitimKesintisi)} TL
                      </span>
                    </div>

                    <div className="border-t border-amber-200/70 my-2" />

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-neutral-800">Net Gelir</span>
                      <span
                        className={`text-lg font-bold ${
                          result.satisNetGelir >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {fmtTL(result.satisNetGelir)} TL
                      </span>
                    </div>
                  </div>

                  {result.dagitimBedeli > 0 && (
                    <p className="mt-4 text-xs text-neutral-400">
                      Dağıtım Bedeli: {fmtUnit(result.dagitimBedeli)} TL/kWh
                      ({result.onYil
                        ? "10 yıl üstü tesis için sabit oran"
                        : "10 yıl altı tesis için sabit oran"})
                    </p>
                  )}
                </>
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
