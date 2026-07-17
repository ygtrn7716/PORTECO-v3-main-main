// src/components/utils/parseManualConsumptionXlsx.ts
//
// EDAŞ portalından indirilen saatlik tüketim Excel'ini (xlsx/xls) parse edip
// consumption_hourly satırlarına çevirir. Değerler dosyada ÇARPANLI (final)
// gelir — burada hiçbir çarpma yapılmaz, olduğu gibi yazılır.
//
// Başlık eşleştirmesi: trim + case-insensitive + Türkçe karakter toleranslı.
// Tarih: "DD/MM/YYYY HH:mm:ss" veya Excel serial number; Europe/Istanbul
// olarak yorumlanır (dayjs tz — offset aritmetiği değil).

import * as XLSX from "xlsx";
import dayjs, { TR_TZ } from "@/lib/dayjs";

export type ManualConsumptionRow = {
  subscription_serno: number;
  ts: string; // ISO timestamptz (UTC)
  cn: number | null;
  ri: number | null;
  rc: number | null;
  rir: number | null;
  rcr: number | null;
  gn: number | null;
  rio: number | null;
  rco: number | null;
  riro: number | null;
  rcor: number | null;
  ml: null;
};

export type SkipReasons = {
  unknownSerno: number;
  invalidDate: number;
  emptyRow: number;
};

export type ManualParseResult = {
  rows: ManualConsumptionRow[];
  skipped: SkipReasons;
  skippedTotal: number;
  /** Dosyada geçen ama kullanıcının manuel tesis listesinde olmayan abone no'lar */
  unknownSernos: string[];
  /** Tesis başına yüklenecek satır sayısı */
  perSerno: { serno: number; count: number; rangeStart: string; rangeEnd: string }[];
  rangeStart: string | null;
  rangeEnd: string | null;
};

/* ------------------------------------------------------------------ */
/* Başlık normalizasyonu                                               */
/* ------------------------------------------------------------------ */

// U+0300–U+036F combining mark aralığı. Kaynakta escape/encoding belirsizliği
// yaşanmasın diye RegExp constructor + fromCharCode ile kuruluyor.
const COMBINING_MARKS_RE = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g",
);

// "Reaktif İndüktif Çekiş Oranı (%)" → "reaktif induktif cekis orani"
const normalizeHeader = (s: string) =>
  s
    .replace(/\(.*?\)/g, " ") // parantezli birim ekleri
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "") // combining mark'lar (ç, ö, ü, ğ, ş çözülür)
    .replace(/ı/g, "i") // dotless i (ı) NFKD ile çözülmez
    .replace(/\s+/g, " ")
    .trim();

// normalize edilmiş Excel başlığı → consumption_hourly kolon adı
const HEADER_TO_COLUMN: Record<string, keyof Omit<ManualConsumptionRow, "subscription_serno" | "ts" | "ml">> = {
  "aktif cekis": "cn",
  "reaktif induktif cekis": "ri",
  "reaktif kapasitif cekis": "rc",
  "reaktif induktif cekis orani": "rir",
  "reaktif kapasitif cekis orani": "rcr",
  "aktif veris": "gn",
  "reaktif induktif veris": "rio",
  "reaktif kapasitif veris": "rco",
  "reaktif induktif veris orani": "riro",
  "reaktif kapasitif veris orani": "rcor",
};

const SERNO_HEADER = "abone no";
const DATE_HEADER = "tarih";

/* ------------------------------------------------------------------ */
/* Hücre parse yardımcıları                                            */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Tarih hücresi → ISO timestamptz (Europe/Istanbul yorumuyla).
 *  - Excel serial number → XLSX.SSF.parse_date_code
 *  - "DD/MM/YYYY HH:mm:ss" (ayraç . / - olabilir, saniye/saat opsiyonel)
 *  - "YYYY-MM-DD HH:mm:ss"
 *  - Date objesi (cellDates açık okunmuşsa diye savunma amaçlı)
 */
export function parseDateCell(raw: unknown): string | null {
  if (raw == null || raw === "") return null;

  let y: number, mo: number, d: number, h: number, mi: number, se: number;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const dc = (XLSX as any).SSF?.parse_date_code?.(raw);
    if (!dc || !dc.y) return null;
    y = dc.y;
    mo = dc.m;
    d = dc.d;
    h = dc.H ?? 0;
    mi = dc.M ?? 0;
    se = Math.min(59, Math.round(dc.S ?? 0));
  } else if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    y = raw.getFullYear();
    mo = raw.getMonth() + 1;
    d = raw.getDate();
    h = raw.getHours();
    mi = raw.getMinutes();
    se = raw.getSeconds();
  } else {
    const s = String(raw).trim();
    if (!s) return null;

    // "DD/MM/YYYY HH:mm[:ss]" — ayraç ./-/ olabilir, saat kısmı opsiyonel
    let m = s.match(
      /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (m) {
      d = Number(m[1]);
      mo = Number(m[2]);
      y = Number(m[3]);
      h = m[4] != null ? Number(m[4]) : 0;
      mi = m[5] != null ? Number(m[5]) : 0;
      se = m[6] != null ? Number(m[6]) : 0;
    } else {
      // "YYYY-MM-DD HH:mm[:ss]"
      m = s.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
      );
      if (!m) return null;
      y = Number(m[1]);
      mo = Number(m[2]);
      d = Number(m[3]);
      h = m[4] != null ? Number(m[4]) : 0;
      mi = m[5] != null ? Number(m[5]) : 0;
      se = m[6] != null ? Number(m[6]) : 0;
    }
  }

  // Aralık kontrolleri (dayjs bazı taşmaları sessizce yuvarlayabilir)
  if (y < 2000 || y > 2100) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  if (h < 0 || h > 23) return null;
  if (mi < 0 || mi > 59) return null;
  if (se < 0 || se > 59) return null;

  const local = `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(se)}`;
  const parsed = dayjs.tz(local, TR_TZ);
  if (!parsed.isValid()) return null;
  // 31/02 gibi taşan tarihleri yakala (dayjs bir sonraki aya kaydırabilir)
  if (parsed.date() !== d || parsed.month() + 1 !== mo || parsed.year() !== y) {
    return null;
  }
  return parsed.toISOString();
}

/**
 * Sayısal hücre parse:
 *  - number → direkt
 *  - "1.234,56" → 1234.56 (TR: nokta binlik, virgül ondalık)
 *  - "75,48" → 75.48
 *  - "75.48" / "1234" → direkt Number
 *  - Boş/null/çözülemeyen → null
 */
export function parseNumberCell(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  const s = String(raw).trim();
  if (!s) return null;

  if (s.includes(",")) {
    // TR formatı: noktalar binlik ayracı, virgül ondalık
    const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const v = Number(cleaned);
    return Number.isFinite(v) ? v : null;
  }

  const compact = s.replace(/\s/g, "");

  // Virgülsüz ama kesin TR binlik gruplama ("1.234", "12.345.678") → noktalar binlik.
  // "75.48" bu kalıba uymaz (grup 3 haneli değil) ve ondalık olarak kalır.
  if (/^-?\d{1,3}(\.\d{3})+$/.test(compact)) {
    const v = Number(compact.replace(/\./g, ""));
    return Number.isFinite(v) ? v : null;
  }

  const v = Number(compact);
  return Number.isFinite(v) ? v : null;
}

/**
 * "Abone No" (Tesisat No) → subscription_serno.
 * String gelirse baştaki sıfırlar atılır ("00099923360" → 99923360),
 * number gelirse direkt kullanılır. Çözülemeyen → null.
 */
export function parseSernoCell(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    return n > 0 ? n : null;
  }
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const stripped = s.replace(/^0+/, "");
  if (!stripped) return null;
  const n = Number(stripped);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/* ------------------------------------------------------------------ */
/* Ana parse                                                           */
/* ------------------------------------------------------------------ */

/**
 * Excel dosyasını parse eder.
 *
 * @param file        .xlsx / .xls dosyası
 * @param validSernos Kullanıcının data_source='manual' tesislerinin serno seti.
 *                    Listede olmayan abone no'lu satırlar yüklenmez, "atlandı"
 *                    sayacına girer.
 * @throws Error — dosya/başlık düzeyi sorunlarda Türkçe mesajla fırlatır.
 */
export async function parseManualConsumptionXlsx(
  file: File,
  validSernos: Set<number>,
): Promise<ManualParseResult> {
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    // cellDates: false → tarihler serial number olarak kalır, parseDateCell çözer
    wb = XLSX.read(buf, { type: "array", cellDates: false });
  } catch {
    throw new Error("Dosya okunamadı. Geçerli bir Excel (.xlsx/.xls) dosyası olduğundan emin olun.");
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Dosyada sayfa bulunamadı.");

  const aoa: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: "",
  });

  if (aoa.length === 0) throw new Error("Dosya boş görünüyor.");

  // Başlık satırını bul: "Abone No" ve "Tarih" içeren ilk satır (ilk 20 satırda ara)
  let headerRowIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const cells = (aoa[i] ?? []).map((c) => normalizeHeader(String(c ?? "")));
    if (cells.includes(SERNO_HEADER) && cells.includes(DATE_HEADER)) {
      headerRowIdx = i;
      headers = cells;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error(
      'Başlık satırı bulunamadı. Dosyada "Abone No" ve "Tarih" sütunları olmalı (EDAŞ portalından indirilen saatlik tüketim raporu).',
    );
  }

  const sernoIdx = headers.indexOf(SERNO_HEADER);
  const dateIdx = headers.indexOf(DATE_HEADER);

  // Değer sütunlarının indeksleri (bulunmayan sütun → o kolon hep null)
  const colIdx = new Map<string, number>();
  headers.forEach((h, idx) => {
    const col = HEADER_TO_COLUMN[h];
    if (col && !colIdx.has(col)) colIdx.set(col, idx);
  });

  if (!colIdx.has("cn")) {
    throw new Error('"Aktif Çekiş" sütunu bulunamadı. Dosya formatını kontrol edin.');
  }

  const readValue = (row: unknown[], col: string): number | null => {
    const idx = colIdx.get(col);
    if (idx == null) return null;
    return parseNumberCell(row[idx]);
  };

  const skipped: SkipReasons = { unknownSerno: 0, invalidDate: 0, emptyRow: 0 };
  const unknownSernoSet = new Set<string>();
  // Dosya içi dedupe: aynı (serno, ts) ikilisinden SONUNCUSU kazanır → Map overwrite
  const dedup = new Map<string, ManualConsumptionRow>();

  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    if (row.length === 0 || row.every((c) => c === "" || c == null)) {
      skipped.emptyRow++;
      continue;
    }

    const serno = parseSernoCell(row[sernoIdx]);
    if (serno == null || !validSernos.has(serno)) {
      skipped.unknownSerno++;
      const label = String(row[sernoIdx] ?? "").trim();
      if (label) unknownSernoSet.add(label);
      continue;
    }

    const ts = parseDateCell(row[dateIdx]);
    if (!ts) {
      skipped.invalidDate++;
      continue;
    }

    dedup.set(`${serno}|${ts}`, {
      subscription_serno: serno,
      ts,
      cn: readValue(row, "cn"),
      ri: readValue(row, "ri"),
      rc: readValue(row, "rc"),
      rir: readValue(row, "rir"),
      rcr: readValue(row, "rcr"),
      gn: readValue(row, "gn"),
      rio: readValue(row, "rio"),
      rco: readValue(row, "rco"),
      riro: readValue(row, "riro"),
      rcor: readValue(row, "rcor"),
      ml: null,
    });
  }

  const rows = Array.from(dedup.values());

  // Tesis başına sayım + min/max ts (ISO UTC string'ler lexicographic karşılaştırılabilir)
  const bySerno = new Map<number, { count: number; min: string; max: string }>();
  let min: string | null = null;
  let max: string | null = null;
  for (const r of rows) {
    if (min === null || r.ts < min) min = r.ts;
    if (max === null || r.ts > max) max = r.ts;
    const agg = bySerno.get(r.subscription_serno);
    if (!agg) {
      bySerno.set(r.subscription_serno, { count: 1, min: r.ts, max: r.ts });
    } else {
      agg.count++;
      if (r.ts < agg.min) agg.min = r.ts;
      if (r.ts > agg.max) agg.max = r.ts;
    }
  }

  return {
    rows,
    skipped,
    skippedTotal: skipped.unknownSerno + skipped.invalidDate + skipped.emptyRow,
    unknownSernos: Array.from(unknownSernoSet),
    perSerno: Array.from(bySerno.entries())
      .map(([serno, agg]) => ({
        serno,
        count: agg.count,
        rangeStart: agg.min,
        rangeEnd: agg.max,
      }))
      .sort((a, b) => a.serno - b.serno),
    rangeStart: min,
    rangeEnd: max,
  };
}
