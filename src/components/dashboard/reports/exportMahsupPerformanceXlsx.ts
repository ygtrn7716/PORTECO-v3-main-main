// src/components/dashboard/reports/exportMahsupPerformanceXlsx.ts
//
// Mahsup Performansı raporunun Excel yazım katmanı (PortEco markalı şablon).
// Sheet 1: "Aylık Mahsup Özeti" — Ay | Tüketim | Tahmini YEKDEM | Kesin YEKDEM | Mahsup
// Sheet 2: "Tesis Bazlı Mahsup" — Ay | tesis mahsupları | Toplam
// Dosya adı: mahsup-performansi_{yıl}_{YYYYMMDD}.xlsx

import { dayjsTR } from "@/lib/dayjs";
import {
  createBrandedWorkbook,
  addBrandedSheet,
  downloadWorkbook,
  type BrandedCellValue,
  type BrandedColumn,
} from "./brandedExcel";
import type { Workbook } from "exceljs";
import type { MahsupPerformanceResult, TesisOption } from "./types";

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

const NUMFMT_YEKDEM = "#,##0.000000"; // birim değerler 6 ondalık
const NUMFMT_MONEY = "#,##0.00";

const tesisLabel = (t: TesisOption): string => {
  const tesisNo = (t.meterSerial ?? `Tesis ${t.subscriptionSerNo}`).trim();
  const nick = (t.nickname ?? "").trim();
  return nick ? `${tesisNo} - ${nick}` : tesisNo;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const r2OrNull = (v: number | null): number | null =>
  v === null ? null : round2(v);
const r6OrNull = (v: number | null): number | null =>
  v === null ? null : round6(v);

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

export async function buildMahsupPerformanceWorkbook(
  result: MahsupPerformanceResult,
): Promise<Workbook> {
  const wb = await createBrandedWorkbook({
    reportTitle: "Mahsup Performansı",
    facilities: result.tesisler.map(tesisLabel),
    period: String(result.year),
  });

  // ---- Sheet 1: Aylık Mahsup Özeti ----
  const summaryColumns: BrandedColumn[] = [
    { header: "Ay", key: "ay", width: 14 },
    { header: "Tüketim (kWh)", key: "tuketim", width: 22, numFmt: NUMFMT_MONEY },
    { header: "Tahmini YEKDEM (TL/kWh)", key: "tahmini", width: 22, numFmt: NUMFMT_YEKDEM },
    { header: "Kesin YEKDEM (TL/kWh)", key: "kesin", width: 22, numFmt: NUMFMT_YEKDEM },
    { header: "Mahsup Tutarı (TL)", key: "mahsup", width: 22, numFmt: NUMFMT_MONEY },
  ];

  const summaryRows: Array<Record<string, BrandedCellValue>> = [];
  for (let m = 0; m < 12; m++) {
    const row = result.monthly[m];
    summaryRows.push({
      ay: MONTH_LABELS_TR[m],
      tuketim: r2OrNull(row?.consumption_kwh ?? null),
      tahmini: r6OrNull(row?.yekdem_value_tl_kwh ?? null),
      kesin: r6OrNull(row?.yekdem_final_tl_kwh ?? null),
      mahsup: r2OrNull(row?.mahsup_tl ?? null),
    });
  }

  // Toplam satırı: tüketim + mahsup toplanır (mahsup = yıllık net fayda);
  // YEKDEM birim kolonlarında toplam anlamsız → tüketim-ağırlıklı yıllık
  // ortalama gösterilir.
  const summaryTotal = totalsFromRows(summaryRows, ["tuketim", "mahsup"]);
  summaryTotal.ay = "Yıllık Toplam (Net Fayda)";
  summaryTotal.tahmini = yearlyWeightedUnit(summaryRows, "tahmini");
  summaryTotal.kesin = yearlyWeightedUnit(summaryRows, "kesin");

  addBrandedSheet(wb, {
    sheetName: "Aylık Mahsup Özeti",
    columns: summaryColumns,
    rows: summaryRows,
    totalRow: summaryTotal,
    footnote:
      "Çoklu tesiste YEKDEM birim değerleri tüketim-ağırlıklı ortalamadır; toplam satırındaki mahsup yıllık net faydayı gösterir.",
  });

  // ---- Sheet 2: Tesis Bazlı Mahsup ----
  const byTesisColumns: BrandedColumn[] = [
    { header: "Ay", key: "ay", width: 14 },
    ...result.tesisler.map((t) => ({
      header: tesisLabel(t),
      key: `t${t.subscriptionSerNo}`,
      width: 22,
      numFmt: NUMFMT_MONEY,
    })),
    { header: "Toplam", key: "toplam", width: 22, numFmt: NUMFMT_MONEY },
  ];

  const byTesisRows: Array<Record<string, BrandedCellValue>> = [];
  for (let m = 0; m < 12; m++) {
    const row: Record<string, BrandedCellValue> = { ay: MONTH_LABELS_TR[m] };
    let total: number | null = null;
    for (const t of result.tesisler) {
      const v = result.mahsupByTesis[t.subscriptionSerNo]?.[m] ?? null;
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
  byTesisTotal.ay = "Yıllık Toplam (Net Fayda)";

  addBrandedSheet(wb, {
    sheetName: "Tesis Bazlı Mahsup",
    columns: byTesisColumns,
    rows: byTesisRows,
    totalRow: byTesisTotal,
  });

  return wb;
}

// Yıllık ağırlıklı YEKDEM birimi: Σ(aylık tüketim × aylık birim) / Σ(tüketim).
// Ağırlıklar 0/yoksa birimlerin basit ortalaması (division-by-zero guard).
function yearlyWeightedUnit(
  rows: Array<Record<string, BrandedCellValue>>,
  unitKey: string,
): number | null {
  let weightSum = 0;
  let weightedSum = 0;
  const plain: number[] = [];
  for (const row of rows) {
    const unit = row[unitKey];
    if (typeof unit !== "number") continue;
    plain.push(unit);
    const w = row.tuketim;
    if (typeof w !== "number") continue;
    weightSum += w;
    weightedSum += w * unit;
  }
  if (weightSum > 0) return round6(weightedSum / weightSum);
  if (plain.length > 0)
    return round6(plain.reduce((s, v) => s + v, 0) / plain.length);
  return null;
}

export async function exportMahsupPerformanceXlsx(
  result: MahsupPerformanceResult,
): Promise<void> {
  const wb = await buildMahsupPerformanceWorkbook(result);
  const fileName = `mahsup-performansi_${result.year}_${dayjsTR().format(
    "YYYYMMDD",
  )}.xlsx`;
  await downloadWorkbook(wb, fileName);
}
