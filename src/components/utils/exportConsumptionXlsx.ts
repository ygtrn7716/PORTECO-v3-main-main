// src/components/utils/exportConsumptionXlsx.ts
//
// Saatlik tüketim Excel çıktısı — Raporlar bölümünün markalı ExcelJS şablonuna
// (brandedExcel.ts) taşındı. Binlerce satırlık saatlik veride performans için
// lightweight mod kullanılır (zebra + hücre kenarlıkları uygulanmaz).
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import {
  createBrandedWorkbook,
  addBrandedSheet,
  downloadWorkbook,
  type BrandedCellValue,
  type BrandedColumn,
} from "@/components/dashboard/reports/brandedExcel";

const SHEET_NAME = "Saatlik Tüketim";
const REPORT_TITLE = "Saatlik Tüketim Dökümü";

// Kolon sırası: Tarih | Saat | Çekiş | Veriş | RI | RC
const COLUMNS: BrandedColumn[] = [
  { header: "Tarih", key: "tarih", width: 14 },
  { header: "Saat", key: "saat", width: 10 },
  { header: "Çekiş (kWh)", key: "cekis", width: 16, numFmt: "#,##0.00" },
  { header: "Veriş (kWh)", key: "veris", width: 16, numFmt: "#,##0.00" },
  { header: "Reaktif İndüktif (kvarh)", key: "ri", width: 22, numFmt: "#,##0.00" },
  { header: "Reaktif Kapasitif (kvarh)", key: "rc", width: 24, numFmt: "#,##0.00" },
];

type ConsumptionRow = {
  tarih: string;
  saat: string;
  cekis: number;
  veris: BrandedCellValue; // gn null/undefined ise null → şablon "—" yazar
  ri: number;
  rc: number;
};

function safeName(s: string) {
  return (s ?? "tesis")
    .toString()
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
}

/** ts → { tarih, saat } (TR locale). */
function mapRow(r: {
  ts: string;
  cn: unknown;
  gn: unknown;
  ri: unknown;
  rc: unknown;
}): ConsumptionRow {
  const d = dayjsTR(r.ts);
  return {
    tarih: d.format("DD.MM.YYYY"),
    saat: d.format("HH:mm"),
    cekis: Number(r.cn) || 0,
    veris: r.gn == null ? null : Number(r.gn) || 0,
    ri: Number(r.ri) || 0,
    rc: Number(r.rc) || 0,
  };
}

/** Satırlardan toplam satırını kurar (Veriş hiç sayısal değilse null → "—"). */
function buildTotalRow(rows: ConsumptionRow[]): Record<string, BrandedCellValue> {
  let cekis = 0;
  let ri = 0;
  let rc = 0;
  let verisSum = 0;
  let anyVeris = false;
  for (const row of rows) {
    cekis += row.cekis;
    ri += row.ri;
    rc += row.rc;
    if (typeof row.veris === "number") {
      verisSum += row.veris;
      anyVeris = true;
    }
  }
  return {
    tarih: "Toplam",
    saat: null,
    cekis,
    veris: anyVeris ? verisSum : null,
    ri,
    rc,
  };
}

/** Ortak markalı workbook üretimi + indirme (lightweight + toplam satırı). */
async function buildAndDownloadBranded(params: {
  rows: ConsumptionRow[];
  facilities: string[];
  periodLabel: string;
  fileName: string;
}) {
  const { rows, facilities, periodLabel, fileName } = params;
  const wb = await createBrandedWorkbook({
    reportTitle: REPORT_TITLE,
    facilities,
    period: periodLabel,
  });
  addBrandedSheet(wb, {
    sheetName: SHEET_NAME,
    columns: COLUMNS,
    rows: rows as unknown as Array<Record<string, BrandedCellValue>>,
    totalRow: buildTotalRow(rows),
    lightweight: true,
  });
  await downloadWorkbook(wb, fileName);
}

/** Tek tesis: seçili tesisatın saatlik tüketimini markalı Excel olarak indirir. */
export async function exportConsumptionHourlyXlsx(opts: {
  userId: string;
  subscriptionSerno: number;
  fromIso: string; // gte
  toExclusiveIso: string; // lt
  facilityLabel: string; // "serno — ünvan/nickname"
  periodLabel: string; // "DD.MM.YYYY – DD.MM.YYYY"
  fileStart: string; // YYYYMMDD (dosya adı)
  fileEnd: string; // YYYYMMDD (dosya adı)
}) {
  const {
    userId,
    subscriptionSerno,
    fromIso,
    toExclusiveIso,
    facilityLabel,
    periodLabel,
    fileStart,
    fileEnd,
  } = opts;

  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("consumption_hourly")
      .select("ts, cn, gn, ri, rc")
      .eq("user_id", userId)
      .eq("subscription_serno", subscriptionSerno)
      .gte("ts", fromIso)
      .lt("ts", toExclusiveIso)
      .order("ts", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = data ?? [];
    all.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const rows = all.map(mapRow);
  const fileName = `tuketim-saatlik_${safeName(String(subscriptionSerno))}_${fileStart}-${fileEnd}.xlsx`;

  await buildAndDownloadBranded({
    rows,
    facilities: [facilityLabel],
    periodLabel,
    fileName,
  });
}

/** Tümü: tüm tesislerin saatlik verisini ts bazında toplayıp tek markalı sayfa üretir. */
export async function exportConsumptionAllTotalsXlsx(opts: {
  fromIso: string; // gte
  toExclusiveIso: string; // lt
  facilities: string[];
  periodLabel: string; // "DD.MM.YYYY – DD.MM.YYYY"
  fileStart: string; // YYYYMMDD
  fileEnd: string; // YYYYMMDD
}) {
  const { fromIso, toExclusiveIso, facilities, periodLabel, fileStart, fileEnd } = opts;

  const pageSize = 1000;
  let offset = 0;
  const all: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("consumption_hourly")
      .select("ts, cn, gn, ri, rc")
      .gte("ts", fromIso)
      .lt("ts", toExclusiveIso)
      .order("ts", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  // ts bazında topla (tüm tesislerin saatlik toplamı).
  type Agg = { cn: number; ri: number; rc: number; gnSum: number; anyGn: boolean };
  const byTs = new Map<string, Agg>();
  for (const r of all) {
    const key = String(r.ts);
    let a = byTs.get(key);
    if (!a) {
      a = { cn: 0, ri: 0, rc: 0, gnSum: 0, anyGn: false };
      byTs.set(key, a);
    }
    a.cn += Number(r.cn) || 0;
    a.ri += Number(r.ri) || 0;
    a.rc += Number(r.rc) || 0;
    if (r.gn != null) {
      a.gnSum += Number(r.gn) || 0;
      a.anyGn = true;
    }
  }

  const rows: ConsumptionRow[] = Array.from(byTs.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([ts, a]) => {
      const d = dayjsTR(ts);
      return {
        tarih: d.format("DD.MM.YYYY"),
        saat: d.format("HH:mm"),
        cekis: a.cn,
        veris: a.anyGn ? a.gnSum : null,
        ri: a.ri,
        rc: a.rc,
      };
    });

  const fileName = `tuketim-saatlik_TUMU_${fileStart}-${fileEnd}.xlsx`;

  await buildAndDownloadBranded({ rows, facilities, periodLabel, fileName });
}
