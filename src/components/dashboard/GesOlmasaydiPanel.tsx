// src/components/dashboard/GesOlmasaydiPanel.tsx
//
// GES olmasaydı fatura karşılaştırma paneli — sağdan açılan drawer.

import { X, Sun, Loader2 } from "lucide-react";
import type { GesOlmasaydiResult } from "@/components/utils/calculateGesOlmasaydi";

const fmtMoney = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtKwh = (n: number) =>
  n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const fmtUnit = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

interface Props {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  result: GesOlmasaydiResult | null;
  error?: string | null;
}

export default function GesOlmasaydiPanel({ open, onClose, loading, result, error }: Props) {
  return (
    <>
      {/* Overlay — sadece panel açıkken */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[400px] max-w-[90vw] bg-white shadow-2xl z-50
          transform transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-neutral-800">
              GES Olmasayd&#305; Faturan&#305;z
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto h-[calc(100%-57px)]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <span className="text-sm">Hesaplan&#305;yor...</span>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && !result && (
            <div className="text-sm text-neutral-500 text-center py-8">
              GES &uuml;retim verisi bulunamad&#305;.
            </div>
          )}

          {!loading && result && (
            <div className="space-y-5">
              {/* Mevcut vs GES Olmasaydı */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                  <div className="text-xs text-emerald-600 mb-1">Mevcut Fatura (GES'li)</div>
                  <div className="text-lg font-bold text-emerald-800">
                    &#8378;{fmtMoney(result.mevcutFatura)}
                  </div>
                </div>
                <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4">
                  <div className="text-xs text-neutral-500 mb-1">GES Olmasayd&#305;</div>
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
                  <Row label="Mevcut T&uuml;ketim (&#199;eki&#351;)" value={`${fmtKwh(result.mevcutTuketimKwh)} kWh`} />
                  <Row label="GES &Uuml;retim" value={`${fmtKwh(result.gesUretimKwh)} kWh`} />
                  <Row label="Ham T&uuml;ketim (GES'siz)" value={`${fmtKwh(result.hamTuketimKwh)} kWh`} highlight />
                  <Row label="Birim Fiyat (GES'li)" value={`${fmtUnit(result.mevcutBirimFiyat)} TL/kWh`} />
                  <Row label="Birim Fiyat (GES'siz)" value={`${fmtUnit(result.hamBirimFiyat)} TL/kWh`} />
                </div>
              </div>

              {/* Açıklama */}
              <p className="text-xs text-neutral-400 leading-relaxed">
                Bu hesaplama, GES sisteminiz olmasa tesisinizin &#351;ebekeden ne kadar
                enerji &#231;ekece&#287;ini ve faturan&#305;n ne olaca&#287;&#305;n&#305; g&ouml;sterir.
                Ham t&uuml;ketim = &#231;eki&#351; + GES &uuml;retim - veri&#351; form&uuml;l&uuml; ile
                saat baz&#305;nda hesaplan&#305;r.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
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
