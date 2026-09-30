// src/components/utils/gesAllocationModes.ts
//
// Talep Birleştirme dağıtım modlarının SAF matematiği — üç mod, DB'siz.
//
// ⚠️ SIFIR IMPORT KURALI: bu dosya HİÇBİR ŞEY import etmez (`import type` bile).
// Sebep: scripts/check-ges-allocation-modes.ts bunu tsx ile RELATIVE path'ten
// yükler; gesAllocation.ts'in runtime `@/lib/paginatedFetch` import'u (satır 25)
// tsx altında çözülemez (hiçbir check:* script'inde tsconfig-paths kayıtlı değil).
// Bu dosyaya import eklemek kabul testini kırar. Tipler BURADA tanımlanır,
// gesAllocation.ts onları re-export eder.
//
// ── İKİ FARKLI MODEL ──────────────────────────────────────────────────────
// Bu dosya İKİ ayrı havuz modelini barındırır; hangisinin geçerli olduğunu
// caller (gesAllocation.ts) `srcSeries` + `isSourceSerno` girdilerini KURARKEN
// belirler. Matematik fonksiyonları modelden habersizdir.
//
//  A) TEK KAYNAK modeli — YALNIZ `sirali`
//     src(h)   = GES kaydının tek kaynak sayacının (source_serno ?? linked_serno) gn'i
//     kap_i(h) = max(0, cn_i(h) − own_gn_i(h))   ← alıcı önce KENDİ verişiyle netleşir
//     Kaynak sayaç listede değilse rolü "source": verişi dağıtıldığı için
//     kendi faturasında gn = 0 sayılır.
//
//  B) HAVUZ modeli — `saatlik_oransal` (Meram) ve `toplam_oransal` (Kayseri OSB)
//     src(h)   = Σ_{i ∈ liste} gn_i(h)           ← listedeki TÜM sayaçların verişi
//     kap_i(h) = cn_i(h)                          ← tüketim HAM girer (own_gn = 0)
//     Listedeki her tesis verişini havuza verdiği için kendi tüketiminden önce
//     netleşmez. GES kaydının kaynak sayacı YALNIZCA listedeyse havuza katılır;
//     listede değilse havuza girmez ve "source" rolü de ALMAZ (verişi
//     dağıtılmadığı için sıfırlanmamalı) → görünümü null.
//     Gerçek faturalarla doğrulandı (Meram: Niğde As Beton; Kayseri OSB: AYTEKS,
//     Ağustos 2026).
//
//  Havuz modeli `hourlyCapacity`'yi DEĞİŞTİRMEZ: caller `isSourceSerno`'yu
//  "listede mi?" yordamına bağlar, böylece own_gn = 0 kuralı zaten devreye girer
//  (aynı yordam applyAllocationToHourlyRows ve hourlyNetAggregates'te de geçerli).
//
// ── Mod formülleri ────────────────────────────────────────────────────────
// üretim saati: src(h) > 0
//
// 1) sirali — öncelik şelalesi (TEK KAYNAK):
//      remaining = src(h); öncelik sırasıyla alloc = min(remaining, kap_i(h))
// 2) saatlik_oransal — her üretim saatinde kapasite oranında (HAVUZ):
//      K(h) = Σ kap_i(h) ; r(h) = K(h)>0 ? min(1, src(h)/K(h)) : 0
//      alloc_i(h) = kap_i(h) × r(h)
// 3) toplam_oransal — pay oranı dönemin TOPLAM tüketimine göre (HAVUZ):
//      M   = Σ_{üretim saatleri} min(src(h), K(h))     (dağıtılacak toplam mahsup)
//      T_i = Σ_{dönemin TÜM saatleri} kap_i(h)         (pay tabanı VE emme sınırı)
//      → distributeCapped(M, T, caps = T), sonra saatlik yansıtma:
//        alloc_i(h) = kap_i(h) × (A_i / T_i)  —  dönemin TÜM saatlerinde
//      ⚠️ Emme sınırı ÜRETİM SAATİ çekişi (S_i) DEĞİL, dönemin tüm çekişi (T_i):
//      Kayseri OSB dağıtımda üretim saati sınırı uygulamıyor (105013200'ün üretim
//      saatlerindeki çekişi 522 kWh iken faturada 1.297 kWh mahsup görünüyor).
//      M ≤ Σ T_i olduğundan sınır pratikte bağlamaz; distributeCapped genel
//      fonksiyon olarak korunur (sınır bağlarsa kalan artana akar).
//
// TÜM modlarda aynı kalanlar: artanın minPriority tesisine aylık lump satış
// olarak yazılması (karar caller'da — getFacilityAllocation) ve öncelik sırasının
// oransal modlarda dağıtımı ETKİLEMEMESİ.
//
// Kimlik (üç modda): Σ src = Σ alloc + excess. excessTotal her modda RESIDUAL
// olarak hesaplanır (Σsrc − Σalloc), analitik formülle değil → kimlik float
// düzeyinde exact tutar.
//
// ── Mod 3'ün taşıyıcı değişmezi ───────────────────────────────────────────
// distributeCapped `A_i ≤ caps_i = T_i` garanti eder → `A_i/T_i ≤ 1` → saatlik
// yansıtma `alloc_i(h) = kap_i(h)·(A_i/T_i) ≤ kap_i(h) ≤ cn_i(h)` verir.
// Yani her saat `effGn_i(h) = own_gn + alloc ≤ cn_i(h)`: Mod 3 alıcı tesiste
// saat-içi fazla veriş ASLA yaratmaz, tüm satış excess lump'ından gelir.
// Bir saatte tesisler-arası `Σ_i alloc_i(h)` o saatin `src(h)`'ini AŞABİLİR
// (kimlik yalnız dönem toplamında tutar) — bu kasıtlıdır ve zararsızdır, çünkü
// downstream (applyAllocationToHourlyRows / computeHourlyNetAggregates) her
// zaman TEK tesis görür ve alloc'u src ile karşılaştıran bir kod yoktur.

export type TahsisModu = "sirali" | "saatlik_oransal" | "toplam_oransal";

/** Admin UI ve fatura bilgi notlarında gösterilen mod adları. */
export const TAHSIS_MODU_LABEL: Record<TahsisModu, string> = {
  sirali: "Sıralı",
  saatlik_oransal: "Saatlik oransal",
  toplam_oransal: "Toplam tüketim oransal",
};

/** DB'den/bilinmeyen kaynaktan gelen değeri güvenle daraltır.
 *  null / geçersiz / gelecekte eklenmiş bilinmeyen enum → "sirali" (mevcut davranış).
 *  Böylece hiçbir GES tahsisini kaybetmez, yalnız bugünkü algoritmaya düşer. */
export function coerceTahsisModu(v: unknown): TahsisModu {
  return v === "saatlik_oransal" || v === "toplam_oransal" ? v : "sirali";
}

/** Saatlik seri: hourKeyUtc ("YYYY-MM-DDTHH") → { cn, gn } */
export type HourlySeries = Map<string, { cn: number; gn: number }>;

/** Tahsis matematiğine yeten atama alt kümesi (id/user_id matematiğe girmez). */
export type AllocAssignmentInput = {
  subscription_serno: number;
  priority: number;
};

export type AllocModeInput = {
  /** priority ASC sıralı atamalar. `sirali` bu sırayı KULLANIR; oransal modlar kullanmaz. */
  assignments: AllocAssignmentInput[];
  /** serno → saatlik seri (kaynak serno da içinde olabilir). */
  seriesBySerno: Map<number, HourlySeries>;
  /** Üretim havuzunun serisi = seriesBySerno.get(sourceSerno) ?? new Map() */
  srcSeries: HourlySeries;
  /** serno HERHANGİ bir plantın kaynak sayacı mı? (ctx.sourceSernos.has ile aynı semantik) */
  isSourceSerno: (serno: number) => boolean;
};

export type AllocModeOutput = {
  perSerno: Map<number, { allocByHour: Map<string, number>; allocTotal: number }>;
  excessTotal: number;
  gesGnTotal: number;
};

// ── Ortak yardımcılar ─────────────────────────────────────────────────────

/**
 * Saatlik mahsup kapasitesi: max(0, cn − own_gn).
 *
 * TB-KARAR: alici-kendi-ges — Sıralı modda alıcı tesis bir havuzun kaynağı
 * değilse önce kendi verişiyle netleşir. Oransal (havuz) modda listedeki her
 * tesisin verişi havuza gider, tüketimi ham girer. İş kuralı değişebilir;
 * değişirse bu etiketli satırlar güncellenir.
 *
 * Mekanizma TEK: `own_gn`, `isSourceSerno(serno)` true ise 0 sayılır.
 *  • sirali  → isSourceSerno = "GES kaydının kaynak sayacı mı?" (ctx.sourceSernos)
 *  • oransal → isSourceSerno = "listede mi?" → listedeki HERKES için own_gn = 0,
 *              yani kap = cn (ham). Verişleri havuzda (srcSeries) toplandığı için
 *              burada bir daha düşülmeleri çift sayım olurdu.
 *
 * ⚠️ `Math.max(0, ...)` BİLEREK kullanılıyor, `cap > 0 ? cap : 0` DEĞİL: ikisi
 * NaN'da ayrışır (Math.max(0,NaN)=NaN → min(remaining,NaN)=NaN → alloc>0 false →
 * saat atlanır = bugünkü davranış; ternary NaN'ı sessizce 0'a çevirirdi).
 * Bu, sirali modunun bit-identikliği için gereklidir.
 */
export function hourlyCapacity(
  row: { cn: number; gn: number } | undefined,
  serno: number,
  isSourceSerno: (serno: number) => boolean
): number {
  if (!row) return 0; // satır yok → cn=0, own_gn=0 → 0 (mevcut davranışla eşdeğer)
  // TB-KARAR: alici-kendi-ges
  const ownGn = isSourceSerno(serno) ? 0 : row.gn;
  return Math.max(0, row.cn - ownGn);
}

function seedPerSerno(
  assignments: AllocAssignmentInput[]
): Map<number, { allocByHour: Map<string, number>; allocTotal: number }> {
  const perSerno = new Map<number, { allocByHour: Map<string, number>; allocTotal: number }>();
  for (const a of assignments) {
    perSerno.set(a.subscription_serno, { allocByHour: new Map(), allocTotal: 0 });
  }
  return perSerno;
}

/** Oransal modlar HAVUZ modelinde çalışır → bu modlarda tahsis motoru
 *  `isSourceSerno`'yu "listede mi?" olarak yorumlar. Tek doğruluk noktası:
 *  caller (gesAllocation.ts) ve testler aynı yordamı buradan alır. */
export function isPoolMode(mode: TahsisModu): boolean {
  return mode === "saatlik_oransal" || mode === "toplam_oransal";
}

/**
 * HAVUZ kaynağı: listedeki TÜM sayaçların saatlik verişlerinin toplamı.
 *   src(h) = Σ_{i ∈ liste} gn_i(h)   (distinct serno — duplicate atama çift saymaz)
 *
 * GES kaydının kaynak sayacı (source_serno ?? linked_serno) YALNIZCA listedeyse
 * havuza katılır; listede değilse buraya hiç girmez (caller onu fetch bile etmez).
 *
 * `cn` alanı 0 döner: bu seri yalnız `src(h).gn` için okunur (mod fonksiyonları
 * srcSeries'ten cn kullanmaz), tesis kapasiteleri seriesBySerno'dan gelir.
 */
export function buildPoolSrcSeries(p: {
  assignments: AllocAssignmentInput[];
  seriesBySerno: Map<number, HourlySeries>;
}): HourlySeries {
  const out: HourlySeries = new Map();
  for (const serno of distinctSernos(p.assignments)) {
    const series = p.seriesBySerno.get(serno);
    if (!series) continue;
    for (const [hour, row] of series) {
      const gn = Number.isFinite(row.gn) ? row.gn : 0;
      const prev = out.get(hour);
      if (prev) prev.gn += gn;
      else out.set(hour, { cn: 0, gn });
    }
  }
  return out;
}

/** Oransal modlar için distinct serno listesi (ilk görülme sırası korunur).
 *  Aynı serno birden fazla priority'de ise T/caps iki kez sayılmasın.
 *  `sirali` bunu KULLANMAZ — duplicate'leri bugünkü gibi aynen işler (bit-identiklik). */
function distinctSernos(assignments: AllocAssignmentInput[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const a of assignments) {
    if (!seen.has(a.subscription_serno)) {
      seen.add(a.subscription_serno);
      out.push(a.subscription_serno);
    }
  }
  return out;
}

// Float toleransı: kWh ölçeğinde (1e-9 kWh = 3.6 µJ) fiziksel olarak anlamsız,
// ~10^6 kWh üzerinde ~10^3 toplama sonrası birikmiş gürültünün üstünde.
const EPS = 1e-9;
// Her tur en az bir hedefi aktiften çıkarır → gerçek sınır atama sayısı; 64 bol pay.
const MAX_ITER = 64;

// ── Mod 1: sirali (öncelik şelalesi) ──────────────────────────────────────

/**
 * Mevcut davranış — gesAllocation.ts'teki şelale döngüsünün BİREBİR taşınması.
 * Çıktı bit düzeyinde eskisiyle aynıdır (aynı sıra, aynı guard'lar, aynı
 * Math.max/Math.min çağrıları, aynı toplama sırası).
 */
export function allocateSirali(input: AllocModeInput): AllocModeOutput {
  const { assignments, seriesBySerno, srcSeries, isSourceSerno } = input;

  const perSerno = seedPerSerno(assignments);
  let excessTotal = 0;
  let gesGnTotal = 0;

  for (const [hour, src] of srcSeries) {
    const srcGn = src.gn;
    if (!(srcGn > 0)) continue;
    gesGnTotal += srcGn;

    let remaining = srcGn;
    for (const a of assignments) {
      if (remaining <= 0) break;
      // TB-KARAR: alici-kendi-ges (kural hourlyCapacity içinde)
      const residual = hourlyCapacity(
        seriesBySerno.get(a.subscription_serno)?.get(hour),
        a.subscription_serno,
        isSourceSerno
      );
      const alloc = Math.min(remaining, residual);
      if (alloc > 0) {
        const bucket = perSerno.get(a.subscription_serno)!;
        bucket.allocByHour.set(hour, (bucket.allocByHour.get(hour) ?? 0) + alloc);
        bucket.allocTotal += alloc;
        remaining -= alloc;
      }
    }
    excessTotal += remaining;
  }

  return { perSerno, excessTotal, gesGnTotal };
}

// ── Mod 2: saatlik_oransal (Meram) ────────────────────────────────────────

/**
 * Her üretim saatinde kapasite oranında dağıtım. Öncelik sırası dağıtımı
 * etkilemez. r(h) = min(1, src/K) olduğundan K ≤ src iken herkes kapasitesini
 * tam alır, K > src iken kapasite oranında paylaşılır.
 */
export function allocateSaatlikOransal(input: AllocModeInput): AllocModeOutput {
  const { assignments, seriesBySerno, srcSeries, isSourceSerno } = input;

  const perSerno = seedPerSerno(assignments);
  const sernos = distinctSernos(assignments);
  let excessTotal = 0;
  let gesGnTotal = 0;

  for (const [hour, src] of srcSeries) {
    const srcGn = src.gn;
    if (!(srcGn > 0)) continue;
    gesGnTotal += srcGn;

    // 1. geçiş: K(h)
    const caps: number[] = [];
    let K = 0;
    for (const serno of sernos) {
      // TB-KARAR: alici-kendi-ges (kural hourlyCapacity içinde)
      const kap = hourlyCapacity(seriesBySerno.get(serno)?.get(hour), serno, isSourceSerno);
      caps.push(kap);
      K += kap;
    }

    const r = K > 0 ? Math.min(1, srcGn / K) : 0;

    // 2. geçiş: alloc_i(h) = kap_i(h) × r(h)
    let sumAlloc = 0;
    for (let i = 0; i < sernos.length; i++) {
      const alloc = caps[i] * r;
      if (alloc > 0) {
        const bucket = perSerno.get(sernos[i])!;
        bucket.allocByHour.set(hour, (bucket.allocByHour.get(hour) ?? 0) + alloc);
        bucket.allocTotal += alloc;
        sumAlloc += alloc;
      }
    }

    // Residual: kimliği float düzeyinde exact tutar (clamp YOK — r=1 sınırında
    // ~1e-12 negatif artık zararsızdır, clamp kimliği bozar).
    excessTotal += srcGn - sumAlloc;
  }

  return { perSerno, excessTotal, gesGnTotal };
}

// ── Mod 3: toplam_oransal (Kayseri) ───────────────────────────────────────

/**
 * Sınırlı orantısal dağıtım — M'yi `T` (pay tabanı) oranında böl, `caps`
 * sınırına takılanları sabitleyip kalanı diğerleri arasında yeniden dağıt.
 *
 * GENEL fonksiyon: pay tabanı ile sınır AYNI büyüklük olabilir (toplam_oransal
 * bugün `caps = T` geçiyor — üretim saati sınırı yok) ya da farklı olabilir
 * (`caps` bağımsız bir emme sınırı). İkisi aynıysa sınır pratikte bağlamaz.
 *
 * Döngü her turda en az bir hedefi aktiften çıkarır (takılan yoksa zaten biter),
 * dolayısıyla terminasyon garantilidir; MAX_ITER yalnız patolojik float durumu
 * için güvenlik ağıdır ve tetiklenirse THROW ETMEZ — biriken alloc ile çıkar,
 * dağıtılamayan `kalan` caller'da residual excess'e (satışa) akar.
 *
 * Ayrı export: spec'in doğrulama vektörleri (T=60/30/10, M=30 ...) bu fonksiyonu
 * seri kurmadan doğrudan test eder.
 */
export function distributeCapped(p: {
  M: number;
  /** serno → T_i (pay tabanı / dağıtım oranı) */
  T: Map<number, number>;
  /** serno → üst sınır (emme kapasitesi). `T` ile aynı map olabilir. */
  caps?: Map<number, number>;
  /** Geriye uyum adı — `caps` verilmezse bu kullanılır. */
  S?: Map<number, number>;
}): { alloc: Map<number, number>; kalan: number; iterations: number } {
  const caps = p.caps ?? p.S ?? p.T;
  const alloc = new Map<number, number>();

  // aktif = { i : caps_i > EPS }. `> EPS` (yalnız `> 0` değil) DOĞRULUK için
  // taşıyıcı: caps_i=1e-15 bir tesis aktif sayılırsa saatlik yansıtmada
  // ratio=A_i/1e-15 astronomik tahsis üretir.
  let aktif: number[] = [];
  for (const [serno, s] of caps) {
    alloc.set(serno, 0);
    if (s > EPS) aktif.push(serno);
  }

  let kalan = p.M;
  let iterations = 0;

  while (kalan > EPS && aktif.length > 0 && iterations < MAX_ITER) {
    iterations++;

    let Tsum = 0;
    for (const serno of aktif) Tsum += p.T.get(serno) ?? 0;
    if (!(Tsum > EPS)) break; // tüm T_i = 0 → dağıtılamaz, kalan excess'e

    const pay = new Map<number, number>();
    const takilanlar: number[] = [];
    for (const serno of aktif) {
      const payi = kalan * ((p.T.get(serno) ?? 0) / Tsum);
      pay.set(serno, payi);
      // `>= caps_i − EPS`: tam sınıra oturanlar AYNI turda yakalanır (spec vektör 3).
      if (alloc.get(serno)! + payi >= (caps.get(serno) ?? 0) - EPS) takilanlar.push(serno);
    }

    if (takilanlar.length === 0) {
      for (const serno of aktif) alloc.set(serno, alloc.get(serno)! + pay.get(serno)!);
      kalan = 0;
      break;
    }

    for (const serno of takilanlar) {
      const capI = caps.get(serno) ?? 0;
      kalan -= capI - alloc.get(serno)!;
      alloc.set(serno, capI);
    }
    aktif = aktif.filter((serno) => !takilanlar.includes(serno));
  }

  if (kalan < 0) kalan = 0; // float artığı
  return { alloc, kalan, iterations };
}

/**
 * Pay oranı dönemin TOPLAM tüketimine göre (Kayseri OSB — HAVUZ modeli).
 *
 * ⚠️ ÜRETİM SAATİ SINIRI YOK: emme sınırı üretim saatlerinin çekişi (eski S_i)
 * DEĞİL, dönemin tüm çekişi (T_i). Kayseri OSB faturası bunu doğruluyor —
 * 105013200'ün üretim saatlerindeki çekişi 522 kWh iken faturada 1.297 kWh
 * mahsup var. Bu yüzden pay tabanı ve emme sınırı AYNI büyüklüktür (T_i) ve
 * saatlik yansıtma dönemin TÜM saatlerine yapılır.
 */
export function allocateToplamOransal(input: AllocModeInput): AllocModeOutput {
  const { assignments, seriesBySerno, srcSeries, isSourceSerno } = input;

  const perSerno = seedPerSerno(assignments);
  const sernos = distinctSernos(assignments);

  // (a) T_i — dönemin TÜM saatleri. Hem PAY TABANI hem EMME SINIRI.
  // ⚠️ Her tesisin KENDİ serisinin anahtarları üzerinde dönülür. srcSeries
  // anahtarları üzerinden dönmek YANLIŞ olur: kaynak sayaçta satırı olmayan
  // saatlerin tüketim kapasitesi sessizce düşer ve T_i veri kalitesine bağlı
  // küçülür. Satırı olmayan saatte kap=0 olduğu için birleşim kurmak gereksiz.
  //
  // Saat anahtarlarını da topla: (d) yansıtması üretim saatleriyle SINIRLI
  // olmadığı için tesislerin saat kümelerinin BİRLEŞİMİ gerekir.
  const T = new Map<number, number>();
  const allHours = new Set<string>();
  for (const serno of sernos) {
    let t = 0;
    const series = seriesBySerno.get(serno);
    if (series) {
      for (const [hour, row] of series) {
        allHours.add(hour);
        // TB-KARAR: alici-kendi-ges (kural hourlyCapacity içinde) — bu çağrı kuralı
        // üretim-DIŞI saatlere de uygular. Havuz modelinde listedeki herkes için
        // own_gn=0 olduğundan katkı max(0,cn)'dir.
        t += hourlyCapacity(row, serno, isSourceSerno);
      }
    }
    // Mod 3 NaN'a Mod 1'den kırılgan (tek NaN Tsum'u → tüm pay'ları zehirler);
    // bu satır hatayı tesis düzeyinde izole eder.
    T.set(serno, Number.isFinite(t) ? t : 0);
  }

  // (b) M — dağıtılacak toplam mahsup; YALNIZ üretim saatlerinde oluşur.
  let M = 0;
  let gesGnTotal = 0;

  for (const [hour, src] of srcSeries) {
    const srcGn = src.gn;
    if (!(srcGn > 0)) continue;
    gesGnTotal += srcGn;

    let Kh = 0;
    for (const serno of sernos) {
      // TB-KARAR: alici-kendi-ges (kural hourlyCapacity içinde)
      Kh += hourlyCapacity(seriesBySerno.get(serno)?.get(hour), serno, isSourceSerno);
    }
    M += Math.min(srcGn, Kh);
  }

  // (c) sınırlı orantısal dağıtım — caps = T (üretim saati sınırı YOK).
  // M ≤ Σ T_i olduğundan sınır pratikte bağlamaz; bağlarsa kalan artana akar.
  const { alloc } = distributeCapped({ M, T, S: T });

  // (d) saatlik yansıtma: alloc_i(h) = kap_i(h) × (A_i / T_i), TÜM saatlerde.
  // A_i ≤ T_i ⇒ alloc_i(h) ≤ kap_i(h) değişmezi korunur.
  let allocSum = 0;
  for (const serno of sernos) {
    const Ti = T.get(serno)!;
    const Ai = alloc.get(serno) ?? 0;
    if (!(Ti > EPS) || !(Ai > 0)) continue; // çekiş yok / pay yok → tüm saatlerde 0
    const ratio = Ai / Ti;
    const bucket = perSerno.get(serno)!;
    for (const hour of allHours) {
      // TB-KARAR: alici-kendi-ges (kural hourlyCapacity içinde) — (a) ile AYNI kural
      // ve AYNI saat kümesi olmalı, aksi halde Σ_h kap_i(h)·(A_i/T_i) ≠ A_i.
      const kap = hourlyCapacity(seriesBySerno.get(serno)?.get(hour), serno, isSourceSerno);
      if (!(kap > 0)) continue;
      const ah = kap * ratio;
      bucket.allocByHour.set(hour, (bucket.allocByHour.get(hour) ?? 0) + ah);
      bucket.allocTotal += ah;
    }
    allocSum += bucket.allocTotal;
  }

  // Residual: dağıtılamayan `kalan` dahil → minPriority tesisinde satış olur.
  // allocTotal YANSITILAN saatlik değerlerin toplamı (A_i atanmış değil), böylece
  // audit (allocatedKwh) ile faturaya giren saatlik değerler float artığı kadar
  // bile ayrışmaz.
  const excessTotal = gesGnTotal - allocSum;

  return { perSerno, excessTotal, gesGnTotal };
}

// ── Dispatcher ────────────────────────────────────────────────────────────

/** Bilinmeyen mod → sirali (mevcut davranış): hiçbir GES tahsisini kaybetmez. */
export function allocateByMode(mode: TahsisModu, input: AllocModeInput): AllocModeOutput {
  switch (mode) {
    case "saatlik_oransal":
      return allocateSaatlikOransal(input);
    case "toplam_oransal":
      return allocateToplamOransal(input);
    case "sirali":
    default:
      return allocateSirali(input);
  }
}
