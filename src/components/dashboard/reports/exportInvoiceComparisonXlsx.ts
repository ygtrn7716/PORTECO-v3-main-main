// src/components/dashboard/reports/exportInvoiceComparisonXlsx.ts
//
// Fatura Karşılaştırması raporunun Excel yazım katmanı (PortEco markalı şablon).
// Sheet 1: "Aylık Fatura Özeti" — Ay | Tüketim | Fatura | Mahsup | Ödenecek
// Sheet 2: "Tesis Bazlı Fatura" — Ay | tesis ödenecekleri | Toplam
// Dosya adı: fatura-karsilastirma_{yıl}_{YYYYMMDD}.xlsx

import { dayjsTR } from "@/lib/dayjs";
import {
  createBrandedWorkbook,
  addBrandedSheet,
  downloadWorkbook,
  type BrandedCellValue,
  type BrandedColumn,
} from "./brandedExcel";
import type { Workbook } from "exceljs";
import type { InvoiceComparisonResult, TesisOption } from "./types";

const MONTH_LABELS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const SNAPSHOT_FOOTNOTE = "Yalnızca kaydedilmiş fatura kayıtları listelenmiştir.";

const tesisLabel = (t: TesisOption): string => {
  const tesisNo = (t.meterSerial ?? `Tesis ${t.subscriptionSerNo}`).trim();
  const nick = (t.nickname ?? "").trim();
  return nick ? `${tesisNo} - ${nick}` : tesisNo;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;
const r2OrNull = (v: number | null): number | null =>
  v === null ? null : round2(v);

const totalsFromRows = (
  rows: Array<Record<string, BrandedCellValue>>,
  keys: string[],
): Record<string, BrandedCellValue> => {
  const out: Record<string, BrandedCellValue> = {};
  for (const k of keys) {
    let any = false;
    let acc = 0;
    for (const row of rows) {
      const v = row[k];
      if (typeof v === "number") {
        any = true;
        acc += v;
      }
    }
    out[k] = any ? round2(acc) : null;
  }
  return out;
};

export async function buildInvoiceComparisonWorkbook(
  result: InvoiceComparisonResult,
): Promise<Workbook> {
  const wb = await createBrandedWorkbook({
    reportTitle: "Fatura Karşılaştırması",
    facilities: result.tesisler.map(tesisLabel),
    period: String(result.year),
  });

  // ---- Sheet 1: Aylık Fatura Özeti ----
  const summaryColumns: BrandedColumn[] = [
    { header: "Ay", key: "ay", width: 14 },
    { header: "Toplam Tüketim (kWh)", key: "tuketim", width: 22 },
    { header: "Fatura (KDV Dahil, TL)", key: "fatura", width: 22 },
    { header: "YEKDEM Mahsup (TL)", key: "mahsup", width: 22 },
    { header: "Ödenecek (Mahsup Dahil, TL)", key: "odenecek", width: 26 },
  ];

  const summaryRows: Array<Record<string, BrandedCellValue>> = [];
  for (let m = 0; m < 12; m++) {
    const row = result.monthly[m];
    summaryRows.push({
      ay: MONTH_LABELS_TR[m],
      tuketim: r2OrNull(row?.consumption_kwh ?? null),
      fatura: r2OrNull(row?.invoice_tl ?? null),
      mahsup: r2OrNull(row?.mahsup_tl ?? null),
      odenecek: r2OrNull(row?.payable_tl ?? null),
    });
  }

  const summaryTotal = totalsFromRows(summaryRows, [
    "tuketim",
    "fatura",
    "mahsup",
    "odenecek",
  ]);
  summaryTotal.ay = "Yıllık Toplam";

  addBrandedSheet(wb, {
    sheetName: "Aylık Fatura Özeti",
    columns: summaryColumns,
    rows: summaryRows,
    totalRow: summaryTotal,
    footnote: SNAPSHOT_FOOTNOTE,
  });

  // ---- Sheet 2: Tesis Bazlı Fatura (ödenecek) ----
  const byTesisColumns: BrandedColumn[] = [
    { header: "Ay", key: "ay", width: 14 },
    ...result.tesisler.map((t) => ({
      header: tesisLabel(t),
      key: `t${t.subscriptionSerNo}`,
      width: 22,
    })),
    { header: "Toplam", key: "toplam", width: 22 },
  ];

  const byTesisRows: Array<Record<string, BrandedCellValue>> = [];
  for (let m = 0; m < 12; m++) {
    const row: Record<string, BrandedCellValue> = { ay: MONTH_LABELS_TR[m] };
    let total: number | null = null;
    for (const t of result.tesisler) {
      const v = result.payableByTesis[t.subscriptionSerNo]?.[m] ?? null;
      row[`t${t.subscriptionSerNo}`] = r2OrNull(v);
      if (v !== null) total = (total ?? 0) + v;
    }
    row.toplam = r2OrNull(total);
    byTesisRows.push(row);
  }

  const byTesisKeys = [
    ...result.tesisler.map((t) => `t${t.subscriptionSerNo}`),
    "toplam",
  ];
  const byTesisTotal = totalsFromRows(byTesisRows, byTesisKeys);
  byTesisTotal.ay = "Yıllık Toplam";

  addBrandedSheet(wb, {
    sheetName: "Tesis Bazlı Fatura",
    columns: byTesisColumns,
    rows: byTesisRows,
    totalRow: byTesisTotal,
    footnote: SNAPSHOT_FOOTNOTE,
  });

  return wb;
}

export async function exportInvoiceComparisonXlsx(
  result: InvoiceComparisonResult,
): Promise<void> {
  const wb = await buildInvoiceComparisonWorkbook(result);
  const fileName = `fatura-karsilastirma_${result.year}_${dayjsTR().format(
    "YYYYMMDD",
  )}.xlsx`;
  await downloadWorkbook(wb, fileName);
}
