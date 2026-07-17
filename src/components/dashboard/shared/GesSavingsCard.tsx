// src/components/dashboard/shared/GesSavingsCard.tsx
//
// "GES Olmasaydı Faturanız" modülünün 4 kartlı görünümü:
//  1. Mevcut Faturanız        — fatura sayfasındaki Ödenecek Toplam ile birebir
//  2. O Ay Satılan Enerji     — Net Gelir (satış varsa; result.satis null → render yok)
//  3. GES Olmasaydı Faturanız — karşı-olgusal fatura
//  4. GES Tasarrufu           — Kart 3 − Kart 1 + Kart 2
// DETAY tablosu mode'a göre değişir (producer: ham tüketim satırları,
// receiver: tahsis edilen mahsup satırı).

import { Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GesOlmasaydiResult } from "@/components/utils/calculateGesOlmasaydi";

const fmtMoney = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtKwh = (n: number) =>
  n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const fmtUnit = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

type Props =
  | { variant: "panel" | "inline"; result: GesOlmasaydiResult }
  | { variant: "placeholder" };

export default function GesSavingsCard(props: Props) {
  if (props.variant === "placeholder") {
    return <PlaceholderVariant />;
  }

  const { result, variant } = props;
  const isInline = variant === "inline";
  const isPanel = variant === "panel";
  const hasSatis = result.satis != null;
  const isReceiver = result.mode === "receiver";
  // Arazi GES: üretim anlık tüketimi beslemiyor → ham tüketim = çekiş,
  // karşı-olgusal = mahsupsuz fatura. DETAY ve açıklama metni farklı.
  const noInstantUse = !isReceiver && result.anlikUretimKullanimi === false;

  // Panel (dar drawer) → kartlar her zaman alt alta, tam genişlik.
  // Inline (geniş sayfa) → mobilde alt alta, sm+ ekranda yan yana.
  const topGridClass = isPanel
    ? "grid-cols-1"
    : hasSatis
      ? "grid-cols-1 sm:grid-cols-3"
      : "grid-cols-1 sm:grid-cols-2";

  return (
    <div className="space-y-5">
      {isInline && (
        <div className="flex items-center gap-2 mb-2">
          <Sun className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-semibold text-neutral-800">
            GES Olmasaydı Faturanız
          </h2>
        </div>
      )}

      {/* Kart 1-2-3 */}
      <div className={`grid gap-3 ${topGridClass}`}>
        <div className="min-w-0 box-border flex flex-col rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <div className="text-xs text-emerald-600 mb-1">Mevcut Faturanız</div>
          <div className="text-lg font-bold text-emerald-800 leading-tight break-words">
            &#8378;{fmtMoney(result.mevcutFatura)}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-auto pt-1">
            {fmtKwh(result.mevcutTuketimKwh)} kWh tüketim
            {" • "}
            {fmtKwh(result.verisMahsupKwh)} kWh mahsup
          </div>
        </div>

        {result.satis && (
          <div className="min-w-0 box-border flex flex-col rounded-xl bg-sky-50 border border-sky-200 p-4">
            <div className="text-xs text-sky-600 mb-1">Mevcut Satılan Enerji Bedeli</div>
            <div className="text-lg font-bold text-sky-800 leading-tight break-words">
              &#8378;{fmtMoney(result.satis.satisNetGelir)}
            </div>
            <div className="text-[11px] text-sky-600/80 mt-auto pt-1">
              {fmtKwh(result.satis.satisKwh)} kWh satış (net gelir)
            </div>
          </div>
        )}

        <div className="min-w-0 box-border flex flex-col rounded-xl bg-neutral-50 border border-neutral-200 p-4">
          <div className="text-xs text-neutral-500 mb-1">GES Olmasaydı Faturanız</div>
          <div className="text-lg font-bold text-neutral-800 leading-tight break-words">
            &#8378;{fmtMoney(result.gesOlmasaydiFatura)}
          </div>
          <div className="text-[11px] text-neutral-400 mt-auto pt-1">
            {isReceiver
              ? "Mahsup tahsisi uygulanmadan"
              : noInstantUse
                ? "Veriş mahsubu uygulanmadan"
                : `${fmtKwh(result.hamTuketimKwh)} kWh ham tüketim`}
          </div>
        </div>
      </div>

      {/* Kart 4: Tasarruf */}
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
        <div className="text-xs text-amber-600 mb-1">GES Tasarrufu</div>
        <div className="text-2xl font-bold text-amber-700">
          &#8378;{fmtMoney(result.tasarruf)}
        </div>
        <div className="text-sm text-amber-600 mt-1">
          %{result.tasarrufYuzde.toFixed(1)} tasarruf
        </div>
      </div>

      {/* Detaylar */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
          Detay
        </h3>
        <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100">
          {isReceiver ? (
            <>
              <Row label="Mevcut Tüketim (Çekiş)" value={`${fmtKwh(result.mevcutTuketimKwh)} kWh`} />
              <Row
                label="Tahsis Edilen Mahsup"
                value={`${fmtKwh(result.allocatedKwh ?? result.verisMahsupKwh)} kWh`}
                highlight
              />
              <Row label="Birim Fiyat" value={`${fmtUnit(result.mevcutBirimFiyat)} TL/kWh`} />
            </>
          ) : noInstantUse ? (
            <>
              <Row label="Mevcut Tüketim (Çekiş)" value={`${fmtKwh(result.mevcutTuketimKwh)} kWh`} />
              <Row label="GES Üretim (Şebekeye Verilen)" value={`${fmtKwh(result.gesUretimKwh)} kWh`} />
              <Row label="Ham Tüketim (= Çekiş)" value={`${fmtKwh(result.hamTuketimKwh)} kWh`} highlight />
              <Row label="Birim Fiyat" value={`${fmtUnit(result.mevcutBirimFiyat)} TL/kWh`} />
            </>
          ) : (
            <>
              <Row label="Mevcut Tüketim (Çekiş)" value={`${fmtKwh(result.mevcutTuketimKwh)} kWh`} />
              <Row label="GES Üretim" value={`${fmtKwh(result.gesUretimKwh)} kWh`} />
              <Row label="Ham Tüketim (GES'siz)" value={`${fmtKwh(result.hamTuketimKwh)} kWh`} highlight />
              <Row label="Birim Fiyat (GES'li)" value={`${fmtUnit(result.mevcutBirimFiyat)} TL/kWh`} />
              <Row label="Birim Fiyat (GES'siz)" value={`${fmtUnit(result.hamBirimFiyat)} TL/kWh`} />
            </>
          )}
        </div>
      </div>

      {/* Açıklama */}
      {isReceiver ? (
        <p className="text-xs text-neutral-400 leading-relaxed">
          Mevcut Faturanız, fatura sayfasındaki ödenecek toplam ile birebir aynıdır.
          Bu tesise Talep Birleştirme kapsamında başka tesisin GES üretiminden mahsup
          tahsis edilmektedir. GES Olmasaydı Faturanız, bu mahsup tahsisi hiç
          uygulanmasaydı oluşacak faturayı gösterir. Tasarruf = GES Olmasaydı
          Faturanız − Mevcut Faturanız{hasSatis ? " + Satılan Enerji Net Geliri" : ""}.
        </p>
      ) : noInstantUse ? (
        <p className="text-xs text-neutral-400 leading-relaxed">
          Mevcut Faturanız, fatura sayfasındaki ödenecek toplam ile birebir aynıdır.
          Bu tesiste GES üretimi anlık tüketimi beslemez (tamamı şebekeye verilir);
          bu nedenle ham tüketim = çekiş kabul edilir. GES Olmasaydı Faturanız,
          veriş mahsubu ve dağıtımdaki mahsup avantajı uygulanmadan hesaplanan
          faturayı gösterir. Tasarruf = GES Olmasaydı Faturanız − Mevcut
          Faturanız{hasSatis ? " + Satılan Enerji Net Geliri" : ""}.
        </p>
      ) : (
        <p className="text-xs text-neutral-400 leading-relaxed">
          Mevcut Faturanız, fatura sayfasındaki ödenecek toplam ile birebir aynıdır.
          GES Olmasaydı Faturanız, ham tüketim (= çekiş + GES üretim − veriş, saat
          bazında) üzerinden GES'siz birim fiyatla hesaplanır. Tasarruf = GES
          Olmasaydı Faturanız − Mevcut Faturanız{hasSatis ? " + Satılan Enerji Net Geliri" : ""}.
        </p>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 ${highlight ? "bg-amber-50" : ""}`}>
      <span className="text-sm text-neutral-600">{label}</span>
      <span className={`text-sm font-medium ${highlight ? "text-amber-700" : "text-neutral-800"}`}>
        {value}
      </span>
    </div>
  );
}

function PlaceholderVariant() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none blur-[3px] opacity-60 space-y-5"
      >
        <div className="flex items-center gap-2 mb-2">
          <Sun className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-semibold text-neutral-800">
            GES Olmasaydı Faturanız
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            <div className="text-xs text-emerald-600 mb-1">Mevcut Faturanız</div>
            <div className="text-lg font-bold text-emerald-800">&#8378;1.240,00</div>
            <div className="text-[11px] text-emerald-600/80 mt-1">3.420 kWh tüketim • 1.180 kWh mahsup</div>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500 mb-1">GES Olmasaydı Faturanız</div>
            <div className="text-lg font-bold text-neutral-800">&#8378;2.180,00</div>
            <div className="text-[11px] text-neutral-400 mt-1">4.600 kWh ham tüketim</div>
          </div>
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
          <div className="text-xs text-amber-600 mb-1">GES Tasarrufu</div>
          <div className="text-2xl font-bold text-amber-700">&#8378;940,00</div>
          <div className="text-sm text-amber-600 mt-1">%43,1 tasarruf</div>
        </div>
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="mx-4 max-w-sm rounded-2xl border border-amber-200/70 bg-white/95 p-5 shadow-xl text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
            <Sun className="h-5 w-5 text-amber-500" />
          </div>
          <h3 className="text-sm font-semibold text-neutral-900">
            GES tasarruf karşılaştırması
          </h3>
          <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
            GES paneliniz olmasaydı faturanızın ne kadar olacağını görmek için
            solar inverter hesabınızı PortEco'ya bağlayın.
          </p>
          <Button
            as="a"
            href="mailto:info@ecoenerji.net.tr?subject=GES%20Panel%20Ba%C4%9Flant%C4%B1%20Talebi"
            size="sm"
            className="mt-4"
          >
            İletişime Geç
          </Button>
        </div>
      </div>
    </div>
  );
}
