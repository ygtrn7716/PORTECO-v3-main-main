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
