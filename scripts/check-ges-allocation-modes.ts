// scripts/check-ges-allocation-modes.ts
// Talep Birleştirme dağıtım modları — saf fonksiyon kabul testi.
// Kullanım: npm run check:ges-modes
//
// SAF fonksiyon testidir: DB'ye HİÇBİR ŞEY yazmaz/okumaz. Tek disk erişimi
// docs/talep-birlestirme/saatlik-mahsuplasma-ornek.xlsx fixture'ıdır (S1).
// gesAllocationModes.ts SIFIR IMPORT'lu olduğu için tsx altında @/lib/supabase
// zincirine hiç girmeden relative path'ten yüklenir.

import { readFileSync, existsSync } from "node:fs";
import * as XLSX from "xlsx";
import {
  allocateSirali,
  allocateSaatlikOransal,
  allocateToplamOransal,
  allocateByMode,
  buildPoolSrcSeries,
  distributeCapped,
  coerceTahsisModu,
  hourlyCapacity,
  isPoolMode,
  type AllocModeInput,
  type AllocModeOutput,
  type HourlySeries,
} from "../src/components/utils/gesAllocationModes";
// S9: faturanın tahsisi nasıl TÜKETTİĞİNİ ölçmek için gerçek tüketim fonksiyonu.
// gesAllocation.ts `@/lib/paginatedFetch` import eder ama o dosya yalnız
// `import type` içerir → tsx altında zincir runtime'a inmez, yüklenir (denendi).
import {
  applyAllocationToHourlyRows,
  type FacilityAllocationView,
} from "../src/components/utils/gesAllocation";
// S10: Metot 7 (Meram) saatlik trafo kaybı — saf seri ön-dönüşümü (sıfır import).
import { addTrafoKaybiToSeries } from "../src/components/utils/trafoKaybi";

// ── Test harness (check-muhasebe-report.ts deseni) ───────────────
let failures = 0;
const money = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TOL = 0.01;

function assertClose(label: string, actual: number, expected: number, tol = TOL) {
  const diff = Math.abs(actual - expected);
  const ok = diff <= tol;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "✅" : "❌"} ${label.padEnd(46)} = ${money(actual).padStart(16)}` +
      `   (beklenen ${money(expected)}, Δ ${diff.toFixed(4)})`,
  );
}
function assertTrue(label: string, cond: boolean) {
  if (!cond) failures++;
  console.log(`  ${cond ? "✅" : "❌"} ${label}`);
}

// ── Fixture kurucular ───────────────────────────────────────────

/** Saat anahtarı üretici — gerçek hourKeyUtc formatı ("YYYY-MM-DDTHH"). */
const hk = (h: number) => `2027-02-01T${String(h).padStart(2, "0")}`;

/** Basit senaryo kurucu: her tesis için [cn, gn] dizileri + kaynak gn dizisi. */
function buildInput(p: {
  srcGn: number[];
  targets: Array<{ serno: number; cn: number[]; gn?: number[]; isSource?: boolean }>;
}): AllocModeInput {
  const seriesBySerno = new Map<number, HourlySeries>();
  const sourceSernos = new Set<number>();

  const srcSeries: HourlySeries = new Map();
  p.srcGn.forEach((gn, h) => srcSeries.set(hk(h), { cn: 0, gn }));

  for (const t of p.targets) {
    const s: HourlySeries = new Map();
    t.cn.forEach((cn, h) => s.set(hk(h), { cn, gn: t.gn?.[h] ?? 0 }));
    seriesBySerno.set(t.serno, s);
    if (t.isSource) sourceSernos.add(t.serno);
  }

  return {
    assignments: p.targets.map((t, i) => ({ subscription_serno: t.serno, priority: i + 1 })),
    seriesBySerno,
    srcSeries,
    isSourceSerno: (serno) => sourceSernos.has(serno),
  };
}

/**
 * HAVUZ modeli kurucu (oransal modlar) — gesAllocation.ts'in oransal daldaki
 * girdi kurulumunun aynısı:
 *   src(h)        = Σ_{i ∈ liste} gn_i(h)          → buildPoolSrcSeries
 *   isSourceSerno = "listede mi?"                   → herkes için own_gn = 0
 */
function buildPoolInput(
  targets: Array<{ serno: number; cn: number[]; gn?: number[] }>
): AllocModeInput {
  const seriesBySerno = new Map<number, HourlySeries>();
  const listSernos = new Set<number>();
  for (const t of targets) {
    const s: HourlySeries = new Map();
    const len = Math.max(t.cn.length, t.gn?.length ?? 0);
    for (let h = 0; h < len; h++) s.set(hk(h), { cn: t.cn[h] ?? 0, gn: t.gn?.[h] ?? 0 });
    seriesBySerno.set(t.serno, s);
    listSernos.add(t.serno);
  }
  const assignments = targets.map((t, i) => ({ subscription_serno: t.serno, priority: i + 1 }));
  return {
    assignments,
    seriesBySerno,
    srcSeries: buildPoolSrcSeries({ assignments, seriesBySerno }),
    isSourceSerno: (serno) => listSernos.has(serno),
  };
}

const allocOf = (out: AllocModeOutput, serno: number) =>
  out.perSerno.get(serno)?.allocTotal ?? 0;
const sumAlloc = (out: AllocModeOutput) => {
  let s = 0;
  for (const [, b] of out.perSerno) s += b.allocTotal;
  return s;
};

console.log("\n═══ Talep Birleştirme — Dağıtım Modları Kabul Testi ═══");

// ════════════════════════════════════════════════════════════════
// S1) Excel fixture — 2027-02, 672 saat, üç tesis
// ════════════════════════════════════════════════════════════════
console.log("\n── S1) Excel fixture (docs/talep-birlestirme/saatlik-mahsuplasma-ornek.xlsx) ──");

const FIXTURE = "docs/talep-birlestirme/saatlik-mahsuplasma-ornek.xlsx";

if (!existsSync(FIXTURE)) {
  // Fixture repoda OLMALI — yoksa skip DEĞİL, FAIL.
  failures++;
  console.log(`  ❌ Fixture bulunamadı: ${FIXTURE}`);
} else {
  const wb = XLSX.read(readFileSync(FIXTURE), { type: "buffer", cellDates: false });
  const ws = wb.Sheets["Saatlik Mahsup"];
  assertTrue('Sheet "Saatlik Mahsup" var', ws != null);

  const cell = (col: string, row: number): unknown => {
    const c = (ws as Record<string, { v?: unknown }>)[col + row];
    return c ? c.v : undefined;
  };
  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // ⚠️ SATIR FİLTRESİ: yalnız A kolonu SAYISAL (gerçek Excel tarih serial) satırlar.
  // Dosyada 674–745 arası 72 hayalet şablon satırı var (A = "29.02.2027" gibi METİN,
  // var olmayan tarihler) ve 746'da =SUM(B2:B745) toplam satırı. Filtrelenmezse
  // B toplamı iki katına çıkar.
  const srcGn: number[] = [];
  const cn1: number[] = []; // Tesis 1 = C + D (E FORMÜL hücresi, okunmaz)
  const cn2: number[] = []; // Tesis 2 = G
  const cn3: number[] = []; // Tesis 3 = I
  let takenRows = 0;
  let skippedNonNumericA = 0;

  for (let r = 2; r <= 1000; r++) {
    const a = cell("A", r);
    if (a === undefined) continue;
    if (typeof a !== "number") {
      skippedNonNumericA++;
      continue;
    }
    takenRows++;
    srcGn.push(num(cell("B", r)));
    cn1.push(num(cell("C", r)) + num(cell("D", r)));
    cn2.push(num(cell("G", r)));
    cn3.push(num(cell("I", r)));
  }

  assertTrue(`alınan satır = 672 (gerçek: ${takenRows})`, takenRows === 672);
  assertTrue(
    `atlanan metin-A satırı = 72 (gerçek: ${skippedNonNumericA})`,
    skippedNonNumericA === 72,
  );

  const seriesBySerno = new Map<number, HourlySeries>();
  const mk = (arr: number[]): HourlySeries => {
    const s: HourlySeries = new Map();
    arr.forEach((cn, h) => s.set(String(h), { cn, gn: 0 }));
    return s;
  };
  seriesBySerno.set(1, mk(cn1));
  seriesBySerno.set(2, mk(cn2));
  seriesBySerno.set(3, mk(cn3));
  const fxSrc: HourlySeries = new Map();
  srcGn.forEach((gn, h) => fxSrc.set(String(h), { cn: 0, gn }));

  const fxInput: AllocModeInput = {
    assignments: [
      { subscription_serno: 1, priority: 1 },
      { subscription_serno: 2, priority: 2 },
      { subscription_serno: 3, priority: 3 },
    ],
    seriesBySerno,
    srcSeries: fxSrc,
    isSourceSerno: () => false, // fixture'da hedefler kaynak sayaç değil
  };

  assertClose("Σ B (kaynak veriş)", srcGn.reduce((a, b) => a + b, 0), 331873.92);
  assertClose("Σ (C+D) tesis 1", cn1.reduce((a, b) => a + b, 0), 193863.6);
  assertClose("Σ G tesis 2", cn2.reduce((a, b) => a + b, 0), 53954.46);
  assertClose("Σ I tesis 3", cn3.reduce((a, b) => a + b, 0), 33885.48);

  console.log("\n  saatlik_oransal:");
  const m2 = allocateSaatlikOransal(fxInput);
  assertClose("tesis 1", allocOf(m2, 1), 67910.14);
  assertClose("tesis 2", allocOf(m2, 2), 19847.38);
  assertClose("tesis 3", allocOf(m2, 3), 12375.85);
  assertClose("toplam tahsis", sumAlloc(m2), 100133.38);
  assertClose("artan (excess)", m2.excessTotal, 231740.54);

  console.log("\n  toplam_oransal:");
  const m3 = allocateToplamOransal(fxInput);
  assertClose("tesis 1", allocOf(m3, 1), 68910.09);
  assertClose("tesis 2", allocOf(m3, 2), 19178.47);
  assertClose("tesis 3", allocOf(m3, 3), 12044.82);
  assertClose("toplam tahsis", sumAlloc(m3), 100133.38);
  assertClose("artan (excess)", m3.excessTotal, 231740.54);

  console.log("\n  kimlik (Σsrc = Σalloc + excess):");
  assertClose("saatlik_oransal", sumAlloc(m2) + m2.excessTotal, m2.gesGnTotal, 1e-6);
  assertClose("toplam_oransal", sumAlloc(m3) + m3.excessTotal, m3.gesGnTotal, 1e-6);
}

// ════════════════════════════════════════════════════════════════
// S2) distributeCapped — spec'in üç doğrulama vektörü
// ════════════════════════════════════════════════════════════════
console.log("\n── S2) distributeCapped (spec vektörleri) ──");

const T3 = new Map([
  [1, 60],
  [2, 30],
  [3, 10],
]);
const BIG = 1e9;

console.log("\n  1b) sınır yok → 18 / 9 / 3");
const v1 = distributeCapped({
  M: 30,
  T: T3,
  S: new Map([
    [1, BIG],
    [2, BIG],
    [3, BIG],
  ]),
});
assertClose("tesis 1", v1.alloc.get(1)!, 18, 1e-9);
assertClose("tesis 2", v1.alloc.get(2)!, 9, 1e-9);
assertClose("tesis 3", v1.alloc.get(3)!, 3, 1e-9);
assertClose("kalan", v1.kalan, 0, 1e-9);

console.log("\n  1c) yeniden dağıtım S=100/100/1 → 19.333 / 9.667 / 1");
const v2 = distributeCapped({
  M: 30,
  T: T3,
  S: new Map([
    [1, 100],
    [2, 100],
    [3, 1],
  ]),
});
assertClose("tesis 1", v2.alloc.get(1)!, 19.3333333333, 1e-6);
assertClose("tesis 2", v2.alloc.get(2)!, 9.6666666667, 1e-6);
assertClose("tesis 3", v2.alloc.get(3)!, 1, 1e-9);
assertClose("kalan", v2.kalan, 0, 1e-9);
assertClose("Σalloc = M", v2.alloc.get(1)! + v2.alloc.get(2)! + v2.alloc.get(3)!, 30, 1e-9);

console.log("\n  1d) kalan satışa S=19/9/1 → 19 / 9 / 1, kalan 1");
const v3 = distributeCapped({
  M: 30,
  T: T3,
  S: new Map([
    [1, 19],
    [2, 9],
    [3, 1],
  ]),
});
assertClose("tesis 1", v3.alloc.get(1)!, 19, 1e-9);
assertClose("tesis 2", v3.alloc.get(2)!, 9, 1e-9);
assertClose("tesis 3", v3.alloc.get(3)!, 1, 1e-9);
assertClose("kalan (→ excess)", v3.kalan, 1, 1e-9);

console.log("\n  uç durumlar:");
const vAllZeroT = distributeCapped({
  M: 30,
  T: new Map([
    [1, 0],
    [2, 0],
  ]),
  S: new Map([
    [1, 10],
    [2, 10],
  ]),
});
assertClose("tüm T=0 → kalan = M", vAllZeroT.kalan, 30, 1e-9);
assertClose("tüm T=0 → alloc 1 = 0", vAllZeroT.alloc.get(1)!, 0, 1e-9);

const vNoActive = distributeCapped({ M: 30, T: T3, S: new Map([[1, 0]]) });
assertClose("S=0 (aktif yok) → kalan = M", vNoActive.kalan, 30, 1e-9);

const vTinyS = distributeCapped({ M: 30, T: T3, S: new Map([[1, 1e-15]]) });
assertTrue("S=1e-15 aktif sayılmaz (EPS guard)", vTinyS.alloc.get(1)! === 0);

// ════════════════════════════════════════════════════════════════
// S3) sirali — golden senaryo (bit-identiklik bekçisi)
// ════════════════════════════════════════════════════════════════
console.log("\n── S3) sirali golden (öncelik şelalesi) ──");

// 4 saat, 2 tesis. Saat 0: src 100, kap 60/30 → 60/30, artan 10
//           Saat 1: src  50, kap 60/30 → 50/0,  artan 0
//           Saat 2: src   0 → atlanır (üretim yok)
//           Saat 3: src  20, kap  0/30 →  0/20, artan 0
const gold = buildInput({
  srcGn: [100, 50, 0, 20],
  targets: [
    { serno: 101, cn: [60, 60, 40, 0] },
    { serno: 102, cn: [30, 30, 40, 30] },
  ],
});
const g1 = allocateSirali(gold);
assertClose("tesis 101 (p1)", allocOf(g1, 101), 110, 1e-9); // 60 + 50 + 0
assertClose("tesis 102 (p2)", allocOf(g1, 102), 50, 1e-9); // 30 + 0 + 20
assertClose("artan", g1.excessTotal, 10, 1e-9);
assertClose("gesGnTotal (src>0 saatleri)", g1.gesGnTotal, 170, 1e-9);
assertClose("kimlik", sumAlloc(g1) + g1.excessTotal, g1.gesGnTotal, 1e-9);
assertTrue(
  "saat 2 (src=0) hiçbir tesise yazılmadı",
  !g1.perSerno.get(101)!.allocByHour.has(hk(2)) && !g1.perSerno.get(102)!.allocByHour.has(hk(2)),
);

// ownGn kuralı: kaynak sayaç olan tesiste own gn düşülmez (kap = cn)
const ownGnCase = buildInput({
  srcGn: [100],
  targets: [
    { serno: 201, cn: [80], gn: [50], isSource: true }, // kaynak → ownGn=0 → kap=80
    { serno: 202, cn: [80], gn: [50] }, // kaynak değil → kap=30
  ],
});
const og = allocateSirali(ownGnCase);
assertClose("kaynak tesis kap = cn (ownGn=0)", allocOf(og, 201), 80, 1e-9);
assertClose("normal tesis kap = cn − gn", allocOf(og, 202), 20, 1e-9); // kalan 20, kap 30
assertClose("hourlyCapacity kaynak", hourlyCapacity({ cn: 80, gn: 50 }, 201, (s) => s === 201), 80, 1e-9);
assertClose("hourlyCapacity normal", hourlyCapacity({ cn: 80, gn: 50 }, 202, (s) => s === 201), 30, 1e-9);
assertClose("hourlyCapacity satır yok", hourlyCapacity(undefined, 202, () => false), 0, 1e-9);
assertTrue(
  "hourlyCapacity NaN korunur (Math.max semantiği)",
  Number.isNaN(hourlyCapacity({ cn: NaN, gn: 0 }, 1, () => false)),
);

// ════════════════════════════════════════════════════════════════
// S4) Mod 2/3 değişmezleri
// ════════════════════════════════════════════════════════════════
console.log("\n── S4) Mod 2/3 değişmezleri ──");

// Mod 2: bir saatte Σ_i alloc_i(h) ≤ src(h)
const inv = buildInput({
  srcGn: [100, 500, 30],
  targets: [
    { serno: 301, cn: [200, 100, 10] },
    { serno: 302, cn: [100, 50, 5] },
  ],
});
const i2 = allocateSaatlikOransal(inv);
let m2HourViolation = 0;
for (const h of [0, 1, 2]) {
  const key = hk(h);
  const sum =
    (i2.perSerno.get(301)!.allocByHour.get(key) ?? 0) +
    (i2.perSerno.get(302)!.allocByHour.get(key) ?? 0);
  const src = inv.srcSeries.get(key)!.gn;
  if (sum > src + 1e-9) m2HourViolation++;
}
assertTrue("Mod 2: her saatte Σalloc ≤ src", m2HourViolation === 0);
assertClose("Mod 2 kimlik", sumAlloc(i2) + i2.excessTotal, i2.gesGnTotal, 1e-9);

// Mod 3: alloc_i(h) ≤ kap_i(h) her saat (taşıyıcı değişmez; A_i ≤ caps_i = T_i)
const i3 = allocateToplamOransal(inv);
let m3CapViolation = 0;
for (const serno of [301, 302]) {
  for (const [key, ah] of i3.perSerno.get(serno)!.allocByHour) {
    const kap = hourlyCapacity(inv.seriesBySerno.get(serno)?.get(key), serno, () => false);
    if (ah > kap + 1e-9) m3CapViolation++;
  }
}
assertTrue("Mod 3: alloc_i(h) ≤ kap_i(h) (taşıyıcı değişmez)", m3CapViolation === 0);
assertClose("Mod 3 kimlik", sumAlloc(i3) + i3.excessTotal, i3.gesGnTotal, 1e-9);

// Mod 3: mahsup ÜRETİM saatlerinde oluşur (M) ama yansıtma dönemin TÜM
// saatlerine yayılır (üretim saati sınırı kaldırıldı) → bir üretim saatindeki
// Σ_i alloc_i(h) o saatin src(h)'inden KÜÇÜK olabilir; kimlik dönem toplamında
// tutar. Aşağıda M = min(10, 20) = 10, T = 2010/2010 → A = 5/5; h0 payı
// 10·(5/2010) ≈ 0.0249 ×2 ≈ 0.0498.
const crossOver = buildInput({
  srcGn: [10, 0, 0],
  targets: [
    { serno: 401, cn: [10, 1000, 1000] },
    { serno: 402, cn: [10, 1000, 1000] },
  ],
});
const co = allocateToplamOransal(crossOver);
assertClose("Mod 3 toplam tahsis = M", sumAlloc(co), 10, 1e-9);
assertClose("Mod 3 kimlik (çapraz)", sumAlloc(co) + co.excessTotal, co.gesGnTotal, 1e-9);
assertTrue(
  "Mod 3: yansıtma üretim-DIŞI saatlere de yayıldı",
  (co.perSerno.get(401)!.allocByHour.get(hk(1)) ?? 0) > 0,
);

// T_i üretim-DIŞI saatleri kapsar. ⚠️ ÜRETİM SAATİ SINIRI KALDIRILDI (Kayseri OSB):
// yalnız gece tüketen tesis de pay ALIR — eski davranışta S=0 olduğu için almıyordu.
// M = min(100, 50) = 50 ; T = 50/9999 → pay 50·50/10049 ve 50·9999/10049.
const nightOnly = buildInput({
  srcGn: [100, 0],
  targets: [
    { serno: 501, cn: [50, 0] }, // yalnız üretim saatinde tüketir
    { serno: 502, cn: [0, 9999] }, // yalnız gece tüketir (eskiden tahsis almıyordu)
  ],
});
const no3 = allocateToplamOransal(nightOnly);
const noT1 = 50;
const noT2 = 9999;
const noM = 50;
assertClose("gündüz tesisi pay ~ T_1", allocOf(no3, 501), (noM * noT1) / (noT1 + noT2), 1e-6);
assertClose(
  "gece tesisi ARTIK pay alır (S_i sınırı yok)",
  allocOf(no3, 502),
  (noM * noT2) / (noT1 + noT2),
  1e-6,
);
assertClose("toplam tahsis = M", sumAlloc(no3), noM, 1e-6);
assertClose("artan", no3.excessTotal, 50, 1e-6);

// Tek tesis: Mod 1 ve Mod 2 toplamı AYNI; Mod 3 toplamı da aynı (M ≤ S)
const single = buildInput({
  srcGn: [100, 40],
  targets: [{ serno: 601, cn: [60, 80] }],
});
const s1 = allocateSirali(single);
const s2 = allocateSaatlikOransal(single);
const s3 = allocateToplamOransal(single);
assertClose("tek tesis: sirali", allocOf(s1, 601), 100, 1e-9); // min(100,60)+min(40,80)=60+40
assertClose("tek tesis: saatlik_oransal = sirali", allocOf(s2, 601), allocOf(s1, 601), 1e-9);
assertClose("tek tesis: toplam_oransal toplamı = sirali", allocOf(s3, 601), allocOf(s1, 601), 1e-9);
assertTrue(
  "tek tesis: Mod 3 saatlik dağılım Mod 1'den FARKLI (oransal yayılım)",
  (s3.perSerno.get(601)!.allocByHour.get(hk(0)) ?? 0) !==
    (s1.perSerno.get(601)!.allocByHour.get(hk(0)) ?? 0),
);

// ════════════════════════════════════════════════════════════════
// S5) Dispatcher + uç durumlar
// ════════════════════════════════════════════════════════════════
console.log("\n── S5) Dispatcher + uç durumlar ──");

assertClose(
  'allocateByMode("sirali") = allocateSirali',
  allocOf(allocateByMode("sirali", gold), 101),
  allocOf(g1, 101),
  1e-12,
);
assertClose(
  "bilinmeyen mod → sirali fallback",
  allocOf(allocateByMode("bogus" as never, gold), 101),
  allocOf(g1, 101),
  1e-12,
);
assertTrue('coerceTahsisModu(null) = "sirali"', coerceTahsisModu(null) === "sirali");
assertTrue('coerceTahsisModu("bogus") = "sirali"', coerceTahsisModu("bogus") === "sirali");
assertTrue(
  'coerceTahsisModu("saatlik_oransal") korunur',
  coerceTahsisModu("saatlik_oransal") === "saatlik_oransal",
);
assertTrue(
  'coerceTahsisModu("toplam_oransal") korunur',
  coerceTahsisModu("toplam_oransal") === "toplam_oransal",
);

// Boş/degenerate girdiler — üç modda da çökmemeli
for (const mode of ["sirali", "saatlik_oransal", "toplam_oransal"] as const) {
  const empty = allocateByMode(mode, buildInput({ srcGn: [], targets: [] }));
  const noSrc = allocateByMode(
    mode,
    buildInput({ srcGn: [0, 0], targets: [{ serno: 1, cn: [10, 10] }] }),
  );
  const noCap = allocateByMode(
    mode,
    buildInput({ srcGn: [100], targets: [{ serno: 1, cn: [0] }] }),
  );
  const missing: AllocModeInput = {
    assignments: [{ subscription_serno: 9, priority: 1 }],
    seriesBySerno: new Map(), // seride HİÇ yok
    srcSeries: new Map([[hk(0), { cn: 0, gn: 100 }]]),
    isSourceSerno: () => false,
  };
  const miss = allocateByMode(mode, missing);

  assertTrue(
    `${mode}: boş girdi → 0/0`,
    empty.gesGnTotal === 0 && empty.excessTotal === 0 && sumAlloc(empty) === 0,
  );
  assertTrue(`${mode}: src=0 → tahsis 0, artan 0`, sumAlloc(noSrc) === 0 && noSrc.excessTotal === 0);
  assertClose(`${mode}: kapasite 0 → tümü artan`, noCap.excessTotal, 100, 1e-9);
  assertClose(`${mode}: seri yok → tümü artan`, miss.excessTotal, 100, 1e-9);
}

// Duplicate serno: sirali bugünkü gibi işler; oransal modlar çift saymaz
const dup: AllocModeInput = {
  assignments: [
    { subscription_serno: 700, priority: 1 },
    { subscription_serno: 700, priority: 2 },
  ],
  seriesBySerno: new Map([[700, new Map([[hk(0), { cn: 50, gn: 0 }]])]]),
  srcSeries: new Map([[hk(0), { cn: 0, gn: 100 }]]),
  isSourceSerno: () => false,
};
// sirali duplicate'i BUGÜNKÜ gibi iki kez işler: 1. geçiş kap=50 → 50 tahsis,
// remaining=50; 2. geçiş aynı kapasiteyi yeniden görür → 50 daha (aynı bucket'a).
// Bu mevcut davranış, bit-identiklik gereği KORUNUR (çoklu-GES defteri kapsam dışı).
assertClose(
  "duplicate serno: sirali iki kez işler (bugünkü davranış)",
  allocOf(allocateSirali(dup), 700),
  100,
  1e-9,
);
assertClose(
  "duplicate serno: saatlik_oransal çift saymaz",
  allocOf(allocateSaatlikOransal(dup), 700),
  50,
  1e-9,
);
assertClose(
  "duplicate serno: toplam_oransal çift saymaz",
  allocOf(allocateToplamOransal(dup), 700),
  50,
  1e-9,
);

// ════════════════════════════════════════════════════════════════
// S7) HAVUZ modeli — sentetik (oransal modlar)
// ════════════════════════════════════════════════════════════════
console.log("\n── S7) HAVUZ modeli — sentetik 2 saat × 3 tesis ──");

// h0: gn A100 B20 C0 → src 120 ; cn A10 B50 C40 → K 100, r=min(1,1.2)=1 → 10/50/40, artan 20
// h1: gn A30  B0  C0 → src  30 ; cn A50 B30 C20 → K 100, r=0.3        → 15/9/6,  artan 0
const poolSyn = buildPoolInput([
  { serno: 1, cn: [10, 50], gn: [100, 30] },
  { serno: 2, cn: [50, 30], gn: [20, 0] },
  { serno: 3, cn: [40, 20], gn: [0, 0] },
]);

assertTrue("isPoolMode: saatlik_oransal", isPoolMode("saatlik_oransal"));
assertTrue("isPoolMode: toplam_oransal", isPoolMode("toplam_oransal"));
assertTrue("isPoolMode: sirali DEĞİL", !isPoolMode("sirali"));
assertClose("havuz src(h0) = Σgn", poolSyn.srcSeries.get(hk(0))!.gn, 120, 1e-9);
assertClose("havuz src(h1) = Σgn", poolSyn.srcSeries.get(hk(1))!.gn, 30, 1e-9);
assertClose(
  "kap = HAM cn (own_gn düşülmez)",
  hourlyCapacity({ cn: 10, gn: 100 }, 1, poolSyn.isSourceSerno),
  10,
  1e-9,
);

console.log("\n  (a) saatlik_oransal havuz:");
const p7a = allocateSaatlikOransal(poolSyn);
assertClose("tesis 1", allocOf(p7a, 1), 25, 1e-9);
assertClose("tesis 2", allocOf(p7a, 2), 59, 1e-9);
assertClose("tesis 3", allocOf(p7a, 3), 46, 1e-9);
assertClose("toplam tahsis", sumAlloc(p7a), 130, 1e-9);
assertClose("artan", p7a.excessTotal, 20, 1e-9);
assertClose("Σsrc", p7a.gesGnTotal, 150, 1e-9);
assertClose("kimlik 150 = 130 + 20", sumAlloc(p7a) + p7a.excessTotal, 150, 1e-9);

console.log("\n  (b) toplam_oransal havuz (T = 60/80/60, M = 130):");
const p7b = allocateToplamOransal(poolSyn);
assertClose("tesis 1", allocOf(p7b, 1), 39, 1e-9);
assertClose("tesis 2", allocOf(p7b, 2), 52, 1e-9);
assertClose("tesis 3", allocOf(p7b, 3), 39, 1e-9);
assertClose("toplam tahsis", sumAlloc(p7b), 130, 1e-9);
assertClose("artan", p7b.excessTotal, 20, 1e-9);
// Üretim saati sınırı YOK: yansıtma TÜM saatlerde, ama alloc_i(h) ≤ kap_i(h).
let p7bViol = 0;
for (const serno of [1, 2, 3]) {
  for (const [key, ah] of p7b.perSerno.get(serno)!.allocByHour) {
    const kap = hourlyCapacity(poolSyn.seriesBySerno.get(serno)?.get(key), serno, poolSyn.isSourceSerno);
    if (ah > kap + 1e-9) p7bViol++;
  }
}
assertTrue("her saatte alloc_i(h) ≤ kap_i(h)", p7bViol === 0);
// h1 üretim saati olmasa da yansıtma oraya da düşer (sınır kaldırıldı)
assertTrue(
  "yansıtma üretim-DIŞI saatleri de kapsar",
  (p7b.perSerno.get(3)!.allocByHour.get(hk(1)) ?? 0) > 0,
);

// ════════════════════════════════════════════════════════════════
// S8) As Beton Excel fixture — gerçek Meram faturası (havuz)
// ════════════════════════════════════════════════════════════════
console.log("\n── S8) Niğde As Beton fixture (gerçek Meram faturası, Ağustos 2026) ──");

const AB_FIXTURE = "docs/talep-birlestirme/Niğde As Beton.xlsx";

if (!existsSync(AB_FIXTURE)) {
  failures++;
  console.log(`  ❌ Fixture bulunamadı: ${AB_FIXTURE}`);
} else {
  const wb = XLSX.read(readFileSync(AB_FIXTURE), { type: "buffer", cellDates: false });
  const ws = wb.Sheets["NİĞDE AS BETON"];
  assertTrue('Sheet "NİĞDE AS BETON" var', ws != null);

  const cell = (col: string, row: number): unknown => {
    const c = (ws as Record<string, { v?: unknown }>)[col + row];
    return c ? c.v : undefined;
  };
  const num2 = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // A tarih (sayısal serial), B/C veriş, E/H/K çekiş. Satır 746 = SUM satırı.
  // Kolon D/F/G/I/J/L FORMÜL hücreleri — okunmaz, gerekli değerler türetilir.
  const gn1: number[] = []; // 10128583 veriş (B)
  const gn2: number[] = []; // 10126953 veriş (C)
  const cn1: number[] = []; // 10128583 çekiş (E)
  const cn2: number[] = []; // 10126953 çekiş (H)
  const cn3: number[] = []; // 9062757  çekiş (K)
  let abRows = 0;
  let abSkipped = 0;

  for (let r = 2; r <= 1200; r++) {
    const a = cell("A", r);
    if (a === undefined) continue;
    if (typeof a !== "number") {
      abSkipped++;
      continue;
    }
    abRows++;
    gn1.push(num2(cell("B", r)));
    gn2.push(num2(cell("C", r)));
    cn1.push(num2(cell("E", r)));
    cn2.push(num2(cell("H", r)));
    cn3.push(num2(cell("K", r)));
  }

  // Satır 746 = SUM satırı (A boş → `continue`); bu dosyada metin-A satırı yok.
  assertTrue(`alınan satır = 744 (gerçek: ${abRows})`, abRows === 744);
  assertTrue(`atlanan metin-A satırı = 0 (gerçek: ${abSkipped})`, abSkipped === 0);
  assertClose("Σ B (10128583 veriş)", gn1.reduce((a, b) => a + b, 0), 452604.6);
  assertClose("Σ C (10126953 veriş)", gn2.reduce((a, b) => a + b, 0), 4967.52);
  assertClose(
    "havuz = Σ(B+C)",
    gn1.reduce((a, b) => a + b, 0) + gn2.reduce((a, b) => a + b, 0),
    457572.12,
  );

  // Havuz kurulumu: tesis1=(gn B, cn E), tesis2=(gn C, cn H), tesis3=(gn 0, cn K)
  const abInput = buildPoolInput([
    { serno: 10128583, cn: cn1, gn: gn1 },
    { serno: 10126953, cn: cn2, gn: gn2 },
    { serno: 9062757, cn: cn3 },
  ]);

  console.log("\n  saatlik_oransal (Meram) — gerçek fatura değerleri:");
  const abRes = allocateSaatlikOransal(abInput);
  assertClose("10128583", allocOf(abRes, 10128583), 3060.06);
  assertClose("10126953", allocOf(abRes, 10126953), 15715.88);
  assertClose("9062757", allocOf(abRes, 9062757), 10014.85);
  assertClose("toplam tahsis", sumAlloc(abRes), 28790.78);
  assertClose("artan", abRes.excessTotal, 428781.34);
  assertClose("kimlik", sumAlloc(abRes) + abRes.excessTotal, abRes.gesGnTotal, 1e-6);
}

// ════════════════════════════════════════════════════════════════
// S9) Faturanın kullandığı saatlik tahsis = allocTotal
// ════════════════════════════════════════════════════════════════
// toplam_oransal artık tahsisi dönemin TÜM saatlerine yaydığı için, tahsis
// penceresi ile faturanın okuduğu tüketim satırlarının penceresi AYRIŞIRSA
// sınır saatlerine yazılan tahsis faturaya GİRMEZ (sessiz kayıp).
// Bu blok iki şeyi ayrı ayrı doğrular:
//   (1) allocByHour toplamı == allocTotal  (motor kendi içinde tutarlı)
//   (2) applyAllocationToHourlyRows'un AYNI saatler üzerinden tükettiği tahsis
//       == allocTotal  (fatura girdisi ile audit birebir)
// Ayrıca pencere kayması senaryosu bilinçli olarak kurulup kaybın görünür
// olduğu gösterilir — gerçek yollarda aralıklar aynı değişkenden gelir.
console.log("\n── S9) Fatura girdisi ↔ allocTotal tutarlılığı ──");

for (const mode of ["sirali", "saatlik_oransal", "toplam_oransal"] as const) {
  const inputS9 =
    mode === "sirali"
      ? buildInput({
          srcGn: [100, 60, 0, 40],
          targets: [
            { serno: 801, cn: [80, 30, 50, 20] },
            { serno: 802, cn: [40, 40, 10, 30] },
          ],
        })
      : buildPoolInput([
          { serno: 801, cn: [80, 30, 50, 20], gn: [100, 60, 0, 40] },
          { serno: 802, cn: [40, 40, 10, 30] },
        ]);

  const out = allocateByMode(mode, inputS9);

  for (const serno of [801, 802]) {
    const bucket = out.perSerno.get(serno)!;
    // (1) motor içi tutarlılık
    let hourSum = 0;
    for (const [, v] of bucket.allocByHour) hourSum += v;
    assertClose(`${mode}/${serno}: Σ allocByHour = allocTotal`, hourSum, bucket.allocTotal, 1e-9);

    // (2) faturanın gerçekten tükettiği tahsis (applyAllocationToHourlyRows yolu)
    const series = inputS9.seriesBySerno.get(serno)!;
    const rows = [...series.entries()].map(([hour, r]) => ({ ts: `${hour}:00:00.000Z`, cn: r.cn, gn: r.gn }));
    const view: FacilityAllocationView = {
      role: "assigned",
      priority: serno === 801 ? 1 : 2,
      allocByHour: bucket.allocByHour,
      allocTotal: bucket.allocTotal,
      excessTotal: 0, // lump'ı dışarıda tut: yalnız saatlik tahsisi ölçüyoruz
      isSource: inputS9.isSourceSerno(serno),
      mode,
      ownGnTotal: 0,
    };
    const eff = applyAllocationToHourlyRows(rows, view);
    // ⚠️ allocatedKwh, view.allocTotal'ı AYNEN döner (gesAllocation.ts) — yani audit
    // alanıdır, faturanın gerçekten tükettiği tahsisin ölçüsü DEĞİLDİR. Gerçek ölçü
    // efektif gn: own_gn + saatlik tahsis. Aşağıda ikisi de kontrol edilir.
    assertClose(`${mode}/${serno}: audit allocatedKwh = allocTotal`, eff.allocatedKwh, bucket.allocTotal, 1e-9);
    let ownGnSum = 0;
    for (const [, r] of series) ownGnSum += view.isSource ? 0 : r.gn;
    assertClose(
      `${mode}/${serno}: FATURA efektif gn = own_gn + Σalloc`,
      eff.totalGn,
      ownGnSum + hourSum,
      1e-9,
    );
  }
}

// Pencere kayması → sessiz kayıp GÖRÜNÜR olmalı (regresyon bekçisi).
// toplam_oransal'da tahsis tüm saatlere yayılır; fatura satırları bir saat
// eksik okunursa o saatin tahsisi faturaya girmez.
{
  const inp = buildPoolInput([
    { serno: 901, cn: [50, 50, 50], gn: [90, 0, 0] },
    { serno: 902, cn: [50, 50, 50] },
  ]);
  const out = allocateToplamOransal(inp);
  const b = out.perSerno.get(901)!;
  const series = inp.seriesBySerno.get(901)!;
  const full = [...series.entries()].map(([h, r]) => ({ ts: `${h}:00:00.000Z`, cn: r.cn, gn: r.gn }));
  // Pencere kayması: BAŞTAN bir saat eksik. toplam_oransal tahsisi tüm saatlere
  // yaydığı için hangi saat düşerse o saatin tahsisi faturaya girmez.
  const shifted = full.slice(1);
  const viewBase: FacilityAllocationView = {
    role: "assigned", priority: 1, allocByHour: b.allocByHour, allocTotal: b.allocTotal,
    excessTotal: 0, isSource: true, mode: "toplam_oransal", ownGnTotal: 0,
  };
  const okEff = applyAllocationToHourlyRows(full, viewBase);
  const badEff = applyAllocationToHourlyRows(shifted, viewBase);
  assertClose("pencere AYNI → fatura efektif gn = allocTotal", okEff.totalGn, b.allocTotal, 1e-9);
  // Kayıp FATURA tarafında (efektif gn) görünür; audit alanı allocatedKwh ise
  // view.allocTotal'ı aynen taşıdığı için DEĞİŞMEZ — yani sapma allocated_ges_kwh'a
  // bakarak YAKALANAMAZ. Bu yüzden aralık hizası kod düzeyinde garanti edilmeli
  // (gerçek yollarda startIso/endIso tek değişkenden hem fetch'e hem tahsise gider).
  const kayip = b.allocTotal - badEff.totalGn;
  assertTrue(
    `pencere KAYSA fatura tahsisi kaybeder (kayıp=${kayip.toFixed(2)} kWh)`,
    kayip > 1e-9,
  );
  assertClose(
    "kayıp audit alanında GÖRÜNMEZ (allocatedKwh sabit)",
    badEff.allocatedKwh,
    b.allocTotal,
    1e-9,
  );
}

// ════════════════════════════════════════════════════════════════
// S10) Metot 7 trafo kaybı t: kap(h) = cn(h) + t (satırı eksik saat dahil)
// ════════════════════════════════════════════════════════════════
// gesAllocation.computeGesAllocationUncached, t tanımlı listelenmiş tesisin
// serisini addTrafoKaybiToSeries ile dönüştürüp mod fonksiyonlarına verir.
// Mod matematiği DEĞİŞMEZ; t = 0 → seri aynı örnek → tahsis birebir.
console.log("\n── S10) Trafo kaybı t (Metot 7) — havuz kapasitesi ──");
{
  // 3 saat · havuz: A (gn 10/10/10, cn 2/4/–), B (cn 3/–/1). Saat 2'de A'nın,
  // saat 1'de B'nin satırı YOK. t_B = 1.
  const seriesA: HourlySeries = new Map([
    [hk(0), { cn: 2, gn: 10 }],
    [hk(1), { cn: 4, gn: 10 }],
    [hk(2), { cn: 0, gn: 10 }],
  ]);
  const seriesB: HourlySeries = new Map([
    [hk(0), { cn: 3, gn: 0 }],
    [hk(2), { cn: 1, gn: 0 }],
  ]);
  const keys = [hk(0), hk(1), hk(2)];
  const mk = (sB: HourlySeries): AllocModeInput => {
    const seriesBySerno = new Map<number, HourlySeries>([[1, seriesA], [2, sB]]);
    const assignments = [
      { subscription_serno: 1, priority: 1 },
      { subscription_serno: 2, priority: 2 },
    ];
    return {
      assignments,
      seriesBySerno,
      srcSeries: buildPoolSrcSeries({ assignments, seriesBySerno }),
      isSourceSerno: (s) => s === 1 || s === 2,
    };
  };
  const base = allocateSaatlikOransal(mk(seriesB));
  const same = allocateSaatlikOransal(mk(addTrafoKaybiToSeries(seriesB, 0, keys)));
  assertClose("t = 0 → B tahsisi birebir", allocOf(same, 2), allocOf(base, 2), 1e-12);
  assertClose("t = 0 → artan birebir", same.excessTotal, base.excessTotal, 1e-12);

  const withT = allocateSaatlikOransal(mk(addTrafoKaybiToSeries(seriesB, 1, keys)));
  // src her saatte 10 ≥ K → oran 1 → alloc = kap: B = (3+1) + (0+1) + (1+1) = 7
  assertClose("t = 1 → B tahsisi = Σ(cn + t) = 7", allocOf(withT, 2), 7, 1e-12);
  assertClose(
    "t = 1 → satırı eksik saat 1'de kap = t",
    withT.perSerno.get(2)!.allocByHour.get(hk(1)) ?? 0,
    1,
    1e-12,
  );
  assertClose("t = 1 → A etkilenmez", allocOf(withT, 1), allocOf(base, 1), 1e-12);
  assertClose("kimlik Σalloc + artan = havuz", sumAlloc(withT) + withT.excessTotal, withT.gesGnTotal, 1e-9);
  assertClose("havuz (src) t'den bağımsız", withT.gesGnTotal, base.gesGnTotal, 1e-12);
}

// ════════════════════════════════════════════════════════════════
// S6) TB-KARAR etiket sayımı (drift dedektörü)
// ════════════════════════════════════════════════════════════════
console.log("\n── S6) TB-KARAR: alici-kendi-ges etiket sayımı ──");

// Drift dedektörü: own_gn kuralının uygulandığı HER nokta etiketli olmalı.
// Beklenen minimumlar (kural uygulama noktaları + açıklama blokları):
//   gesAllocationModes.ts   : 7 → hourlyCapacity docblock + ownGn satırı +
//                             sirali + saatlik_oransal + toplam_oransal (T_i, S_i, yansıtma)
//   gesAllocation.ts        : 2 → delege yorumu (çapraz referans) + applyAllocationToHourlyRows
//   hourlyNetAggregates.ts  : 1 → computeHourlyNetAggregates (elle eşlenen kopya)
// Sayı DÜŞERSE bir kural noktası etiketsiz kalmış demektir (asıl risk bu yön).
const TAG = "TB-KARAR: alici-kendi-ges";
const tagFiles: Array<{ file: string; min: number }> = [
  { file: "src/components/utils/gesAllocationModes.ts", min: 7 },
  { file: "src/components/utils/gesAllocation.ts", min: 2 },
  { file: "src/components/utils/hourlyNetAggregates.ts", min: 1 },
];
let tagTotal = 0;
for (const { file, min } of tagFiles) {
  if (!existsSync(file)) {
    failures++;
    console.log(`  ❌ Dosya yok: ${file}`);
    continue;
  }
  const hits = readFileSync(file, "utf8").split(TAG).length - 1;
  tagTotal += hits;
  assertTrue(`${file}: ${hits} etiket (≥${min})`, hits >= min);
}
assertTrue(`toplam etiket ≥ 10 (gerçek: ${tagTotal})`, tagTotal >= 10);

// ════════════════════════════════════════════════════════════════
console.log(
  `\n${failures === 0 ? "✅ TÜM TESTLER GEÇTİ" : `❌ ${failures} TEST BAŞARISIZ`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
