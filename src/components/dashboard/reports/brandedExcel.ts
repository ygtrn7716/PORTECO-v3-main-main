// src/components/dashboard/reports/brandedExcel.ts
//
// Raporlar bölümü için PortEco markalı, yeniden kullanılabilir ExcelJS şablonu.
// ExcelJS dynamic import ile yüklenir (ana bundle'a girmez); diğer eski
// export'lar SheetJS'te kalır (src/components/utils/xlsx.ts).
//
// Sheet yerleşimi (her sheet aynı):
//   1-2  logo (A1'den, ~40px)
//   3    rapor adı
//   4    "Tesisler: ..."
//   5    "Dönem: ... · Oluşturulma: ..."
//   6    boş (veya opts.note)
//   7    tablo başlığı (dondurulur)
//   8+   zebra veri satırları, en altta opsiyonel toplam satırı

import type { Workbook, Worksheet, Cell } from "exceljs";
import { dayjsTR } from "@/lib/dayjs";
import logoUrl from "@/assets/porteco-logo-horizontal.png";

export type BrandedWorkbookMeta = {
  reportTitle: string;
  userName?: string;
  facilities: string[];
  period: string;
};

export type BrandedCellValue = number | string | null;

export type BrandedColumn = {
  header: string;
  key: string;
  width?: number; // yoksa: ilk kolon 14, diğerleri 22
  numFmt?: string; // yoksa: '#,##0.00' (sadece sayısal hücrelere uygulanır)
};

export type BrandedSheetOpts = {
  sheetName: string;
  columns: BrandedColumn[];
  rows: Array<Record<string, BrandedCellValue>>;
  // Toplam satırı ÇAĞIRAN hesaplar (ör. oran kolonu toplam değil yeniden
  // hesap olduğu için şablon asla kendisi toplamaz).
  totalRow?: Record<string, BrandedCellValue>;
  note?: string; // satır 6'ya gri italik not (ör. "Bu seçim için GES verisi yok.")
  footnote?: string; // tablonun altına küçük gri dipnot (1 boş satır sonra)
  // Çok satırlı (binlerce satır) çıktılarda performans için: veri satırlarında
  // zebra dolgusu ve hücre kenarlıkları uygulanmaz (yalnızca numFmt + hizalama).
  // Başlık bloğu, koyu mavi başlık satırı, dondurulmuş başlık ve toplam satırı
  // aynen kalır. Varsayılan false → mevcut raporlar etkilenmez.
  lightweight?: boolean;
};

// ── PortEco marka kiti (ARGB = "FF" + hex) ──
const BRAND = {
  blue: "FF00AEEF", // toplam satırı dolgusu
  darkBlue: "FF005B96", // tablo başlığı dolgusu
  navy: "FF0F1C2E", // rapor adı + veri metni
  zebra: "FFE6F8FD", // çift veri satırları
  gray: "FF7A8C99", // meta satırları + not
  white: "FFFFFFFF",
  borderLt: "FFD6DEE4", // veri hücre kenarlıkları (nötr açık gri)
} as const;

const FONT = "Calibri";
const NUMFMT_DEFAULT = "#,##0.00";
const DASH = "—";

// Logo: src/assets/porteco-logo-horizontal.png — 530×160 px (oran 3.3125).
// Excel'de ~40px yükseklik hedefi → 132×40.
const LOGO_EXT = { width: 132, height: 40 };

// addBrandedSheet(wb, opts) imzası meta/logo taşımadığı için workbook başına
// durum burada tutulur; createBrandedWorkbook doldurur.
const wbState = new WeakMap<Workbook, { meta: BrandedWorkbookMeta; logoId: number | null }>();

type ExcelJSModule = typeof import("exceljs");

/**
 * Markalı workbook oluşturur. ExcelJS'i dynamic import ile yükler ve logoyu
 * workbook'a gömer (logo yüklenemezse rapor logosuz devam eder).
 */
export async function createBrandedWorkbook(meta: BrandedWorkbookMeta): Promise<Workbook> {
  const mod = (await import("exceljs")) as ExcelJSModule & { default?: ExcelJSModule };
  const ExcelJS = mod.default ?? mod; // dev (esbuild) / build (Rollup) interop farkı

  const wb = new ExcelJS.Workbook();
  wb.creator = meta.userName ?? "PortEco";
  wb.created = new Date();

  let logoId: number | null = null;
  try {
    const resp = await fetch(logoUrl); // hashed asset URL de data: URL de fetch'lenir
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      logoId = wb.addImage({
        // Tarayıcıda ArrayBuffer runtime'da geçerli; tip tarafında Node Buffer
        // beklendiği ve projede @types/node olmadığı için isimsiz cast.
        buffer: buf as unknown as Parameters<Workbook["addImage"]>[0]["buffer"],
        extension: "png",
      });
    }
  } catch {
    // Logo gömülemedi — raporu engelleme, logosuz üret.
  }

  wbState.set(wb, { meta, logoId });
  return wb;
}

/** Marka başlık bloğu + stillenmiş tablo içeren sheet ekler. */
export function addBrandedSheet(wb: Workbook, opts: BrandedSheetOpts): Worksheet {
  const state = wbState.get(wb);
  if (!state) {
    throw new Error("addBrandedSheet: workbook createBrandedWorkbook ile oluşturulmalı.");
  }
  const { meta, logoId } = state;

  const colCount = opts.columns.length;
  // Dar tablolarda (ör. 2 kolonlu GES sheet'i) 14pt başlık merge sınırında
  // kırpılmasın diye başlık bloğu en az 5 kolona yayılır.
  const titleSpan = Math.max(colCount, 5);

  const sheet = wb.addWorksheet(opts.sheetName.slice(0, 31));
  sheet.views = [{ state: "frozen", ySplit: 7 }];

  // Kolon genişlikleri
  opts.columns.forEach((col, c) => {
    sheet.getColumn(c + 1).width = col.width ?? (c === 0 ? 14 : 22);
  });

  // ── Satır 1-2: logo (Excel satır yüksekliği punto; px = pt × 4/3) ──
  sheet.getRow(1).height = 22.5; // 30px
  sheet.getRow(2).height = 15; // 20px → toplam 50px ≥ 40px logo
  if (logoId !== null) {
    sheet.addImage(logoId, {
      tl: { col: 0, row: 0 },
      ext: LOGO_EXT,
      editAs: "oneCell",
    });
  }

  // ── Satır 3-5: rapor adı + meta ──
  const titleCell = sheet.getCell(3, 1);
  titleCell.value = meta.reportTitle;
  titleCell.font = { name: FONT, size: 14, bold: true, color: { argb: BRAND.navy } };
  sheet.mergeCells(3, 1, 3, titleSpan);

  const facCell = sheet.getCell(4, 1);
  facCell.value = `Tesisler: ${facilitiesLine(meta.facilities)}`;
  facCell.font = { name: FONT, size: 10, color: { argb: BRAND.gray } };
  sheet.mergeCells(4, 1, 4, titleSpan);

  const genAt = dayjsTR().format("DD.MM.YYYY HH:mm");
  const periodCell = sheet.getCell(5, 1);
  periodCell.value =
    `Dönem: ${meta.period} · Oluşturulma: ${genAt}` +
    (meta.userName ? ` · Hazırlayan: ${meta.userName}` : "");
  periodCell.font = { name: FONT, size: 10, color: { argb: BRAND.gray } };
  sheet.mergeCells(5, 1, 5, titleSpan);

  // ── Satır 6: boş / not ──
  if (opts.note) {
    const noteCell = sheet.getCell(6, 1);
    noteCell.value = opts.note;
    noteCell.font = { name: FONT, size: 10, italic: true, color: { argb: BRAND.gray } };
    sheet.mergeCells(6, 1, 6, titleSpan);
  }

  // ── Satır 7: tablo başlığı ──
  const headerRow = sheet.getRow(7);
  headerRow.height = 20;
  opts.columns.forEach((col, c) => {
    const cell = sheet.getCell(7, c + 1);
    cell.value = col.header;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: BRAND.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.darkBlue } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND.white } },
      left: { style: "thin", color: { argb: BRAND.white } },
      bottom: { style: "thin", color: { argb: BRAND.white } },
      right: { style: "thin", color: { argb: BRAND.white } },
    };
  });

  // ── Satır 8+: veri (zebra) ──
  const lightweight = opts.lightweight === true;
  opts.rows.forEach((row, i) => {
    const r = 8 + i;
    const zebra = !lightweight && i % 2 === 1; // 2., 4., ... veri satırları
    opts.columns.forEach((col, c) => {
      const cell = sheet.getCell(r, c + 1);
      writeCell(cell, row[col.key] ?? null, col, !lightweight);
      if (zebra) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
      }
    });
  });

  // ── Toplam satırı ──
  let lastRow = 7 + opts.rows.length;
  if (opts.totalRow) {
    const r = 8 + opts.rows.length;
    lastRow = r;
    opts.columns.forEach((col, c) => {
      const cell = sheet.getCell(r, c + 1);
      writeCell(cell, opts.totalRow?.[col.key] ?? null, col);
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: BRAND.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
      cell.border = {
        top: { style: "medium", color: { argb: BRAND.darkBlue } },
        left: { style: "thin", color: { argb: BRAND.borderLt } },
        bottom: { style: "thin", color: { argb: BRAND.borderLt } },
        right: { style: "thin", color: { argb: BRAND.borderLt } },
      };
    });
  }

  // ── Dipnot (tablodan 1 boş satır sonra, küçük gri italik) ──
  if (opts.footnote) {
    const r = lastRow + 2;
    const cell = sheet.getCell(r, 1);
    cell.value = opts.footnote;
    cell.font = { name: FONT, size: 9, italic: true, color: { argb: BRAND.gray } };
    sheet.mergeCells(r, 1, r, titleSpan);
  }

  return sheet;
}

/** workbook.xlsx.writeBuffer() → Blob → tarayıcı indirme. */
export async function downloadWorkbook(wb: Workbook, fileName: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf as unknown as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const outName = fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────
// İç yardımcılar
// ────────────────────────────────────────────────────────────

/** Veri hücresi yazımı: null → "—" ortalı; sayı → numFmt + sağa; metin → sola. */
function writeCell(
  cell: Cell,
  value: BrandedCellValue,
  col: BrandedColumn,
  applyBorder = true,
): void {
  cell.font = { name: FONT, size: 11, color: { argb: BRAND.navy } };
  if (applyBorder) {
    cell.border = {
      top: { style: "thin", color: { argb: BRAND.borderLt } },
      left: { style: "thin", color: { argb: BRAND.borderLt } },
      bottom: { style: "thin", color: { argb: BRAND.borderLt } },
      right: { style: "thin", color: { argb: BRAND.borderLt } },
    };
  }

  if (value === null || value === DASH) {
    // "—" sayısal formata sokulmadan string yazılır (Excel'de hata üretmez).
    cell.value = DASH;
    cell.alignment = { horizontal: "center" };
    return;
  }
  if (typeof value === "number") {
    cell.value = value;
    cell.numFmt = col.numFmt ?? NUMFMT_DEFAULT;
    cell.alignment = { horizontal: "right" };
    return;
  }
  cell.value = value; // ay adları, etiketler
  cell.alignment = { horizontal: "left" };
}

/**
 * Tesis listesi tek satıra sığmalı: merge'li hücre taşan metni çizmez ve
 * wrapText merge'li satırı büyütmez → uzun listede kırp + kalan sayısını yaz.
 */
function facilitiesLine(facilities: string[]): string {
  if (facilities.length === 0) return DASH;
  const full = facilities.join(", ");
  if (full.length <= 160) return full;

  let count = 0;
  let len = 0;
  for (const f of facilities) {
    const extra = count === 0 ? f.length : f.length + 2;
    if (len + extra > 150) break;
    len += extra;
    count++;
  }
  count = Math.max(count, 1);
  const rest = facilities.length - count;
  return `${facilities.slice(0, count).join(", ")} … (+${rest} tesis)`;
}
