// src/components/dashboard/EnergySoldCard.tsx
import { useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { fetchAllConsumption, fetchAllPtf } from "@/lib/paginatedFetch";

type OsosSub = {
  subscription_serno: number;
  title: string | null;
};

type TariffSettings = {
  terim: string;
  gerilim: string;
  tarife: string;
};

type CalcResult = {
  toplamVerisKwh: number;
  brutGelir: number;
  dagitimBedeli: number;
  dagitimKesintisi: number;
  netGelir: number;
  donem: string; // "Ocak 2026"
};

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const fmtKwh = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function EnergySoldCard() {
  const { session, loading: sessionLoading } = useSession();
  const uid = session?.user?.id ?? null;

  const [subs, setSubs] = useState<OsosSub[]>([]);
  const [selectedSerno, setSelectedSerno] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1) OSOS tesislerini yükle
  useEffect(() => {
    if (sessionLoading || !uid) return;
    let cancel = false;

    (async () => {
      const { data, error: err } = await supabase
        .from("owner_subscriptions")
        .select("subscription_serno, title")
        .eq("user_id", uid);

      if (cancel) return;
      if (err) {
        setError(err.message);
        return;
      }
      setSubs(data ?? []);
    })();

    return () => { cancel = true; };
  }, [uid, sessionLoading]);

  // 2) Tesis seçildiğinde hesaplama yap
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
        // Geçen ayın tarih aralığı
        const prevMonth = dayjsTR().subtract(1, "month");
        const startIso = prevMonth.startOf("month").toISOString();
        const endIso = prevMonth.endOf("month").toISOString();
        const donem = `${MONTH_NAMES[prevMonth.month()]} ${prevMonth.year()}`;

        // Adım 1: Saatlik veriş (gn) verilerini çek
        const { data: hourlyData, error: hourlyErr } = await fetchAllConsumption({
          supabase,
          userId: uid,
          subscriptionSerno: selectedSerno,
          columns: "ts, gn, cn",
          startIso,
          endIso,
          endInclusive: true,
        });

        if (cancel) return;
        if (hourlyErr) {
          setError("Veriş verileri yüklenemedi.");
          setLoading(false);
          return;
        }

        if (!hourlyData || hourlyData.length === 0) {
          setError("Seçilen tesiste geçen ay veriş kaydı bulunamadı.");
          setLoading(false);
          return;
        }

        // Adım 2: Saatlik PTF değerlerini çek
        const { data: ptfData, error: ptfErr } = await fetchAllPtf({
          supabase,
          columns: "ts, ptf_tl_mwh",
          startIso,
          endIso,
          endInclusive: true,
        });

        if (cancel) return;
        if (ptfErr) {
          setError("PTF verileri yüklenemedi.");
          setLoading(false);
          return;
        }

        // PTF verilerini saat bazında map'e at (hızlı erişim için)
        const ptfMap = new Map<string, number>();
        for (const p of ptfData ?? []) {
          const key = dayjsTR(p.ts).format("YYYY-MM-DD HH");
          ptfMap.set(key, Number(p.ptf_tl_mwh) || 0);
        }

        // Adım 3: Saat bazında eşleştirme ve brüt gelir hesaplama
        let brutGelir = 0;
        let toplamVerisKwh = 0;
        let toplamCekisKwh = 0;

        for (const hour of hourlyData) {
          toplamCekisKwh += Number((hour as any).cn) || 0;
          const gn = Number(hour.gn) || 0;
          if (gn <= 0) continue;

          const key = dayjsTR(hour.ts).format("YYYY-MM-DD HH");
          const ptfMwh = ptfMap.get(key);
          if (ptfMwh == null) continue;

          const ptfTlKwh = ptfMwh / 1000;
          brutGelir += gn * ptfTlKwh;
          toplamVerisKwh += gn;
        }

        if (cancel) return;

        // Adım 4: Dağıtım bedeli kesintisi
        const { data: settings, error: settingsErr } = await supabase
          .from("subscription_settings")
          .select("terim, gerilim, tarife, on_yil")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSerno)
          .single();

        if (cancel) return;

        let dagitimBedeli = 0;
        let dagitimKesintisi = 0;

        if (!settingsErr && settings) {
          const { terim, gerilim, tarife } = settings as TariffSettings;

          const { data: tariff } = await supabase
            .from("distribution_tariff_official")
            .select("dagitim_bedeli, perakende_enerji_bedeli")
            .eq("terim", terim)
            .eq("gerilim", gerilim)
            .eq("tarife", tarife)
            .single();

          if (cancel) return;

          if (tariff) {
            dagitimBedeli = Number(tariff.dagitim_bedeli) || 0;
            dagitimKesintisi = toplamVerisKwh * (dagitimBedeli / 2);

            // on_yil=false ise iki katmanlı hesap:
            // çekişi geçmeyen kısım → PTF brüt gelir (zaten hesaplandı) yerine birim fiyat ile
            // çekişi geçen kısım → perakende enerji bedeli ile
            const settingsOnYil = (settings as any).on_yil ?? false;
            if (!settingsOnYil) {
              const perakendeRate = Number(tariff.perakende_enerji_bedeli) || 0;
              // PTF-bazlı brutGelir zaten hesaplandı; onu override ediyoruz
              // Burada birim fiyat bilgisi yok — ama brutGelir PTF ile hesaplandığı için
              // çekiş kısmı zaten PTF geliri olarak doğru.
              // Sadece fazla kısım perakende ile hesaplanacak.
              const mahsupKwh = Math.min(toplamVerisKwh, toplamCekisKwh);
              const fazlaKwh = Math.max(0, toplamVerisKwh - toplamCekisKwh);

              if (fazlaKwh > 0 && perakendeRate > 0) {
                // PTF gelirini yeniden hesapla: sadece mahsup kısmı PTF ile
                let ptfGelirMahsup = 0;
                let kalan = mahsupKwh;
                for (const hour of hourlyData) {
                  const gn = Number(hour.gn) || 0;
                  if (gn <= 0 || kalan <= 0) continue;
                  const kullan = Math.min(gn, kalan);
                  const key = dayjsTR(hour.ts).format("YYYY-MM-DD HH");
                  const ptfMwh = ptfMap.get(key);
                  if (ptfMwh != null) ptfGelirMahsup += kullan * (ptfMwh / 1000);
                  kalan -= kullan;
                }
                brutGelir = ptfGelirMahsup + (fazlaKwh * perakendeRate);
              }
              // fazlaKwh = 0 ise tümü PTF ile → mevcut brutGelir doğru
            }
          }
        }

        // Adım 5: Net gelir
        const netGelir = brutGelir - dagitimKesintisi;

        setResult({
          toplamVerisKwh,
          brutGelir,
          dagitimBedeli,
          dagitimKesintisi,
          netGelir,
          donem,
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
      <h2 className="text-sm font-semibold text-neutral-900 mb-4">
        Devlete Satılan Enerji Bedeli
      </h2>

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
              {s.title || `Tesis ${s.subscription_serno}`}
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

      {/* Sonuçlar */}
      {!loading && result && (
        <div>
          {/* Dönem */}
          <p className="text-xs text-neutral-500 mb-3">
            {result.donem}
          </p>

          {/* Satırlar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">Toplam Veriş</span>
              <span className="text-sm font-medium text-emerald-600">
                {fmtKwh(result.toplamVerisKwh)} kWh
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">Brüt Gelir</span>
              <span className="text-sm font-medium text-emerald-600">
                {fmtTL(result.brutGelir)} TL
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600">Dağıtım Kesintisi</span>
              <span className="text-sm font-medium text-red-500">
                -{fmtTL(result.dagitimKesintisi)} TL
              </span>
            </div>

            <div className="border-t border-neutral-200 my-2" />

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-800">Net Gelir</span>
              <span
                className={`text-lg font-bold ${
                  result.netGelir >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {fmtTL(result.netGelir)} TL
              </span>
            </div>
          </div>

          {/* Dağıtım bedeli bilgi notu */}
          {result.dagitimBedeli > 0 && (
            <p className="mt-4 text-xs text-neutral-400">
              Dağıtım Bedeli: {fmtTL(result.dagitimBedeli)} TL/kWh
              (Tarife dağıtım bedelinin yarısı uygulanır)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
