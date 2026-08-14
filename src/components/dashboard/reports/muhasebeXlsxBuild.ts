// src/components/dashboard/reports/muhasebeXlsxBuild.ts
//
// "Muhasebe Excel" — MuhasebeReport'tan ExcelJS Workbook kuran SAF katman.
// Tarayıcı API'si YOK (fetch/document/logo import yok) → hem exportMuhasebeXlsx
// (tarayıcı indirme) hem headless doğrulama harness'ı (tsx/Node) kullanabilir.
// Logo base64 string olarak dışarıdan gelir.
//
// Denetlenebilirlik: alt toplam / KDV / toplam satırları GERÇEK Excel formülü
// yazılır ({ formula, result }); result rapor tam-hassasiyet değeridir → hücre
// hesaplanmadan açılsa da modal ile birebir aynı görünür. Kalem hücreleri 6
// basamağa yuvarlanır (formül sonuçları yuvarlanmaz — kapanış bozulmaz).

import type { Cell, Workbook, Worksheet } from "exceljs";
import { dayjsTR } from "@/lib/dayjs";
import type { MuhasebeReport, MuhasebeRow } from "./muhasebeReport";
import type { PenguenTahakkukView } from "./penguenTahakkukView";

// PortEco marka kiti (ARGB = "FF" + hex)
const C = {
  blue: "FF00AEEF",
  darkBlue: "FF005B96",
  navy: "FF0F1C2E",
  zebra: "FFE6F8FD",
  totalFill: "FFEAF6FB",
  gray: "FF7A8C99",
  white: "FFFFFFFF",
  border: "FFD6DEE4",
  red: "FFB00020",
} as const;

const FONT = "Calibri";
const DASH = "—";
const FMT_TUTAR = '#,##0.00" ₺";[Red]-#,##0.00" ₺"';
const FMT_BIRIM = "#,##0.000000";
// Tahakkuk sheet'leri: ₺ sembolü YOK (Logo vb. muhasebe programı importunu bozar).
const FMT_TL_PLAIN = "#,##0.00";
// Kullanıcının dolduracağı hücre (Mizan Bakiyesi, Fatura Tarihi/No, boş hesap kodu).
const YELLOW = "FFFFF2CC";
const LOGO_EXT = { width: 132, height: 40 };
const miktarFmt = (birim: string) => (birim ? `#,##0.00" ${birim}"` : "#,##0.00");

// Ham float artıkları (972913.8000000006 gibi) hücreye taşınmasın.
const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;

// Sheet 1 kolonları — Tutar = 6. kolon (F)
const COLS = [
  { header: "Sınıf", width: 15 },
  { header: "Kalem", width: 34 },
  { header: "Açıklama", width: 36 },
  { header: "Miktar", width: 16 },
  { header: "Birim Fiyat", width: 15 },
  { header: "Tutar (TL)", width: 18 },
  { header: "Not", width: 44 },
] as const;
const NCOL = COLS.length;

type ExcelJSModule = typeof import("exceljs");

/** Blok içi hücre adres defteri (Tutar kolonu satır numaraları). */
type BlockAddrs = {
  itemRows: number[]; // yalnız toplama giren item satırları (Bilgi/null hariç)
  subtotal?: number;
  kdv?: number;
  adjustment?: number;
  total?: number;
};

export async function buildMuhasebeWorkbook(
  report: MuhasebeReport,
  logoBase64: string | null,
  // Penguen Tahakkuk varyantı: view verilirse standart sheet'lerin ÖNÜNE
  // "Muhasebe Özeti" + "Yevmiye Kayıtları" eklenir; verilmezse (default)
  // kod yolu bugünküyle birebir aynıdır (kural 3).
  tahakkukView: PenguenTahakkukView | null = null,
): Promise<Workbook> {
  const mod = (await import("exceljs")) as ExcelJSModule & { default?: ExcelJSModule };
  const ExcelJS = mod.default ?? mod;

  const wb = new ExcelJS.Workbook();
  wb.creator = "PortEco";
  wb.created = new Date();

  let logoId: number | null = null;
  if (logoBase64) {
    try {
      logoId = wb.addImage({ base64: logoBase64, extension: "png" });
    } catch (e) {
      console.warn("[Muhasebe] Logo workbook'a eklenemedi — rapor logosuz üretiliyor.", e);
    }
  }

  if (tahakkukView) {
    // Penguen kararı (2026-08-11): TEK sayfa, yalnız üç yevmiye fişi. Standart
    // sheet'ler ve özet/dayanak blokları bu varyantta YOK; dayanak denetimi
    // buildPenguenTahakkukView içindeki bileşen kontrolüne taşındı.
    buildYevmiyeSheet(wb, report, tahakkukView, logoId);
    return wb;
  }
  buildMainSheet(wb, report, logoId);
  buildParamSheet(wb, report, logoId);
  return wb;
}

// ── Başlık bloğu (logo + rapor adı + meta) → sonraki satır no ──────────────────
function writeHeader(
  sheet: Worksheet,
  report: MuhasebeReport,
  logoId: number | null,
  span: number,
  titleOverride?: string,
): number {
  sheet.getRow(1).height = 22.5;
  sheet.getRow(2).height = 15;
  if (logoId !== null) {
    sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: LOGO_EXT, editAs: "oneCell" });
  }

  const title = sheet.getCell(3, 1);
  title.value = titleOverride ?? report.meta.baslik;
  title.font = { name: FONT, size: 14, bold: true, color: { argb: C.navy } };
  sheet.mergeCells(3, 1, 3, span);

  const fac = sheet.getCell(4, 1);
  fac.value = `Tesis: ${report.meta.tesis}  (Serno ${report.meta.serno})`;
  fac.font = { name: FONT, size: 10, color: { argb: C.gray } };
  sheet.mergeCells(4, 1, 4, span);

  const genAt = dayjsTR(report.meta.uretimZamani).format("DD.MM.YYYY HH:mm");
  const meta = sheet.getCell(5, 1);
  meta.value =
    `Dönem: ${report.meta.donem} · Oluşturulma: ${genAt} · ` +
    `Veri: ${report.meta.dataSource === "snapshot" ? "Snapshot" : "Canlı hesap"}`;
  meta.font = { name: FONT, size: 10, color: { argb: C.gray } };
  sheet.mergeCells(5, 1, 5, span);

  return 7; // 6 = boş; içerik 7'den başlar
}

// ── Ardışık satırları "SUM(F10:F12)" parçalarına indirger, kopukları "+" ile ekler
function sumFormula(rows: number[]): string {
  if (rows.length === 0) return "0";
  const parts: string[] = [];
  let start = rows[0];
  let prev = rows[0];
  const flush = () => parts.push(start === prev ? `F${start}` : `SUM(F${start}:F${prev})`);
  for (const r of rows.slice(1)) {
    if (r === prev + 1) {
      prev = r;
      continue;
    }
    flush();
    start = r;
    prev = r;
  }
  flush();
  return parts.join("+");
}

/** Satırın Tutar hücresi için formül (yoksa null → düz değer yazılır). */
function formulaFor(
  blockId: string,
  row: MuhasebeRow,
  a: BlockAddrs,
  addrs: Partial<Record<string, BlockAddrs>>,
  b4: Record<string, number>,
  vatRate: number,
): string | null {
  if (blockId === "blok1" || blockId === "blok2" || blockId === "blok3") {
    if (row.kind === "subtotal") return sumFormula(a.itemRows);
    if (row.kind === "kdv" && a.subtotal != null) return `F${a.subtotal}*${vatRate}`;
    if (row.kind === "total" && a.subtotal != null && a.kdv != null) {
      return `F${a.subtotal}+F${a.kdv}` + (a.adjustment != null ? `+F${a.adjustment}` : "");
    }
    return null;
  }

  if (blockId === "blok4") {
    const b1 = addrs.blok1;
    const b2 = addrs.blok2;
    const b3 = addrs.blok3;
    const key = row.kalem.startsWith("Fark") ? "Fark" : row.kalem.split(".")[0];
    switch (key) {
      case "A":
        return b1?.total != null ? `F${b1.total}` : null;
      case "B":
        return b2?.total != null ? `F${b2.total}` : null;
      case "C":
        return b4.A != null && b4.B != null && b4.F != null ? `F${b4.A}+F${b4.B}+F${b4.F}` : null;
      case "D1":
        return b3?.subtotal != null ? `F${b3.subtotal}` : null;
      case "D2":
        return b3?.kdv != null ? `F${b3.kdv}` : null;
      case "D3":
        return b3?.total != null ? `F${b3.total}` : null;
      case "E1":
        return b4.C != null && b1?.kdv != null && b2?.kdv != null && b4.D1 != null
          ? `F${b4.C}-(F${b1.kdv}+F${b2.kdv})-F${b4.D1}`
          : null;
      case "E2":
        return b4.C != null && b4.D3 != null ? `F${b4.C}-F${b4.D3}` : null;
      default:
        return null; // "F." ve "Fark (kontrol)" düz değer
    }
  }

  if (blockId === "blok5" && row.kalem === "Mahsupsuz Fatura Toplamı (bu rapor)") {
    const b1 = addrs.blok1;
    return b1?.total != null ? `F${b1.total}` : null;
  }

  return null;
}

// ── Sheet 1: Fatura Muhasebe (bloklar alt alta) ───────────────────────────────
function buildMainSheet(wb: Workbook, report: MuhasebeReport, logoId: number | null): void {
  const sheet = wb.addWorksheet("Fatura Muhasebe");
  COLS.forEach((col, c) => (sheet.getColumn(c + 1).width = col.width));

  let r = writeHeader(sheet, report, logoId, NCOL);

  // Kapanış uyarısı bandı
  if (!report.closingCheck.ok) {
    const warn = sheet.getCell(r, 1);
    warn.value = `⚠ KAPANIŞ FARKI: ${report.closingCheck.fark.toFixed(2)} TL — C, fatura genel toplamıyla eşleşmiyor.`;
    warn.font = { name: FONT, size: 11, bold: true, color: { argb: C.red } };
    sheet.mergeCells(r, 1, r, NCOL);
    r += 2;
  }

  const addrs: Partial<Record<string, BlockAddrs>> = {};
  // Kolon başlıkları scroll'da donsun: BLOK 1'in kolon başlık satırına kadar freeze
  // (nominal A10; kapanış bandı varsa kayar — dinamik yakalanır).
  let freezeRow = 9;

  for (const block of report.blocks) {
    // Blok başlığı (koyu mavi bant)
    const hdr = sheet.getCell(r, 1);
    hdr.value = block.baslik;
    hdr.font = { name: FONT, size: 12, bold: true, color: { argb: C.white } };
    hdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.darkBlue } };
    hdr.alignment = { vertical: "middle" };
    sheet.getRow(r).height = 20;
    sheet.mergeCells(r, 1, r, NCOL);
    r++;

    // Blok açıklaması (gri italik)
    if (block.aciklama) {
      const desc = sheet.getCell(r, 1);
      desc.value = block.aciklama;
      desc.font = { name: FONT, size: 9, italic: true, color: { argb: C.gray } };
      desc.alignment = { wrapText: true, vertical: "top" };
      sheet.getRow(r).height = 28;
      sheet.mergeCells(r, 1, r, NCOL);
      r++;
    }

    // Kolon başlığı (brand mavi)
    COLS.forEach((col, c) => {
      const cell = sheet.getCell(r, c + 1);
      cell.value = col.header;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.blue } };
      cell.alignment = { horizontal: c >= 3 && c <= 5 ? "right" : "left", vertical: "middle" };
    });
    if (block.id === "blok1") freezeRow = r;
    r++;

    // Satırlar + adres defteri
    const a: BlockAddrs = { itemRows: [] };
    addrs[block.id] = a;
    const b4: Record<string, number> = {};
    let zebraIdx = 0;
    for (const row of block.rows) {
      const formula = formulaFor(block.id, row, a, addrs, b4, report.rates.vatRate);
      writeDataRow(sheet, r, row, zebraIdx, formula);
      if (row.kind === "item") {
        // Yalnız toplama giren satırlar SUM aralığına girer; BLOK 2 kuyruğundaki
        // "Bilgi" köprü satırları (sayısal ama toplam DIŞI) burada elenmiş olur.
        if (row.sinif !== "Bilgi" && row.tutar != null && a.subtotal == null) a.itemRows.push(r);
        zebraIdx++;
      } else if (row.kind === "subtotal" && a.subtotal == null) a.subtotal = r;
      else if (row.kind === "kdv" && a.kdv == null) a.kdv = r;
      else if (row.kind === "adjustment" && a.adjustment == null) a.adjustment = r;
      else if (row.kind === "total" && a.total == null) a.total = r;

      if (block.id === "blok4") {
        const key = row.kalem.startsWith("Fark") ? "Fark" : row.kalem.split(".")[0];
        if (b4[key] == null) b4[key] = r;
      }
      r++;
    }

    r++; // bloklar arası boş satır
  }

  sheet.views = [{ state: "frozen", ySplit: freezeRow }];
}

function writeDataRow(
  sheet: Worksheet,
  r: number,
  row: MuhasebeRow,
  zebraIdx: number,
  tutarFormula: string | null,
): void {
  const isItem = row.kind === "item";
  const isTotal = row.kind === "total";
  const isBold = row.kind === "subtotal" || row.kind === "total";
  const zebra = isItem && zebraIdx % 2 === 1;

  const textFont = {
    name: FONT,
    size: 10,
    bold: isBold,
    italic: row.kind === "adjustment",
    color: { argb: C.navy },
  } as const;

  const set = (
    c: number,
    value: string | number | null,
    opts: { fmt?: string; align?: "left" | "right" | "center"; formula?: string | null } = {},
  ) => {
    const cell = sheet.getCell(r, c);
    cell.font = textFont;
    if (opts.formula && typeof value === "number") {
      // Denetlenebilir formül; result = rapor tam-hassasiyet değeri (modal ile birebir)
      cell.value = { formula: opts.formula, result: value };
      if (opts.fmt) cell.numFmt = opts.fmt;
      cell.alignment = { horizontal: opts.align ?? "right" };
    } else if (value === null) {
      cell.value = DASH;
      cell.alignment = { horizontal: "center" };
    } else if (typeof value === "number") {
      cell.value = r6(value);
      if (opts.fmt) cell.numFmt = opts.fmt;
      cell.alignment = { horizontal: opts.align ?? "right" };
    } else {
      cell.value = value;
      cell.alignment = { horizontal: opts.align ?? "left", wrapText: c === 7 };
    }
    if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
    if (isTotal) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalFill } };
      cell.border = { top: { style: "medium", color: { argb: C.darkBlue } } };
    }
  };

  set(1, isItem ? row.sinif : "");
  set(2, row.kalem);
  set(3, row.aciklama);
  set(4, row.miktar, { fmt: miktarFmt(row.miktarBirim) });
  set(5, row.birimFiyat, { fmt: FMT_BIRIM });
  set(6, row.tutar, { fmt: FMT_TUTAR, formula: tutarFormula });
  set(7, row.not);
}

// ── Sheet 2: Parametreler ─────────────────────────────────────────────────────
function buildParamSheet(wb: Workbook, report: MuhasebeReport, logoId: number | null): void {
  const cols = [
    { header: "Parametre", width: 32 },
    { header: "Değer", width: 26 },
    { header: "Birim", width: 12 },
    { header: "Not", width: 34 },
  ];
  const sheet = wb.addWorksheet("Parametreler");
  sheet.views = [{ state: "frozen", ySplit: 7 }]; // kolon başlığı da donar (A8)
  cols.forEach((col, c) => (sheet.getColumn(c + 1).width = col.width));

  let r = writeHeader(sheet, report, logoId, cols.length);

  cols.forEach((col, c) => {
    const cell = sheet.getCell(r, c + 1);
    cell.value = col.header;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.blue } };
    cell.alignment = { horizontal: c === 1 ? "right" : "left", vertical: "middle" };
  });
  r++;

  report.params.forEach((prm, i) => {
    const zebra = i % 2 === 1;
    const font = { name: FONT, size: 10, color: { argb: C.navy } } as const;
    const cells: Array<string | number> = [prm.kalem, prm.deger, prm.birim, prm.not];
    cells.forEach((val, c) => {
      const cell = sheet.getCell(r, c + 1);
      cell.font = font;
      if (typeof val === "number") {
        cell.value = r6(val);
        cell.numFmt = "#,##0.000000";
        cell.alignment = { horizontal: "right" };
      } else {
        cell.value = val === "" ? DASH : val;
        cell.alignment = { horizontal: c === 1 ? "right" : "left" };
      }
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
    });
    r++;
  });
}

/* ══════════════════════════════════════════════════════════════════ */
/*  PENGUEN TAHAKKUK sheet'leri (yalnız tahakkukView verildiğinde)     */
/* ══════════════════════════════════════════════════════════════════ */

const thinBorder = {
  top: { style: "thin", color: { argb: C.border } },
  left: { style: "thin", color: { argb: C.border } },
  bottom: { style: "thin", color: { argb: C.border } },
  right: { style: "thin", color: { argb: C.border } },
} as const;

/** Kullanıcının dolduracağı sarı boş hücre. */
function fillable(cell: Cell): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
  cell.border = thinBorder;
  cell.numFmt = FMT_TL_PLAIN;
  cell.alignment = { horizontal: "right" };
}

/** Koyu mavi bölüm bandı (merge'li). */
function band(sheet: Worksheet, r: number, span: number, text: string): void {
  const cell = sheet.getCell(r, 1);
  cell.value = text;
  cell.font = { name: FONT, size: 12, bold: true, color: { argb: C.white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.darkBlue } };
  cell.alignment = { vertical: "middle" };
  sheet.getRow(r).height = 20;
  sheet.mergeCells(r, 1, r, span);
}

/** Brand mavi kolon başlığı hücresi. */
function headCell(sheet: Worksheet, r: number, c: number, text: string, right: boolean): void {
  const cell = sheet.getCell(r, c);
  cell.value = text;
  cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.blue } };
  cell.alignment = { horizontal: right ? "right" : "left", vertical: "middle", wrapText: true };
}

/** Gri italik not satırı (merge'li). */
function noteRow(sheet: Worksheet, r: number, span: number, text: string, height?: number): void {
  const cell = sheet.getCell(r, 1);
  cell.value = text;
  cell.font = { name: FONT, size: 9, italic: true, color: { argb: C.gray } };
  cell.alignment = { wrapText: true, vertical: "top" };
  if (height) sheet.getRow(r).height = height;
  sheet.mergeCells(r, 1, r, span);
}

/** Kapanış tutmadıysa kırmızı kontrol satırı (sessiz yuvarlama yok). */
function kapanisWarnRow(sheet: Worksheet, r: number, span: number, view: PenguenTahakkukView): void {
  const cell = sheet.getCell(r, 1);
  cell.value = `⚠ FARK (kontrol): ${view.kapanis.fark.toFixed(2)} TL — Diğer Satıcılar, fatura genel toplamıyla eşleşmiyor.`;
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.red } };
  sheet.mergeCells(r, 1, r, span);
}

// ── Sheet: Muhasebe Özeti — TEK sayfa: yalnız üç yevmiye fişi ────────────────
// (Penguen kararı 2026-08-11: özet tablosu + dayanak bloğu kaldırıldı; dayanak
// denetimi buildPenguenTahakkukView'daki bileşen kontrolünde yaşıyor.)
function buildYevmiyeSheet(
  wb: Workbook,
  report: MuhasebeReport,
  view: PenguenTahakkukView,
  logoId: number | null,
): void {
  const sheet = wb.addWorksheet("Muhasebe Özeti");
  [22, 48, 18, 18].forEach((w, c) => (sheet.getColumn(c + 1).width = w));
  sheet.views = [{ state: "frozen", ySplit: 6 }];

  let r = writeHeader(sheet, report, logoId, 4, "Fatura Muhasebe — Muhasebe Özeti");

  for (const fis of view.fisler) {
    band(sheet, r, 4, `${fis.baslik} — ${view.meta.donem}`);
    r++;
    noteRow(sheet, r, 4, fis.tarihNotu);
    r++;

    // Fiş 3: fatura tarihi/no sistemde yok → doldurulabilir sarı hücreler.
    if (fis.editableFaturaAlanlari) {
      const lt = sheet.getCell(r, 1);
      lt.value = "Fatura Tarihi:";
      lt.font = { name: FONT, size: 10, color: { argb: C.gray } };
      lt.alignment = { horizontal: "right" };
      const tarih = sheet.getCell(r, 2);
      fillable(tarih);
      tarih.numFmt = "DD.MM.YYYY";
      tarih.alignment = { horizontal: "left" };
      const ln = sheet.getCell(r, 3);
      ln.value = "Fatura No:";
      ln.font = { name: FONT, size: 10, color: { argb: C.gray } };
      ln.alignment = { horizontal: "right" };
      const no = sheet.getCell(r, 4);
      fillable(no);
      no.numFmt = "@"; // metin — uzun fatura no bilimsel gösterime düşmesin
      no.alignment = { horizontal: "left" };
      r++;
    }

    headCell(sheet, r, 1, "Hesap Kodu", false);
    headCell(sheet, r, 2, "Açıklama", false);
    headCell(sheet, r, 3, "Borç", true);
    headCell(sheet, r, 4, "Alacak", true);
    r++;

    const first = r;
    for (const satir of fis.satirlar) {
      const kod = sheet.getCell(r, 1);
      if (satir.hesapKodu === "") {
        fillable(kod); // kodsuz kalem (Diğer Düzeltmeler) — muhasebeci kendi hesabını yazar
        kod.numFmt = "@";
        kod.alignment = { horizontal: "left" };
      } else {
        kod.value = satir.hesapKodu;
        kod.font = { name: FONT, size: 10, color: { argb: C.navy } };
        kod.border = thinBorder;
      }
      const acik = sheet.getCell(r, 2);
      acik.value = satir.aciklama;
      acik.font = { name: FONT, size: 10, color: { argb: C.navy } };
      acik.border = thinBorder;
      const borc = sheet.getCell(r, 3);
      const alacak = sheet.getCell(r, 4);
      for (const [cell, val] of [[borc, satir.borc], [alacak, satir.alacak]] as const) {
        cell.font = { name: FONT, size: 10, color: { argb: C.navy } };
        cell.border = thinBorder;
        cell.numFmt = FMT_TL_PLAIN;
        cell.alignment = { horizontal: "right" };
        if (val != null) cell.value = r6(val); // null → hücre BOŞ (Logo importu için "—" yazılmaz)
      }
      r++;
    }
    const last = r - 1;

    // TOPLAM — gerçek SUM formülü + rapor tam-hassasiyet result
    const lbl = sheet.getCell(r, 2);
    lbl.value = "TOPLAM";
    const tBorc = sheet.getCell(r, 3);
    tBorc.value = { formula: `SUM(C${first}:C${last})`, result: fis.toplamBorc };
    const tAlacak = sheet.getCell(r, 4);
    tAlacak.value = { formula: `SUM(D${first}:D${last})`, result: fis.toplamAlacak };
    for (let col = 1; col <= 4; col++) {
      const cell = sheet.getCell(r, col);
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.navy } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalFill } };
      cell.border = { top: { style: "medium", color: { argb: C.darkBlue } } };
      if (col >= 3) {
        cell.numFmt = FMT_TL_PLAIN;
        cell.alignment = { horizontal: "right" };
      }
    }
    r += 2; // toplam + fişler arası boş satır
  }

  if (!view.kapanis.ok) kapanisWarnRow(sheet, r, 4, view);
}
