// src/components/dashboard/invoiceDetail/MuhasebeModal.tsx
//
// "Muhasebe Excel" önizleme modalı. buildMuhasebeReport çıktısını (MuhasebeReport)
// blok blok gösterir; "Excel İndir" ile aynı raporu .xlsx'e aktarır.
// ExcelJS yazıcı yalnız indirme tıklamasında dynamic import edilir (modal açılışı hafif).

import { useState } from "react";
import { X, FileSpreadsheet, Loader2, AlertTriangle } from "lucide-react";
import type {
  MuhasebeReport,
  MuhasebeBlock,
  MuhasebeRow,
} from "@/components/dashboard/reports/muhasebeReport";
import type { PenguenTahakkukView } from "@/components/dashboard/reports/penguenTahakkukView";

const fmtMoney = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUnit = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const fmtQty = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Blok başlığı renk kodları (spec): GİRDİ gri, MAHSUP #E6F8FD, ÇIKTI yeşil,
// SONUÇ vurgulu (mavi), MUTABAKAT sarımsı.
const BLOCK_STYLE: Record<string, string> = {
  blok1: "bg-neutral-100 text-neutral-700",
  blok2: "bg-[#E6F8FD] text-sky-800",
  blok3: "bg-emerald-50 text-emerald-800",
  blok4: "bg-[#00AEEF] text-white",
  blok5: "bg-amber-50 text-amber-800",
};

interface Props {
  open: boolean;
  onClose: () => void;
  report: MuhasebeReport | null;
  /** Penguen Tahakkuk varyantı — non-null ise Excel'e özel sheet'ler eklenir + rozet. */
  tahakkukView?: PenguenTahakkukView | null;
}

export default function MuhasebeModal({ open, onClose, report, tahakkukView = null }: Props) {
  const [downloading, setDownloading] = useState(false);

  if (!open || !report) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { exportMuhasebeXlsx } = await import(
        "@/components/dashboard/reports/exportMuhasebeXlsx"
      );
      await exportMuhasebeXlsx(report, tahakkukView);
    } catch (e) {
      console.error("Muhasebe Excel indirme hatası:", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
        {/* Başlık */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-neutral-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-neutral-800">{report.meta.baslik}</h2>
              {tahakkukView && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  Tahakkuk formatı
                </span>
              )}
            </div>
            <p className="truncate text-xs text-neutral-500">
              {report.meta.tesis} · {report.meta.donem} · Serno {report.meta.serno}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 rounded-lg bg-[#00AEEF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#40CFFF] disabled:opacity-50"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {downloading ? "Hazırlanıyor…" : "Excel İndir"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Kapanış / uyarı bandı */}
          {!report.closingCheck.ok && (
            <Banner tone="warn">
              Kapanış farkı: {fmtMoney(report.closingCheck.fark)} TL — hesaplanan toplam ({fmtMoney(report.closingCheck.hesaplanan)})
              fatura genel toplamıyla ({fmtMoney(report.closingCheck.faturaToplami)}) eşleşmiyor.
            </Banner>
          )}
          {report.warnings.map((w, i) => (
            <Banner tone="warn" key={i}>
              {w}
            </Banner>
          ))}

          {/* Bloklar */}
          {report.blocks.map((block) => (
            <BlockView key={block.id} block={block} />
          ))}

          {/* BLOK 6 — Parametreler */}
          <div>
            <div className="mb-2 rounded-t-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-white">
              6 · PARAMETRELER
            </div>
            <div className="overflow-x-auto rounded-b-lg border border-neutral-200">
              <table className="w-full min-w-[520px] text-sm">
                <tbody>
                  {report.params.map((prm, i) => (
                    <tr key={i} className={i % 2 === 1 ? "bg-neutral-50" : ""}>
                      <td className="px-4 py-1.5 text-neutral-600">{prm.kalem}</td>
                      <td className="px-4 py-1.5 text-right font-medium text-neutral-800">
                        {typeof prm.deger === "number" ? fmtUnit(prm.deger) : prm.deger}
                      </td>
                      <td className="px-4 py-1.5 text-neutral-500">{prm.birim || "—"}</td>
                      <td className="px-4 py-1.5 text-xs text-neutral-400">{prm.not}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : "border-sky-200 bg-sky-50 text-sky-800";
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed ${cls}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function BlockView({ block }: { block: MuhasebeBlock }) {
  return (
    <div>
      <div className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${BLOCK_STYLE[block.id] ?? "bg-neutral-100 text-neutral-700"}`}>
        {block.baslik}
      </div>
      {block.aciklama && (
        <p className="border-x border-neutral-200 bg-neutral-50 px-4 py-2 text-xs leading-relaxed text-neutral-500">
          {block.aciklama}
        </p>
      )}
      <div className="overflow-x-auto rounded-b-lg border border-neutral-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2 text-left font-medium">Sınıf</th>
              <th className="px-3 py-2 text-left font-medium">Kalem</th>
              <th className="px-3 py-2 text-left font-medium">Açıklama</th>
              <th className="px-3 py-2 text-right font-medium">Miktar</th>
              <th className="px-3 py-2 text-right font-medium">Birim Fiyat</th>
              <th className="px-3 py-2 text-right font-medium">Tutar (TL)</th>
              <th className="px-3 py-2 text-left font-medium">Not</th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <RowView key={i} row={row} zebra={row.kind === "item" && i % 2 === 1} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowView({ row, zebra }: { row: MuhasebeRow; zebra: boolean }) {
  const isSum = row.kind === "subtotal" || row.kind === "total";
  const isTotal = row.kind === "total";
  const neg = row.tutar != null && row.tutar < 0;

  const trCls = [
    isTotal ? "bg-neutral-50 border-t-2 border-neutral-300" : "",
    row.kind === "subtotal" ? "border-t border-neutral-200" : "",
    zebra ? "bg-neutral-50/60" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const strong = isSum ? "font-semibold" : "";

  return (
    <tr className={trCls}>
      <td className="px-3 py-1.5 text-xs text-neutral-500">{row.kind === "item" ? row.sinif : ""}</td>
      <td className={`px-3 py-1.5 text-neutral-800 ${strong}`}>{row.kalem}</td>
      <td className="px-3 py-1.5 text-xs text-neutral-500">{row.aciklama}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-700">
        {row.miktar == null ? "—" : `${fmtQty(row.miktar)}${row.miktarBirim ? ` ${row.miktarBirim}` : ""}`}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-700">
        {row.birimFiyat == null ? "—" : fmtUnit(row.birimFiyat)}
      </td>
      <td className={`px-3 py-1.5 text-right tabular-nums ${strong} ${neg ? "text-red-600" : "text-neutral-800"}`}>
        {row.tutar == null ? "—" : `${fmtMoney(row.tutar)} ₺`}
      </td>
      <td className="px-3 py-1.5 text-[11px] leading-snug text-neutral-400">{row.not}</td>
    </tr>
  );
}
