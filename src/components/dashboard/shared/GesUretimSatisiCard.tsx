// src/components/dashboard/shared/GesUretimSatisiCard.tsx
//
// "GES Üretim Satışı" kartı — fatura görünümlerinde "Fatura Kalemleri" kartının
// hemen altında gösterilir. Müşterinin fazla üretiminden dolayı KENDİSİNİN
// kestiği faturayı (veriş satışı) ayrı gösterir; bu tutar faturanın
// toplamlarına GİRMEZ.
//
// Net gelir = brüt gelir − dağıtım kesintisi. Hesap GES sayfasındaki
// "Devlete Satılan Enerji Bedeli" ile birebir aynıdır (ortak yardımcı:
// src/lib/ges/gesUretimSatisi.ts).

import type { GesUretimSatisiResult } from "@/lib/ges/gesUretimSatisi";

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtKwh = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtUnit = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

interface GesUretimSatisiCardProps {
  result: GesUretimSatisiResult;
  /** Dağıtım kesintisi tarife açıklaması için (lisanslı / lisanssız üretici). */
  lisansliSatis?: boolean;
}

export default function GesUretimSatisiCard({
  result,
  lisansliSatis = false,
}: GesUretimSatisiCardProps) {
  if (!(result.satisKwh > 0)) return null;

  return (
    <div className="mt-4 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/60 to-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">GES Üretim Satışı</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Fazla üretiminiz için devlete kestiğiniz fatura — yukarıdaki faturaya dahil değildir.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          Ayrı tahsilat
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-600">Satılan Veriş</span>
          <span className="text-sm font-medium text-amber-700">
            {fmtKwh(result.satisKwh)} kWh
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-600">
            Birim Fiyat
            {result.satisModu === "usd" && (
              <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-amber-600">
                USD
              </span>
            )}
          </span>
          <span className="text-sm font-medium text-neutral-700">
            {fmtUnit(result.satisBrutBirim)} TL/kWh
          </span>
        </div>

        {result.satisModu === "usd" && (
          <p className="-mt-1 text-right text-[11px] text-neutral-500">
            0,1330 USD/kWh × {fmtUnit(result.satisUsdKur)} TL/USD
          </p>
        )}

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

        <div className="my-2 border-t border-amber-200/70" />

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
          Dağıtım Bedeli: {fmtUnit(result.dagitimBedeli)} TL/kWh (
          {lisansliSatis
            ? "Lisanslı satış üretici tarifesi"
            : "Lisanslı olmayan üretici tarifesi"}
          )
        </p>
      )}

      {result.satisModu === "usd" && (
        <p className="mt-1 text-xs text-neutral-400">
          Brüt gelir USD bazlı: 0,1330 USD/kWh × {fmtUnit(result.satisUsdKur)} TL/USD ={" "}
          {fmtUnit(result.satisBrutBirim)} TL/kWh
        </p>
      )}
    </div>
  );
}
