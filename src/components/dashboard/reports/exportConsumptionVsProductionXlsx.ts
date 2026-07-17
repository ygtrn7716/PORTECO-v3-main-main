// src/components/dashboard/reports/exportConsumptionVsProductionXlsx.ts
//
// "Tüketim ve Üretim Karşılaştırması" raporunun Excel yazım katmanı.
// PortEco markalı ExcelJS şablonunu (brandedExcel.ts) kullanır; veri
// hazırlama (fetchConsumptionVsProduction) değişmemiştir.
//
// 3 sheet: "Aylık Özet", "Tesis Bazlı Tüketim", "GES Üretim".
// Dosya adı: tuketim-uretim-karsilastirma_{yıl}_{YYYYMMDD}.xlsx

import { dayjsTR } from "@/lib/dayjs";
import {
  createBrandedWorkbook,
  addBrandedSheet,
  downloadWorkbook,
  type BrandedCellValue,
  type BrandedColumn,
} from "./brandedExcel";
import type { Workbook } from "exceljs";
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

const r2OrNull = (v: number | null): number | null =>
  v === null ? null : round2(v);

// Kolon toplamları: satırlardaki (yuvarlanmış) sayıların toplamı;
// kolonda hiç sayı yoksa null ("—" olarak görünür).
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

/**
 * Workbook'u kurar (indirme tetiklemez). Public export'un dışında ayrıca
 * doğrulama/test harness'larının gerçek dosya üretebilmesi için ayrıdır.
 */
export async function buildConsumptionVsProductionWorkbook(
  result: ConsumptionVsProductionResult,
): Promise<Workbook> {
  const wb = await createBrandedWorkbook({
    reportTitle: "Tüketim ve Üretim Karşılaştırması",
    facilities: result.tesisler.map(tesisLabel),
    period: String(result.year),
  });

  // ---- Sheet 1: Aylık Özet ----
  const summaryColumns: BrandedColumn[] = [
    { header: "Ay", key: "ay", width: 14 },
    { header: "Toplam Tüketim (kWh)", key: "tuketim", width: 22 },
    { header: "Toplam Üretim (kWh)", key: "uretim", width: 22 },
    { header: "Net (Üretim − Tüketim)", key: "net", width: 22 },
    { header: "Üretim/Tüketim Oranı (%)", key: "oran", width: 24 },
  ];

  const summaryRows: Array<Record<string, BrandedCellValue>> = [];
  for (let m = 0; m < 12; m++) {
    const row = result.monthlySummary[m];
    const cons = row?.consumption_kwh ?? null;
    const prod = row?.production_kwh ?? null;
    const net = cons !== null && prod !== null ? prod - cons : null;
    const ratio =
      cons !== null && cons !== 0 && prod !== null
        ? (prod / cons) * 100
        : null;
    summaryRows.push({
      ay: MONTH_LABELS_TR[m],
      tuketim: r2OrNull(cons),
      uretim: r2OrNull(prod),
      net: r2OrNull(net),
      oran: r2OrNull(ratio),
    });
  }

  const summaryTotal = totalsFromRows(summaryRows, ["tuketim", "uretim", "net"]);
  summaryTotal.ay = "Yıllık Toplam";
  // Yıllık oran toplam DEĞİL yeniden hesap: yıllık üretim / yıllık tüketim.
  const tCons = summaryTotal.tuketim;
  const tProd = summaryTotal.uretim;
  summaryTotal.oran =
    typeof tCons === "number" && tCons !== 0 && typeof tProd === "number"
      ? round2((tProd / tCons) * 100)
      : null;

  addBrandedSheet(wb, {
    sheetName: "Aylık Özet",
    columns: summaryColumns,
    rows: summaryRows,
    totalRow: summaryTotal,
  });

  // ---- Sheet 2: Tesis Bazlı Tüketim ----
  const consColumns: BrandedColumn[] = [
    { header: "Ay", key: "ay", width: 14 },
    ...result.tesisler.map((t) => ({
      header: tesisLabel(t),
      key: `t${t.subscriptionSerNo}`,
      width: 22,
    })),
    { header: "Toplam", key: "toplam", width: 22 },
  ];

  const consRows: Array<Record<string, BrandedCellValue>> = [];
  for (let m = 0; m < 12; m++) {
    const row: Record<string, BrandedCellValue> = { ay: MONTH_LABELS_TR[m] };
    let total: number | null = null;
    for (const t of result.tesisler) {
      const v = result.consumptionByTesis[t.subscriptionSerNo]?.[m] ?? null;
      row[`t${t.subscriptionSerNo}`] = r2OrNull(v);
      if (v !== null) total = (total ?? 0) + v;
    }
    row.toplam = r2OrNull(total);
    consRows.push(row);
  }

  const consKeys = [
    ...result.tesisler.map((t) => `t${t.subscriptionSerNo}`),
    "toplam",
  ];
  const consTotal = totalsFromRows(consRows, consKeys);
  consTotal.ay = "Yıllık Toplam";

  addBrandedSheet(wb, {
    sheetName: "Tesis Bazlı Tüketim",
    columns: consColumns,
    rows: consRows,
    totalRow: consTotal,
  });

  // ---- Sheet 3: GES Üretim ----
  const hasPlants = result.plantNames.length > 0;

  // Plant id'leri serbest string olduğundan key olarak indeks kullanılır.
  const prodColumns: BrandedColumn[] = hasPlants
    ? [
        { header: "Ay", key: "ay", width: 14 },
        ...result.plantNames.map((p, i) => ({
          header: p.label,
          key: `p${i}`,
          width: 22,
        })),
        { header: "Toplam", key: "toplam", width: 22 },
      ]
    : [
        { header: "Ay", key: "ay", width: 14 },
        { header: "Toplam", key: "toplam", width: 22 },
      ];

  const prodRows: Array<Record<string, BrandedCellValue>> = [];
  for (let m = 0; m < 12; m++) {
    const row: Record<string, BrandedCellValue> = { ay: MONTH_LABELS_TR[m] };
    if (hasPlants) {
      let total: number | null = null;
      result.plantNames.forEach((p, i) => {
        const v = result.productionByPlant[p.id]?.[m] ?? null;
        row[`p${i}`] = r2OrNull(v);
        if (v !== null) total = (total ?? 0) + v;
      });
      row.toplam = r2OrNull(total);
    } else {
      row.toplam = null;
    }
    prodRows.push(row);
  }

  const prodKeys = hasPlants
    ? [...result.plantNames.map((_, i) => `p${i}`), "toplam"]
    : ["toplam"];
  const prodTotal = totalsFromRows(prodRows, prodKeys);
  prodTotal.ay = "Yıllık Toplam";

  addBrandedSheet(wb, {
    sheetName: "GES Üretim",
    columns: prodColumns,
    rows: prodRows,
    totalRow: prodTotal,
    note: hasPlants ? undefined : "Bu seçim için GES verisi yok.",
  });

  return wb;
}

export async function exportConsumptionVsProductionXlsx(
  result: ConsumptionVsProductionResult,
): Promise<void> {
  const wb = await buildConsumptionVsProductionWorkbook(result);

  const fileName = `tuketim-uretim-karsilastirma_${result.year}_${dayjsTR().format(
    "YYYYMMDD",
  )}.xlsx`;

  await downloadWorkbook(wb, fileName);
}
