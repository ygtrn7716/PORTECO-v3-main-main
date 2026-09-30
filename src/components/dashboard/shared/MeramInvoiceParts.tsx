// src/components/dashboard/shared/MeramInvoiceParts.tsx
//
// Metot 7 (Meram / MEPAŞ) fatura tablosuna özgü parçalar. Dört yüzey aynı
// kalemleri gösterir: InvoiceDetail, AlternateTariffInvoiceSection,
// InvoiceSnapshotDetail, ConsumptionDetail. Hepsi `breakdown.meram` varsa render
// edilir (diğer metodlarda anahtar yok → hiçbir şey çizilmez).

import type { MeramBreakdown } from "@/components/utils/calculateInvoiceNetMethods";

const fmtMoney2 = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKwh = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const fmtUnit = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

/** BTV satırı açıklaması (ETV = %1 × (Enerji + Satır 2), GDDK dahil). */
export const MERAM_BTV_TEXT = "(Enerji + YEKDEM Mahsup/GDDK/Mahsuplaşma Farkı) × BTV oranı";

/** Enerji satırına eklenen "tahmini YEKDEM" etiketi (Y = yekdem_value ise). */
export function MeramYekdemBadge({ meram }: { meram: MeramBreakdown }) {
  if (meram.yekdemIsFinal) return null;
  return <span className="text-amber-600"> (tahmini YEKDEM)</span>;
}

/** Dağıtım satırı açıklamasının sonuna: kendi verişin dağıtım etkisi. */
export function MeramDagitimNote({ meram }: { meram: MeramBreakdown }) {
  if (meram.dagitimYarim) {
    return <span className="text-neutral-400"> (kendi veriş &gt; tüketim → ½)</span>;
  }
  if (meram.ownGnKwh > 0) {
    return <span className="text-neutral-400"> (kendi veriş/2 düşülmüş)</span>;
  }
  return null;
}

/** "YEKDEM Mahsup + GDDK + Mahsuplaşma Farkı" tek satırı (Meram faturasındaki 4. kalem). */
export function MeramSatir2Row({ meram }: { meram: MeramBreakdown }) {
  const neg = meram.satir2 < 0;
  return (
    <tr className="border-b border-neutral-100">
      <td className={"py-2 pr-4 " + (neg ? "text-emerald-700" : "")}>
        YEKDEM Mahsup + GDDK + Mahsuplaşma Farkı
      </td>
      <td className="py-2 pr-4 text-neutral-600">
        Mahsuplaşma farkı {meram.mahsuplasmaFarki < 0 ? "−" : ""}
        {fmtMoney2(Math.abs(meram.mahsuplasmaFarki))} ({fmtKwh(meram.mahsupKwh)} kWh ×{" "}
        {fmtUnit(meram.mahsuplasmaBirimFiyat)} TL/kWh) + YEKDEM GDDK{" "}
        {meram.gddk < 0 ? "−" : ""}
        {fmtMoney2(Math.abs(meram.gddk))}
      </td>
      <td className={"py-2 pr-4 text-right " + (neg ? "text-emerald-700" : "")}>
        {neg ? "−" : ""}
        {fmtMoney2(Math.abs(meram.satir2))}
      </td>
    </tr>
  );
}

/** Tablo altı notlar — Meram faturasının "Toplam Tüketim / mahsup / trafo" notlarının karşılığı. */
export function MeramInvoiceNotes({
  meram,
  netKwh,
}: {
  meram: MeramBreakdown;
  /** N — faturalanan (mahsup sonrası) tüketim */
  netKwh: number;
}) {
  const saat =
    meram.trafoKaybiSaatlik > 0 ? Math.round(meram.trafoKaybiKwh / meram.trafoKaybiSaatlik) : 0;
  return (
    <div className="mt-3 space-y-1 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
      <p className="font-medium text-neutral-700">Meram (MEPAŞ) fatura notları</p>
      <p>Toplam tüketim (faturalanan, mahsup sonrası): {fmtKwh(netKwh)} kWh</p>
      <p>
        Mahsup: {fmtKwh(meram.mahsupKwh)} kWh · Brüt tüketim (dağıtım tabanı
        {meram.trafoKaybiKwh > 0 ? ", trafo kaybı dahil" : ""}): {fmtKwh(meram.consKwh)} kWh
      </p>
      {meram.trafoKaybiKwh > 0 && (
        <p>
          Trafo kaybı: {meram.trafoKaybiSaatlik.toLocaleString("tr-TR")} kWh/saat × {saat} saat ={" "}
          {fmtKwh(meram.trafoKaybiKwh)} kWh
        </p>
      )}
      <p>
        Kendi veriş: {fmtKwh(meram.ownGnKwh)} kWh
        {meram.dagitimYarim
          ? " — tüketimi aşıyor, dağıtım bedeli D × tüketim / 2"
          : meram.ownGnKwh > 0
            ? " — dağıtım bedeli D × tüketim − D × veriş / 2"
            : ""}
      </p>
      <p>
        YEKDEM: {fmtUnit(meram.yekdem)} TL/kWh (
        {meram.yekdemIsFinal ? "kesinleşen" : "tahmini — kesinleşince güncellenir"})
      </p>
    </div>
  );
}
