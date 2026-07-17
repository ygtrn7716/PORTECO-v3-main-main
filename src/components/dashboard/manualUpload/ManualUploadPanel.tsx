// src/components/dashboard/manualUpload/ManualUploadPanel.tsx
//
// data_source='manual' tesisler için Excel yükleme paneli (ConsumptionDetail
// sayfasının en üstünde). Tekil manuel tesis seçiliyken VE "Tümü" seçiliyken
// (en az bir manuel tesis varsa) görünür; API tesisi tekil seçiliyken görünmez.
// Sürükle-bırak + dosya seç, parse → 500'lük batch upsert → manual_data_logs
// kaydı. Sağ üstteki üç nokta menüsünden tarih aralıklı silme ve veri logları
// modallarına ulaşılır.
//
// Parse, satırları Abone No'ya göre kullanıcının manuel tesislerine route
// ettiği için "Tümü" modunda yükleme davranışı değişmez; yalnızca log kaydı
// tekil tesis yerine subscription_serno=NULL (çoklu tesis yüklemesi) yazılır.

import { useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MoreVertical,
  Trash2,
  History,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  parseManualConsumptionXlsx,
  type ManualParseResult,
} from "@/components/utils/parseManualConsumptionXlsx";
import DateRangeDeleteModal, {
  type ManualFacilityOption,
} from "./DateRangeDeleteModal";
import DataLogsModal from "./DataLogsModal";

const BATCH_SIZE = 500;
const BRAND = "#00AEEF";

const fmtInt = (n: number) => n.toLocaleString("tr-TR");

type UploadSummary = {
  uploaded: number;
  skippedTotal: number;
  reasons: { unknownSerno: number; invalidDate: number; emptyRow: number };
  unknownSernos: string[];
  perSerno: { serno: number; count: number }[];
  fileName: string;
};

type Props = {
  uid: string;
  /** Seçili tekil manuel tesisin sernosu; "Tümü" seçiliyken null */
  selectedSerno: number | null;
  /** Seçili tekil tesisin görünen etiketi; "Tümü" seçiliyken null */
  facilityLabel: string | null;
  /** Kullanıcının data_source='manual' TÜM tesislerinin sernoları (gizli
   *  dahil) — Excel'deki Abone No doğrulaması için */
  manualSernos: number[];
  /** Silme modalı seçicisi için görünür manuel tesisler (etiketli) */
  manualFacilities: ManualFacilityOption[];
  /** Yükleme/silme sonrası sayfadaki verileri tazelemek için */
  onDataChanged?: () => void;
};

export default function ManualUploadPanel({
  uid,
  selectedSerno,
  facilityLabel,
  manualSernos,
  manualFacilities,
  onDataChanged,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null); // 0-100
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  // "Tümü" modu: tekil tesis seçili değil, satırlar Abone No'ya göre dağıtılır
  const allMode = selectedSerno == null;

  /* ---------------- Dosya işleme ---------------- */

  async function processFile(file: File) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setSummary(null);
      setError(
        `Desteklenmeyen dosya tipi: ${file.name}. Sadece .xlsx ve .xls dosyaları kabul edilir.`,
      );
      return;
    }

    setBusy(true);
    setError(null);
    setSummary(null);
    setProgress(null);

    try {
      const validSernos = new Set(manualSernos);
      const parsed: ManualParseResult = await parseManualConsumptionXlsx(
        file,
        validSernos,
      );

      if (parsed.rows.length === 0) {
        const r = parsed.skipped;
        const parts: string[] = [];
        if (r.unknownSerno > 0)
          parts.push(`${fmtInt(r.unknownSerno)} satır tanınmayan abone no`);
        if (r.invalidDate > 0)
          parts.push(`${fmtInt(r.invalidDate)} satır geçersiz tarih`);
        if (r.emptyRow > 0) parts.push(`${fmtInt(r.emptyRow)} boş satır`);
        throw new Error(
          "Dosyada yüklenebilir satır bulunamadı." +
            (parts.length > 0 ? ` (${parts.join(", ")})` : "") +
            (parsed.unknownSernos.length > 0
              ? ` Dosyadaki abone no'lar: ${parsed.unknownSernos.slice(0, 5).join(", ")}${parsed.unknownSernos.length > 5 ? "…" : ""}. Bu tesisler manuel veri girişine tanımlı değil.`
              : ""),
        );
      }

      // 500'lük batch'lerle upsert — aynı (user_id, serno, ts) varsa üzerine yazar
      const payload = parsed.rows.map((r) => ({ user_id: uid, ...r }));
      const totalBatches = Math.ceil(payload.length / BATCH_SIZE);
      setProgress(0);

      for (let i = 0; i < totalBatches; i++) {
        const chunk = payload.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        const { error: upErr } = await supabase
          .from("consumption_hourly")
          .upsert(chunk, { onConflict: "user_id,subscription_serno,ts" });
        if (upErr) {
          throw new Error(
            `Yükleme hatası (${fmtInt(i * BATCH_SIZE)} satır yüklendikten sonra): ${upErr.message}`,
          );
        }
        setProgress(Math.round(((i + 1) / totalBatches) * 100));
      }

      // manual_data_logs:
      // - "Tümü" modunda TEK kayıt, subscription_serno=NULL (çoklu tesis
      //   yüklemesi), row_count=toplam, range=dosya geneli min/max.
      // - Tekil tesis modunda tesis başına bir kayıt; dosya geneli atlanan
      //   satır sayısı tek bir tesise bağlanamayacağı için panelin tesisinin
      //   kaydına, o yoksa ilk kayda yazılır.
      let logRows: Record<string, unknown>[];
      if (allMode) {
        logRows = [
          {
            user_id: uid,
            subscription_serno: null,
            operation: "upload" as const,
            row_count: parsed.rows.length,
            skipped_count: parsed.skippedTotal,
            range_start: parsed.rangeStart,
            range_end: parsed.rangeEnd,
            file_name: file.name,
          },
        ];
      } else {
        const skipOwnerIdx = Math.max(
          0,
          parsed.perSerno.findIndex((p) => p.serno === selectedSerno),
        );
        logRows = parsed.perSerno.map((p, idx) => ({
          user_id: uid,
          subscription_serno: p.serno,
          operation: "upload" as const,
          row_count: p.count,
          skipped_count: idx === skipOwnerIdx ? parsed.skippedTotal : 0,
          range_start: p.rangeStart,
          range_end: p.rangeEnd,
          file_name: file.name,
        }));
      }
      const { error: logErr } = await supabase
        .from("manual_data_logs")
        .insert(logRows);
      if (logErr) {
        // Veri yüklendi; log yazılamaması yüklemeyi geri almaz — sadece bildir
        console.error("[manual_data_logs] insert:", logErr.message);
      }

      setSummary({
        uploaded: parsed.rows.length,
        skippedTotal: parsed.skippedTotal,
        reasons: parsed.skipped,
        unknownSernos: parsed.unknownSernos,
        perSerno: parsed.perSerno.map((p) => ({ serno: p.serno, count: p.count })),
        fileName: file.name,
      });
      onDataChanged?.();
    } catch (err: any) {
      console.error("[manual upload]", err);
      setError(err?.message ?? "Yükleme sırasında bilinmeyen bir hata oluştu.");
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* ---------------- Drag & drop ---------------- */

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!busy && !isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    // Çocuk elemanlara (ikon, buton, yazı) geçişte dragleave tetiklenir;
    // gerçek çıkış değilse hover feedback'i söndürme (titreme önlenir).
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (busy) return;
    const f = e.dataTransfer?.files?.[0];
    if (f) await processFile(f);
  }

  /* ---------------- Render ---------------- */

  return (
    <div
      className="mb-6 rounded-lg border bg-white p-5 shadow-sm"
      style={{ borderColor: `${BRAND}55` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 shrink-0" style={{ color: BRAND }} />
            <h2 className="text-sm font-semibold text-neutral-900">
              Manuel Tüketim Verisi Yükleme
            </h2>
            <span
              className="rounded-lg px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: `${BRAND}1a`, color: BRAND }}
            >
              {allMode ? "Tüm Manuel Tesisler" : "Manuel Tesis"}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {allMode
              ? `Tesis seçimi "Tümü" — EDAŞ portalından indirdiğiniz saatlik tüketim Excel'ini (.xlsx/.xls) buraya yükleyin; satırlar Excel'deki Abone No'lara göre ${fmtInt(manualSernos.length)} manuel tesisinize otomatik dağıtılır. Aynı saat için mevcut kayıt varsa üzerine yazılır.`
              : `${facilityLabel} — EDAŞ portalından indirdiğiniz saatlik tüketim Excel'ini (.xlsx/.xls) buraya yükleyin. Aynı saat için mevcut kayıt varsa üzerine yazılır.`}
          </p>
        </div>

        {/* Üç nokta menüsü */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy}
            className="rounded-lg border border-neutral-200 bg-white p-2 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800 disabled:opacity-50"
            aria-label="İşlemler menüsü"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              {/* Dış tıklama yakalayıcı */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Tarih Aralıklı Veri Sil
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setLogsOpen(true);
                  }}
                  className="flex w-full items-center gap-2 border-t border-neutral-100 px-3 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  <History className="h-4 w-4" />
                  Veri Logları
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={
          "mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors " +
          (busy
            ? "border-neutral-200 bg-neutral-50 opacity-60"
            : isDragging
              ? "bg-[#00AEEF]/5"
              : "border-neutral-300 bg-neutral-50/50 hover:bg-neutral-50")
        }
        style={isDragging && !busy ? { borderColor: BRAND } : undefined}
      >
        {busy ? (
          <>
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: BRAND }} />
            <div className="text-sm font-medium text-neutral-700">
              {progress == null ? "Dosya işleniyor…" : "Veriler yükleniyor…"}
            </div>
            {progress != null && (
              <div className="w-full max-w-xs">
                <div className="h-2 w-full overflow-hidden rounded-lg bg-neutral-200">
                  <div
                    className="h-full rounded-lg transition-[width] duration-200"
                    style={{ width: `${progress}%`, backgroundColor: BRAND }}
                  />
                </div>
                <div className="mt-1 text-xs text-neutral-500">%{progress}</div>
              </div>
            )}
          </>
        ) : (
          <>
            <Upload className="h-7 w-7 text-neutral-400" />
            <div className="text-sm text-neutral-700">
              Excel dosyasını buraya sürükleyip bırakın
            </div>
            <div className="text-xs text-neutral-400">veya</div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              Dosya Seç
            </button>
            <div className="text-[11px] text-neutral-400">
              Kabul edilen formatlar: .xlsx, .xls
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await processFile(f);
          }}
        />
      </div>

      {/* Hata */}
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {/* Sonuç özeti */}
      {summary && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">
                {fmtInt(summary.uploaded)} satır yüklendi
                {summary.skippedTotal > 0 &&
                  `, ${fmtInt(summary.skippedTotal)} satır atlandı`}
                .
              </div>
              <div className="mt-0.5 text-xs text-emerald-700/80">
                Dosya: {summary.fileName}
              </div>

              {summary.perSerno.length > 1 && (
                <div className="mt-1 text-xs">
                  {summary.perSerno.map((p) => (
                    <div key={p.serno}>
                      Tesis {p.serno}: {fmtInt(p.count)} satır
                    </div>
                  ))}
                </div>
              )}

              {summary.skippedTotal > 0 && (
                <ul className="mt-1 list-inside list-disc text-xs text-emerald-700/90">
                  {summary.reasons.unknownSerno > 0 && (
                    <li>
                      Tanınmayan abone no: {fmtInt(summary.reasons.unknownSerno)}{" "}
                      satır
                      {summary.unknownSernos.length > 0 &&
                        ` (${summary.unknownSernos.slice(0, 5).join(", ")}${summary.unknownSernos.length > 5 ? "…" : ""})`}
                    </li>
                  )}
                  {summary.reasons.invalidDate > 0 && (
                    <li>Geçersiz tarih: {fmtInt(summary.reasons.invalidDate)} satır</li>
                  )}
                  {summary.reasons.emptyRow > 0 && (
                    <li>Boş satır: {fmtInt(summary.reasons.emptyRow)}</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modallar */}
      {deleteOpen && (
        <DateRangeDeleteModal
          uid={uid}
          defaultSerno={selectedSerno}
          facilities={manualFacilities}
          onClose={() => setDeleteOpen(false)}
          onDeleted={onDataChanged}
        />
      )}
      {logsOpen && <DataLogsModal uid={uid} onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
