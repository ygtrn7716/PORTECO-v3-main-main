// src/components/dashboard/shared/MedasVerisFaturasiCard.tsx
//
// "MEDAŞ Veriş Faturası — Sistem Kullanım Bedeli (ayrı fatura)" kartı.
// Metot 1 "dağıtım kendi verişiyle" (subscription_settings.dagitim_kendi_veris) tesisinde
// kendi verişi kendi çekişini aşınca (G > C) dağıtım şirketi (MEDAŞ) üreticiye AYRI bir
// fatura keser: (G − C) kWh × dagitim_uretici_1 + KDV. Bu tutar perakende faturanın
// HİÇBİR toplamına girmez; GES satış kartında (satışın aktığı tesiste) kesinti olarak
// bir kez düşülür.

import type { DagitimKendiVerisBreakdown } from "@/components/utils/calculateInvoice";
import { roundHalfUp } from "@/components/utils/dagitimKendiVeris";

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtKwh = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtUnit6 = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

type Props = {
  kv: Pick<DagitimKendiVerisBreakdown, "cKwh" | "gKwh" | "medasKwh" | "medasBirim" | "medasBedeli">;
  /** KDV oranı (0,20). */
  vatRate: number;
};

export default function MedasVerisFaturasiCard({ kv, vatRate }: Props) {
  if (!(kv.medasKwh > 0)) return null;
  const kdv = roundHalfUp(kv.medasBedeli * vatRate, 2);
  const toplam = roundHalfUp(kv.medasBedeli + kdv, 2);

  return (
    <div className="mt-4 rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50/60 to-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">
            MEDAŞ Veriş Faturası — Sistem Kullanım Bedeli (ayrı fatura)
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Kendi verişiniz kendi çekişinizi aştığı için dağıtım şirketinin ayrıca kestiği fatura —
            perakende fatura toplamına dahil değildir.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
          Ayrı fatura
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-600">Sistem Kullanım Bedeli</span>
          <span className="text-sm font-medium text-neutral-700">
            {fmtKwh(kv.medasKwh)} kWh × {fmtUnit6(kv.medasBirim)} TL/kWh
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-600">Tutar (KDV hariç)</span>
          <span className="text-sm font-medium text-neutral-800">{fmtTL(kv.medasBedeli)} TL</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-600">KDV (%{(vatRate * 100).toFixed(0)})</span>
          <span className="text-sm font-medium text-neutral-800">{fmtTL(kdv)} TL</span>
        </div>
        <div className="my-2 border-t border-sky-200/70" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-800">Toplam (KDV dahil)</span>
          <span className="text-lg font-bold text-neutral-900">{fmtTL(toplam)} TL</span>
        </div>
      </div>

      <p className="mt-4 text-xs text-neutral-400">
        Veriş {fmtKwh(kv.gKwh)} kWh − çekiş (trafo dahil) {fmtKwh(kv.cKwh)} kWh ={" "}
        {fmtKwh(kv.medasKwh)} kWh. Perakende fatura toplamına dahil değildir; GES satış kartında
        kesinti olarak bir kez düşülür.
      </p>
    </div>
  );
}
