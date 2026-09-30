// src/components/dashboard/shared/TalepBirlestirmeBanner.tsx
//
// Talep Birleştirme bilgi notu — üç durum. Metod 4'te gösterilmez (düz fatura;
// mahsup/tahsis kavramı yok). Metinler fatura sayfasından (InvoiceDetail)
// taşındı; GES sayfası (EnergySoldCard) aynı bileşeni kullanır → iki yüzeyde
// aynı hikâye, kalıcı metin paritesi.

import type { InvoiceMethodId } from "@/lib/invoiceMethods";
import type { TahsisModu } from "@/components/utils/gesAllocationModes";
import { TAHSIS_MODU_LABEL } from "@/components/utils/gesAllocationModes";

export type GesAllocSummary =
  | {
      role: "assigned";
      priority: number;
      allocatedKwh: number;
      isSource: boolean;
      /** GES'in dağıtım modu (sirali | saatlik_oransal | toplam_oransal) */
      mode: TahsisModu;
      /** Tesisin KENDİ sayacının dönem verişi (ham Σgn). Havuz modunda bu
       *  miktar havuza katılmıştır. Yalnız bilgi metni. */
      ownGnTotal?: number;
    }
  | { role: "source" };

const fmtKwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

interface TalepBirlestirmeBannerProps {
  alloc: GesAllocSummary | null;
  invoiceMethodId: InvoiceMethodId;
}

export default function TalepBirlestirmeBanner({
  alloc,
  invoiceMethodId,
}: TalepBirlestirmeBannerProps) {
  if (invoiceMethodId === 4 || !alloc) return null;

  // HAVUZ modeli (oransal modlar): listedeki her tesisin verişi havuza gider,
  // tüketimi ham girer. `isSource` bu modda listedeki HERKES için true olduğundan
  // "üretim kaynağı" metni kullanılamaz — havuz metni gösterilir.
  if (alloc.role === "assigned" && alloc.mode !== "sirali") {
    const ownGn = alloc.ownGnTotal ?? 0;
    return (
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
        Talep Birleştirme ({TAHSIS_MODU_LABEL[alloc.mode]}):{" "}
        {ownGn > 0 && <>bu tesisin {fmtKwh(ownGn)} kWh verişi havuza katıldı; </>}
        bu faturaya {fmtKwh(alloc.allocatedKwh)} kWh mahsup tahsis edildi.
        {alloc.priority === 1 &&
          " Havuzdan artan fazla üretimin satışı bu tesisin faturasında gösterilir."}{" "}
        Bu modda sıra mahsubu etkilemez; öncelik yalnızca fazla üretim satışının
        yazıldığı tesisi belirler.
      </div>
    );
  }

  // TEK KAYNAK modeli (sirali) — kaynak sayaç listede
  if (alloc.role === "assigned" && alloc.isSource) {
    return (
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
        Talep Birleştirme ({TAHSIS_MODU_LABEL[alloc.mode]}): bu tesis üretim
        kaynağıdır. Üretim önce kendi tüketiminden mahsup edildi; bu faturaya{" "}
        {fmtKwh(alloc.allocatedKwh)} kWh mahsup tahsis edildi (öncelik{" "}
        {alloc.priority}).
        {alloc.priority === 1 &&
          " Tüm tesislerden artan fazla üretimin satışı bu tesisin faturasında gösterilir."}
      </div>
    );
  }

  // TEK KAYNAK modeli (sirali) — normal alıcı tesis
  if (alloc.role === "assigned") {
    return (
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
        Talep Birleştirme ({TAHSIS_MODU_LABEL[alloc.mode]}): bu faturaya{" "}
        {fmtKwh(alloc.allocatedKwh)} kWh GES mahsubu tahsis edildi (öncelik{" "}
        {alloc.priority}).
        {alloc.priority === 1 &&
          " Fazla üretim satışı bu tesisin faturasında gösterilir."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
      Bu sayacın üretimi Talep Birleştirme ile diğer tesislere mahsup edilmektedir;
      veriş bu faturada 0 kabul edilir.
    </div>
  );
}
