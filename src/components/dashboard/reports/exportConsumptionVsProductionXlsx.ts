import { dayjsTR } from "@/lib/dayjs";
import {
  downloadXlsxMulti,
  type XlsxCellValue,
  type XlsxSheetSpec,
} from "@/components/utils/xlsx";
import type {
  ConsumptionVsProductionResult,
  TesisOption,
} from "./types";

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

const tesisLabel = (t: TesisOption): string => {
  const tesisNo = (t.meterSerial ?? `Tesis ${t.subscriptionSerNo}`).trim();
  const nick = (t.nickname ?? "").trim();
  return nick ? `${tesisNo} - ${nick}` : tesisNo;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

const cellNum = (v: number | null): XlsxCellValue =>
  v === null ? "—" : round2(v);

// Ay bazlı satırların altına yıllık toplam satırı ekler.
// Sayısal kolonlar için null olmayanların toplamı; tüm değerler null ise "—".
const yearlyTotalRow = (
  label: string,
  rows: XlsxCellValue[][],
  numericColIndexes: number[],
): XlsxCellValue[] => {
  if (rows.length === 0) return [label];
  const out: XlsxCellValue[] = new Array(rows[0].length).fill("");
  out[0] = label;
  for (const i of numericColIndexes) {
    let any = false;
    let acc = 0;
    for (const r of rows) {
      const v = r[i];
      if (typeof v === "number") {
        any = true;
        acc += v;
      }
    }
    out[i] = any ? round2(acc) : "—";
  }
  return out;
};

export function exportConsumptionVsProductionXlsx(
  result: ConsumptionVsProductionResult,
): void {
  const tesisLabels = result.tesisler.map(tesisLabel);
  const tesislerJoin = tesisLabels.length > 0 ? tesisLabels.join(", ") : "—";
  const generatedAt = dayjsTR().format("DD.MM.YYYY HH:mm");

  const baseTitle: XlsxCellValue[][] = [
    ["Tüketim ve Üretim Karşılaştırması"],
    [`Oluşturulma: ${generatedAt}`],
    [`Tesisler: ${tesislerJoin}`],
    [`Dönem: ${result.year}`],
  ];

  // ---- Sheet 1: Aylık Özet ----
  const summaryCols = [
    "Ay",
    "Toplam Tüketim (kWh)",
    "Toplam Üretim (kWh)",
    "Net (Üretim − Tüketim)",
    "Üretim/Tüketim Oranı (%)",
  ];
  const summaryRows: XlsxCellValue[][] = [];
  for (let m = 0; m < 12; m++) {
    const row = result.monthlySummary[m];
    const cons = row?.consumption_kwh ?? null;
    const prod = row?.production_kwh ?? null;
    const net = cons !== null && prod !== null ? prod - cons : null;
    const ratio =
      cons !== null && cons !== 0 && prod !== null
        ? (prod / cons) * 100
        : null;
    summaryRows.push([
      MONTH_LABELS_TR[m],
      cellNum(cons),
      cellNum(prod),
      cellNum(net),
      cellNum(ratio),
    ]);
  }
  summaryRows.push(yearlyTotalRow("Yıllık Toplam", summaryRows, [1, 2, 3]));
  // Yıllık oran ayrı hesap: yıllık toplam üretim / yıllık toplam tüketim
  {
    const lastIdx = summaryRows.length - 1;
    const tCons = summaryRows[lastIdx][1];
    const tProd = summaryRows[lastIdx][2];
    const ratio =
      typeof tCons === "number" &&
      tCons !== 0 &&
      typeof tProd === "number"
        ? round2((tProd / tCons) * 100)
        : "—";
    summaryRows[lastIdx][4] = ratio;
  }

  const summarySheet: XlsxSheetSpec = {
    name: "Aylık Özet",
    titleRows: baseTitle,
    columns: summaryCols,
    rows: summaryRows,
    colWidths: [12, 22, 22, 22, 24],
  };

  // ---- Sheet 2: Tesis Bazlı Tüketim ----
  const consCols = ["Ay", ...tesisLabels, "Toplam"];
  const consRows: XlsxCellValue[][] = [];
  for (let m = 0; m < 12; m++) {
    const perTesis = result.tesisler.map(
      (t) => result.consumptionByTesis[t.subscriptionSerNo]?.[m] ?? null,
    );
    let total: number | null = null;
    for (const v of perTesis) {
      if (v === null) continue;
      total = (total ?? 0) + v;
    }
    consRows.push([
      MONTH_LABELS_TR[m],
      ...perTesis.map((v) => cellNum(v)),
      cellNum(total),
    ]);
  }
  const consNumericCols: number[] = [];
  for (let i = 1; i <= result.tesisler.length + 1; i++) consNumericCols.push(i);
  consRows.push(yearlyTotalRow("Yıllık Toplam", consRows, consNumericCols));

  const consSheet: XlsxSheetSpec = {
    name: "Tesis Bazlı Tüketim",
    titleRows: baseTitle,
    columns: consCols,
    rows: consRows,
    colWidths: [12, ...result.tesisler.map(() => 22), 16],
  };

  // ---- Sheet 3: GES Üretim ----
  const hasPlants = result.plantNames.length > 0;
  const prodTitleRows: XlsxCellValue[][] = hasPlants
    ? baseTitle
    : [...baseTitle, ["Bu seçim için GES verisi yok."]];

  const plantLabels = result.plantNames.map((p) => p.label);
  const prodCols = hasPlants
    ? ["Ay", ...plantLabels, "Toplam"]
    : ["Ay", "Toplam"];

  const prodRows: XlsxCellValue[][] = [];
  for (let m = 0; m < 12; m++) {
    if (!hasPlants) {
      prodRows.push([MONTH_LABELS_TR[m], "—"]);
      continue;
    }
    const perPlant = result.plantNames.map(
      (p) => result.productionByPlant[p.id]?.[m] ?? null,
    );
    let total: number | null = null;
    for (const v of perPlant) {
      if (v === null) continue;
      total = (total ?? 0) + v;
    }
    prodRows.push([
      MONTH_LABELS_TR[m],
      ...perPlant.map((v) => cellNum(v)),
      cellNum(total),
    ]);
  }
  const prodNumericCols: number[] = [];
  if (hasPlants) {
    for (let i = 1; i <= result.plantNames.length + 1; i++)
      prodNumericCols.push(i);
  } else {
    prodNumericCols.push(1);
  }
  prodRows.push(yearlyTotalRow("Yıllık Toplam", prodRows, prodNumericCols));

  const prodSheet: XlsxSheetSpec = {
    name: "GES Üretim",
    titleRows: prodTitleRows,
    columns: prodCols,
    rows: prodRows,
    colWidths: hasPlants
      ? [12, ...result.plantNames.map(() => 22), 16]
      : [12, 16],
  };

  const fileName = `tuketim-uretim-karsilastirma_${result.year}_${dayjsTR().format(
    "YYYYMMDD",
  )}.xlsx`;

  downloadXlsxMulti({
    sheets: [summarySheet, consSheet, prodSheet],
    fileName,
  });
}
