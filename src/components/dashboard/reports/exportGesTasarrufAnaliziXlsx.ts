// src/components/dashboard/reports/exportGesTasarrufAnaliziXlsx.ts
//
// GES Tasarruf Analizi raporunun Excel yazım katmanı (PortEco markalı şablon).
// Tek sayfa: Dönem | (Tesis) | Çekilen/Mahsup/Satılan kWh | Mevcut Fatura |
//            Satılan Enerji Geliri | GES Olmasaydı Fatura | GES Tasarrufu | %
// Satır = (tesis × dönem); >1 tesiste tesis bloğu altına ara toplam, en sona
// GENEL TOPLAM. Tasarruf % toplamlarda ORAN olarak yeniden hesaplanır
// (ΣTasarruf / ΣGES Olmasaydı) — sütun ortalaması alınmaz.
// Dosya adı: GES_Tasarruf_Analizi_<yıl>.xlsx

import {
  createBrandedWorkbook,
  addBrandedSheet,
  downloadWorkbook,
  type BrandedCellValue,
  type BrandedColumn,
} from "./brandedExcel";
import type { Workbook } from "exceljs";
import type { GesTasarrufAnaliziResult, GesTasarrufRow, TesisOption } from "./types";

const FOOTNOTE =
  "Tasarruf = GES Olmasaydı Fatura − Mevcut Fatura + Satılan Enerji Net Geliri. " +
  "Hesaplama kayıtlı fatura snapshot'ları baz alınarak yapılmıştır.";

const NUMFMT_KWH = "#,##0";
const NUMFMT_TL = "#,##0.00";
// Değer motorun tasarrufYuzde'si (×100 hazır) → Excel'in 0.0% kesir formatı
// KULLANILMAZ; sayı olduğu gibi yazılıp "%" son eki formatla eklenir.
const NUMFMT_PCT = '#,##0.0"%"';

const tesisLabel = (t: TesisOption): string => {
  const tesisNo = (t.meterSerial ?? `Tesis ${t.subscriptionSerNo}`).trim();
  const nick = (t.nickname ?? "").trim();
  return nick ? `${tesisNo} - ${nick}` : tesisNo;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;
const round1 = (v: number): number => Math.round(v * 10) / 10;
const r2OrNull = (v: number | null): number | null =>
  v === null ? null : round2(v);

/** Ham rapor satırları üzerinden kolon toplamları (null-only kolon → null).
 *  % toplamı ORAN olarak yeniden hesaplanır: ΣTasarruf / ΣGES Olmasaydı. */
const totalsFromGesRows = (
  rws: GesTasarrufRow[],
): Record<string, BrandedCellValue> => {
  const sum = (get: (r: GesTasarrufRow) => number | null): number | null => {
    let any = false;
    let acc = 0;
    for (const r of rws) {
      const v = get(r);
      if (typeof v === "number" && Number.isFinite(v)) {
        any = true;
        acc += v;
      }
    }
    return any ? acc : null;
  };

  const olmasaydi = sum((r) => r.gesOlmasaydiTl);
  const tasarruf = sum((r) => r.tasarrufTl);
  const pct =
    olmasaydi !== null && olmasaydi > 0 && tasarruf !== null
      ? round1((tasarruf / olmasaydi) * 100)
      : null;

  return {
    cekilen: r2OrNull(sum((r) => r.cekilenKwh)),
    mahsup: r2OrNull(sum((r) => r.mahsupKwh)),
    satilan: r2OrNull(sum((r) => r.satilanKwh)),
    mevcutFatura: r2OrNull(sum((r) => r.mevcutFaturaTl)),
    satisGelir: r2OrNull(sum((r) => r.satisNetGelirTl)),
    olmasaydi: r2OrNull(olmasaydi),
    tasarruf: r2OrNull(tasarruf),
    pct,
  };
};

export async function buildGesTasarrufAnaliziWorkbook(
  result: GesTasarrufAnaliziResult,
): Promise<Workbook> {
  const wb = await createBrandedWorkbook({
    reportTitle: "GES Tasarruf Analizi",
    facilities: result.tesisler.map(tesisLabel),
    period: String(result.year),
  });

  const multi = result.tesisler.length > 1;

  // Genişlikler başlık metnini tek satırda taşıyacak kadar (başlık kesilmesin);
  // Dönem "(geriye dönük)" ekini de sığdırır.
  const columns: BrandedColumn[] = [
    { header: "Dönem", key: "donem", width: 22 },
    ...(multi ? [{ header: "Tesis", key: "tesis", width: 26 }] : []),
    { header: "Çekilen kWh", key: "cekilen", width: 16, numFmt: NUMFMT_KWH },
    { header: "Mahsup kWh", key: "mahsup", width: 16, numFmt: NUMFMT_KWH },
    { header: "Satılan kWh", key: "satilan", width: 16, numFmt: NUMFMT_KWH },
    { header: "Mevcut Fatura (TL)", key: "mevcutFatura", width: 21, numFmt: NUMFMT_TL },
    { header: "Satılan Enerji Geliri (TL)", key: "satisGelir", width: 28, numFmt: NUMFMT_TL },
    { header: "GES Olmasaydı Fatura (TL)", key: "olmasaydi", width: 28, numFmt: NUMFMT_TL },
    { header: "GES Tasarrufu (TL)", key: "tasarruf", width: 21, numFmt: NUMFMT_TL },
    { header: "Tasarruf (%)", key: "pct", width: 14, numFmt: NUMFMT_PCT },
  ];

  const sheetRows: Array<Record<string, BrandedCellValue>> = [];
  // Ara toplam satırlarının sheetRows içindeki indeksleri (sonradan bold için).
  const subtotalIdx: number[] = [];

  for (const t of result.tesisler) {
    const blockRows = result.rows.filter(
      (r) => r.serno === t.subscriptionSerNo,
    );
    for (const r of blockRows) {
      sheetRows.push({
        donem:
          `${result.year}-${String(r.month).padStart(2, "0")}` +
          (r.backdated ? " (geriye dönük)" : ""),
        ...(multi ? { tesis: tesisLabel(t) } : {}),
        cekilen: r2OrNull(r.cekilenKwh),
        mahsup: r2OrNull(r.mahsupKwh),
        satilan: r2OrNull(r.satilanKwh),
        mevcutFatura: round2(r.mevcutFaturaTl),
        satisGelir: r2OrNull(r.satisNetGelirTl),
        olmasaydi: r2OrNull(r.gesOlmasaydiTl),
        tasarruf: r2OrNull(r.tasarrufTl),
        pct: r.tasarrufPct === null ? null : round1(r.tasarrufPct),
      });
    }
    if (multi) {
      subtotalIdx.push(sheetRows.length);
      sheetRows.push({
        donem: "TOPLAM",
        tesis: tesisLabel(t),
        ...totalsFromGesRows(blockRows),
      });
    }
  }

  // Genel toplam HAM satırlardan (ara toplamlar çift sayılmaz).
  const totalRow: Record<string, BrandedCellValue> = {
    donem: multi ? "GENEL TOPLAM" : "TOPLAM",
    ...(multi ? { tesis: null } : {}),
    ...totalsFromGesRows(result.rows),
  };

  const sheet = addBrandedSheet(wb, {
    sheetName: "GES Tasarruf Analizi",
    columns,
    rows: sheetRows,
    totalRow,
    footnote: FOOTNOTE,
  });

  // Ara toplam satırlarını bold yap (veri satırları sheet'te 8. satırdan başlar).
  for (const i of subtotalIdx) {
    const row = sheet.getRow(8 + i);
    for (let c = 1; c <= columns.length; c++) {
      const cell = row.getCell(c);
      cell.font = { ...(cell.font ?? {}), bold: true };
    }
  }

  return wb;
}

export async function exportGesTasarrufAnaliziXlsx(
  result: GesTasarrufAnaliziResult,
): Promise<void> {
  const wb = await buildGesTasarrufAnaliziWorkbook(result);
  await downloadWorkbook(wb, `GES_Tasarruf_Analizi_${result.year}.xlsx`);
}
