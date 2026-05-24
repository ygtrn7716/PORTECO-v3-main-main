// src/components/utils/xlsx.ts
import * as XLSX from "xlsx";

export function downloadXlsx(opts: {
  rows: Record<string, any>[];
  fileName: string; // ".xlsx" ile bitebilir
  sheetName?: string;
}) {
  const { rows, fileName, sheetName = "Sheet1" } = opts;

  const ws = XLSX.utils.json_to_sheet(rows ?? []);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const outName = fileName.toLowerCase().endsWith(".xlsx")
    ? fileName
    : `${fileName}.xlsx`;

  XLSX.writeFile(wb, outName);
}

export type XlsxCellValue = string | number | null;

export type XlsxSheetSpec = {
  name: string;
  titleRows?: XlsxCellValue[][];
  columns: string[];
  rows: XlsxCellValue[][];
  colWidths?: number[];
};

export function downloadXlsxMulti(opts: {
  sheets: XlsxSheetSpec[];
  fileName: string;
}) {
  const wb = XLSX.utils.book_new();

  for (const s of opts.sheets) {
    const aoa: XlsxCellValue[][] = [];
    if (s.titleRows && s.titleRows.length > 0) {
      for (const row of s.titleRows) aoa.push(row);
      aoa.push([]); // boş ayraç satırı
    }
    aoa.push(s.columns);
    for (const row of s.rows) aoa.push(row);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (s.colWidths && s.colWidths.length > 0) {
      ws["!cols"] = s.colWidths.map((w) => ({ wch: w }));
    }
    // Excel sheet adı 31 karakter ile sınırlı
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }

  const outName = opts.fileName.toLowerCase().endsWith(".xlsx")
    ? opts.fileName
    : `${opts.fileName}.xlsx`;

  XLSX.writeFile(wb, outName);
}
