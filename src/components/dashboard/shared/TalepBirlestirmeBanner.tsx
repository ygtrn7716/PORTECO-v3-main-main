// src/components/dashboard/shared/TalepBirlestirmeBanner.tsx
//
// Talep Birleştirme bilgi notu — üç durum. Metod 4'te gösterilmez (düz fatura;
// mahsup/tahsis kavramı yok). Metinler fatura sayfasından (InvoiceDetail)
// taşındı; GES sayfası (EnergySoldCard) aynı bileşeni kullanır → iki yüzeyde
// aynı hikâye, kalıcı metin paritesi.

import type { InvoiceMethodId } from "@/lib/invoiceMethods";

export type GesAllocSummary =
  | { role: "assigned"; priority: number; allocatedKwh: number; isSource: boolean }
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

  if (alloc.role === "assigned" && alloc.isSource) {
    return (
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
        Talep Birleştirme: bu tesis üretim kaynağıdır. Üretim önce kendi tüketiminden
        mahsup edildi; bu faturaya {fmtKwh(alloc.allocatedKwh)} kWh mahsup tahsis
        edildi (öncelik {alloc.priority}).
        {alloc.priority === 1 &&
          " Tüm tesislerden artan fazla üretimin satışı bu tesisin faturasında gösterilir."}
      </div>
    );
  }

  if (alloc.role === "assigned") {
    return (
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
        Talep Birleştirme: bu faturaya {fmtKwh(alloc.allocatedKwh)} kWh GES mahsubu
        tahsis edildi (öncelik {alloc.priority}).
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
