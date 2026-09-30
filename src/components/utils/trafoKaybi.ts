// src/components/utils/trafoKaybi.ts
//
// Metot 7 (Meram / MEPAŞ) SAATLİK TRAFO KAYBI yardımcıları — SAF.
//
// Meram, AG ölçümlü tesislerde trafo kaybını (subscription_settings.trafo_kaybi_saatlik,
// kWh/saat) faturalama döneminin HER saatine tüketime ekler — o saatte sayaç satırı
// olmasa bile (eksik satır = cn 0 → tüketim = t). Kural hem havuz tahsisinin
// kapasitesine (gesAllocation.ts) hem tesisin kendi saatlik net agregalarına
// (hourlyNetAggregates.ts) girer.
//
// Uygulama bilinçli olarak bir ÖN-DÖNÜŞÜMdür: seri/satırlar t eklenmiş hâle getirilip
// mevcut, değişmemiş fonksiyonlara (allocateByMode, applyAllocationToHourlyRows,
// computeHourlyNetAggregates) verilir. t yok/0 ise girdi AYNEN döner → davranış
// bit-identik.
//
// ⚠️ SIFIR IMPORT: kabul testleri (tsx) bu modülü doğrudan yükler.

const HOUR_MS = 3_600_000;

/** Saat anahtarı — gesAllocation.ts / hourlyNetAggregates.ts ile BİREBİR aynı
 *  (UTC "YYYY-MM-DDTHH"). Türkiye'de DST olmadığı için UTC saat = yerel saat. */
export function trafoHourKey(ts: string | number | Date): string {
  return new Date(ts).toISOString().slice(0, 13);
}

/** Ayar değerini güvenle sayıya çevirir: null / NaN / ≤ 0 → 0 (kural kapalı). */
export function normalizeTrafoKaybi(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Pencere [startIso, endIso) (endInclusive → [startIso, endIso]) içindeki saat
 * anahtarları. `capIso` verilirse ızgara capIso'dan ÖNCEKİ saatlerle sınırlanır
 * (cari ay: gelecek saatlere t eklenmesin).
 */
export function hourGridKeys(
  startIso: string,
  endIso: string,
  opts?: { endInclusive?: boolean; capIso?: string | null }
): string[] {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const cap = opts?.capIso != null ? new Date(opts.capIso).getTime() : Infinity;
  const first = Math.ceil(start / HOUR_MS) * HOUR_MS;
  const keys: string[] = [];
  for (let t = first; opts?.endInclusive ? t <= end : t < end; t += HOUR_MS) {
    if (!(t < cap)) break;
    keys.push(new Date(t).toISOString().slice(0, 13));
  }
  return keys;
}

/**
 * Izgara kapağı. Pencere sonu `nowMs`'ten sonra değilse (tamamlanmış dönem) kapak
 * YOK → dönemin tüm saatleri. Aksi hâlde (cari dönem) kapak = tesisin son veri
 * saati + 1 saat; hiç veri yoksa pencere başı (ızgara boş → t eklenmez).
 */
export function trafoGridCapIso(p: {
  startIso: string;
  endIso: string;
  endInclusive?: boolean;
  lastTs: string | number | Date | null | undefined;
  nowMs: number;
}): string | null {
  const end = new Date(p.endIso).getTime();
  const windowEnd = p.endInclusive ? end + HOUR_MS : end;
  if (!(windowEnd > p.nowMs)) return null;
  if (p.lastTs == null) return p.startIso;
  const last = Math.floor(new Date(p.lastTs).getTime() / HOUR_MS) * HOUR_MS;
  if (!Number.isFinite(last)) return p.startIso;
  return new Date(last + HOUR_MS).toISOString();
}

/**
 * Saatlik seriye (Map<saatAnahtarı, {cn, gn}>) t ekler: ızgaradaki her saatte
 * cn += t; serisi olmayan ızgara saati {cn: t, gn: 0} olarak açılır. Izgara dışı
 * saatler aynen kalır. Girdi DEĞİŞTİRİLMEZ (kopya döner). t ≤ 0 → girdi aynen.
 */
export function addTrafoKaybiToSeries(
  series: Map<string, { cn: number; gn: number }>,
  t: number,
  keys: readonly string[]
): Map<string, { cn: number; gn: number }> {
  if (!(t > 0) || keys.length === 0) return series;
  const out = new Map<string, { cn: number; gn: number }>();
  for (const [k, v] of series) out.set(k, { cn: v.cn, gn: v.gn });
  for (const k of keys) {
    const cur = out.get(k);
    if (cur) cur.cn += t;
    else out.set(k, { cn: t, gn: 0 });
  }
  return out;
}

type TrafoRow = { ts?: string | number | Date; cn?: unknown; gn?: unknown };

/**
 * Saatlik satırlara t ekler. Izgaradaki her saat için tam bir kez: o saatin İLK
 * satırında cn += t; satırı olmayan ızgara saatine {ts, cn: t, gn: 0} satırı
 * eklenir. ts'siz ve ızgara dışı satırlar aynen kalır. trafoKwh = t × saat sayısı.
 * t ≤ 0 → satırlar aynen, trafoKwh = 0.
 */
export function addTrafoKaybiToRows<R extends TrafoRow>(
  rows: readonly R[],
  t: number,
  keys: readonly string[]
): { rows: Array<R | { ts: string; cn: number; gn: number }>; trafoKwh: number } {
  if (!(t > 0) || keys.length === 0) return { rows: rows.slice(), trafoKwh: 0 };
  const grid = new Set(keys);
  const seen = new Set<string>();
  const out: Array<R | { ts: string; cn: number; gn: number }> = [];
  for (const row of rows) {
    if (row.ts == null) {
      out.push(row);
      continue;
    }
    const k = trafoHourKey(row.ts);
    if (grid.has(k) && !seen.has(k)) {
      seen.add(k);
      const cn = Number(row.cn);
      out.push({ ...row, cn: (Number.isFinite(cn) ? cn : 0) + t });
    } else {
      out.push(row);
    }
  }
  for (const k of keys) {
    if (!seen.has(k)) out.push({ ts: `${k}:00:00.000Z`, cn: t, gn: 0 });
  }
  return { rows: out, trafoKwh: t * keys.length };
}
