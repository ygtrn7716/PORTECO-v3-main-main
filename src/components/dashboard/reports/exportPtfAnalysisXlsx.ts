// src/components/dashboard/reports/exportPtfAnalysisXlsx.ts
//
// PTF Analizi raporunun Excel yazım katmanı (PortEco markalı şablon).
// Sheet 1: "Aylık PTF Özeti" — Ay | Ortalama PTF | Toplam Tüketim | Tahmini Maliyet
// Sheet 2: "Tesis Bazlı PTF" — Ay | tesis PTF'leri
// Dosya adı: ptf-analizi_{yıl}_{YYYYMMDD}.xlsx

import { dayjsTR } from "@/lib/dayjs";
import {
  createBrandedWorkbook,
  addBrandedSheet,
  downloadWorkbook,
  type BrandedCellValue,
  type BrandedColumn,
} from "./brandedExcel";
import type { Workbook } from "exceljs";
import type { PtfAnalysisResult, TesisOption } from "./types";

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

const NUMFMT_PTF = "#,##0.000000"; // PTF 6 ondalık
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

export async function buildPtfAnalysisWorkbook(
  result: PtfAnalysisResult,
): Promise<Workbook> {
  const wb = await createBrandedWorkbook({
    reportTitle: "PTF Analizi",
    facilities: result.tesisler.map(tesisLabel),
    period: String(result.year),
  });

  // ---- Sheet 1: Aylık PTF Özeti ----
  const summaryColumns: BrandedColumn[] = [
    { header: "Ay", key: "ay", width: 14 },
    { header: "Ortalama PTF (TL/kWh)", key: "ptf", width: 22, numFmt: NUMFMT_PTF },
    { header: "Toplam Tüketim (kWh)", key: "tuketim", width: 22, numFmt: NUMFMT_MONEY },
    { header: "Tahmini Enerji Maliyeti (TL)", key: "maliyet", width: 24, numFmt: NUMFMT_MONEY },
  ];

  const summaryRows: Array<Record<string, BrandedCellValue>> = [];
  for (let m = 0; m < 12; m++) {
    const row = result.monthly[m];
    summaryRows.push({
      ay: MONTH_LABELS_TR[m],
      ptf: r6OrNull(row?.ptf_tl_kwh ?? null),
      tuketim: r2OrNull(row?.consumption_kwh ?? null),
      maliyet: r2OrNull(row?.cost_tl ?? null),
    });
  }

  // Toplam satırı: tüketim/maliyet toplanır; PTF hücresi yıllık
  // tüketim-ağırlıklı ortalamadır (Σmaliyet / Σtüketim).
  let tCons: number | null = null;
  let tCost: number | null = null;
  for (const r of summaryRows) {
    if (typeof r.tuketim === "number") tCons = (tCons ?? 0) + r.tuketim;
    if (typeof r.maliyet === "number") tCost = (tCost ?? 0) + r.maliyet;
  }
  const totalRow: Record<string, BrandedCellValue> = {
    ay: "Yıllık Toplam",
    tuketim: tCons === null ? null : round2(tCons),
    maliyet: tCost === null ? null : round2(tCost),
    ptf:
      tCons !== null && tCons > 0 && tCost !== null
        ? round6(tCost / tCons)
        : null,
  };

  addBrandedSheet(wb, {
    sheetName: "Aylık PTF Özeti",
    columns: summaryColumns,
    rows: summaryRows,
    totalRow,
    footnote:
      "Ortalama PTF, tesislerin tüketim-ağırlıklı ortalamasıdır; toplam satırındaki PTF yıllık ağırlıklı ortalamadır.",
  });

  // ---- Sheet 2: Tesis Bazlı PTF ----
  const byTesisColumns: BrandedColumn[] = [
    { header: "Ay", key: "ay", width: 14 },
    ...result.tesisler.map((t) => ({
      header: tesisLabel(t),
      key: `t${t.subscriptionSerNo}`,
      width: 22,
      numFmt: NUMFMT_PTF,
    })),
  ];

  const byTesisRows: Array<Record<string, BrandedCellValue>> = [];
  for (let m = 0; m < 12; m++) {
    const row: Record<string, BrandedCellValue> = { ay: MONTH_LABELS_TR[m] };
    for (const t of result.tesisler) {
      row[`t${t.subscriptionSerNo}`] = r6OrNull(
        result.ptfByTesis[t.subscriptionSerNo]?.[m] ?? null,
      );
    }
    byTesisRows.push(row);
  }

  // PTF'lerin toplamı anlamsız olduğundan bu sheet'te toplam satırı yok.
  addBrandedSheet(wb, {
    sheetName: "Tesis Bazlı PTF",
    columns: byTesisColumns,
    rows: byTesisRows,
  });

  return wb;
}

export async function exportPtfAnalysisXlsx(
  result: PtfAnalysisResult,
): Promise<void> {
  const wb = await buildPtfAnalysisWorkbook(result);
  const fileName = `ptf-analizi_${result.year}_${dayjsTR().format("YYYYMMDD")}.xlsx`;
  await downloadWorkbook(wb, fileName);
}
