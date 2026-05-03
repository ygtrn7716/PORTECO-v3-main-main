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

  return (
    <div className={isInline ? "space-y-5" : "space-y-5"}>
      {isInline && (
        <div className="flex items-center gap-2 mb-2">
          <Sun className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-semibold text-neutral-800">
            GES Olmasaydı Faturanız
          </h2>
        </div>
      )}

      {/* Mevcut vs GES Olmasaydı */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <div className="text-xs text-emerald-600 mb-1">Mevcut Fatura (GES'li)</div>
          <div className="text-lg font-bold text-emerald-800">
            &#8378;{fmtMoney(result.mevcutFatura)}
          </div>
        </div>
        <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4">
          <div className="text-xs text-neutral-500 mb-1">GES Olmasaydı</div>
          <div className="text-lg font-bold text-neutral-800">
            &#8378;{fmtMoney(result.gesOlmasaydiFatura)}
          </div>
        </div>
      </div>

      {/* Tasarruf */}
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
          <Row label="Mevcut Tüketim (Çekiş)" value={`${fmtKwh(result.mevcutTuketimKwh)} kWh`} />
          <Row label="GES Üretim" value={`${fmtKwh(result.gesUretimKwh)} kWh`} />
          <Row label="Ham Tüketim (GES'siz)" value={`${fmtKwh(result.hamTuketimKwh)} kWh`} highlight />
          <Row label="Birim Fiyat (GES'li)" value={`${fmtUnit(result.mevcutBirimFiyat)} TL/kWh`} />
          <Row label="Birim Fiyat (GES'siz)" value={`${fmtUnit(result.hamBirimFiyat)} TL/kWh`} />
        </div>
      </div>

      {/* Açıklama */}
      <p className="text-xs text-neutral-400 leading-relaxed">
        Bu hesaplama, GES sisteminiz olmasa tesisinizin şebekeden ne kadar
        enerji çekeceğini ve faturanın ne olacağını gösterir.
        Ham tüketim = çekiş + GES üretim - veriş formülü ile
        saat bazında hesaplanır.
      </p>
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
            <div className="text-xs text-emerald-600 mb-1">Mevcut Fatura (GES'li)</div>
            <div className="text-lg font-bold text-emerald-800">&#8378;1.240,00</div>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500 mb-1">GES Olmasaydı</div>
            <div className="text-lg font-bold text-neutral-800">&#8378;2.180,00</div>
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
