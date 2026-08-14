// src/components/dashboard/reports/fetchGesTasarrufAnalizi.ts
//
// GES Tasarruf Analizi raporunun veri katmanı.
//
// SADECE kayıtlı invoice_snapshots (billed + backdated) okunur; canlı
// fatura pipeline'ı ÇALIŞTIRILMAZ. Snapshot'ı olmayan aylar satır üretmez.
//
// DEDUP: aynı (tesis, yıl, ay) için hem billed hem backdated varsa BACKDATED
// kazanır, billed satırı atılır. (Geçmiş Faturalarım sayfası dedup yapmaz —
// iki kartı yan yana gösterir; raporda toplamların çift sayılmaması için
// tek satıra indirilir, geriye dönük satır Dönem hücresinde işaretlenir.)
//
// GES Olmasaydı değerleri MEVCUT calculateGesOlmasaydi() motorundan gelir;
// girdi seti SnapshotGesOlmasaydiCard'ın snapshot eşlemesinin birebir aynısıdır
// (dönemden bağımsız, dört dal korunur). Mevcut Fatura ise InvoiceHistory ile
// aynı kaynaktan: recomputeSnapshotTotalWithMahsup().
//
// SORGU BÜTÇESİ: motor her (tesis × ay) hücresi için içeride 0-4 (+1 fallback)
// sorgu atar (ges_plants, ges_production_hourly, M2/3 karşı-olgusal için
// consumption_hourly + epias_ptf_hourly). Bu yüzden:
//   • caller girdileri 5 batch sorguya indirilir (aşağıda),
//   • hücreler KESİNLİKLE sequential işlenir (paralel istek fırtınası yok),
//   • onProgress hücre (dönem) başına tıklar.

import { supabase } from "@/lib/supabase";
import {
  buildSnapshotBreakdown,
  methodInputsFromSnapshotRow,
  recomputeSnapshotTotalWithMahsup,
  INVOICE_SNAPSHOT_RECOMPUTE_FIELDS,
} from "@/components/utils/invoiceSnapshots";
import {
  fetchAllInvoiceOverridesForUser,
  overrideKey,
  type InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";
import { calculateGesOlmasaydi } from "@/components/utils/calculateGesOlmasaydi";
import { calculateGesUretimSatisi } from "@/lib/ges/gesUretimSatisi";
import { resolveGesSatisDagitimRate } from "@/lib/ges/gesSatisDagitimRate";
import { coerceInvoiceMethodId } from "@/lib/invoiceMethods";
import type { TariffType } from "@/components/utils/calculateInvoice";
import type {
  GesTasarrufAnaliziResult,
  GesTasarrufRow,
  TesisOption,
} from "./types";

const nOrNull = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type SettingsRow = {
  kbk: number | null;
  lisansli_satis: boolean | null;
  anlik_uretim_kullanimi: boolean | null;
};

export async function fetchGesTasarrufAnalizi(args: {
  uid: string;
  selectedTesisler: TesisOption[];
  year: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<GesTasarrufAnaliziResult> {
  const { uid, selectedTesisler, year, onProgress } = args;

  const sernos = selectedTesisler.map((t) => t.subscriptionSerNo);

  // ── Batch ön-çekim (5 sorgu) — hücre döngüsüne caller sorgusu taşınmaz ──

  // 1) Snapshot'lar: recompute alan listesi + motorun snapshot'a özgü girdileri
  // (unit_price_adjustment, allocated_ges_kwh, monthly_yekdem,
  // ges_satis_dagitim_bedeli listede yok).
  const { data: snapData, error: snapError } = await supabase
    .from("invoice_snapshots")
    .select(
      // period_year/period_month artık RECOMPUTE_FIELDS içinde (2K) — çift kolon olmasın.
      `subscription_serno, invoice_type, unit_price_adjustment, allocated_ges_kwh, monthly_yekdem, ges_satis_dagitim_bedeli, ${INVOICE_SNAPSHOT_RECOMPUTE_FIELDS}`,
    )
    .eq("user_id", uid)
    .in("invoice_type", ["billed", "backdated"])
    .eq("period_year", year)
    .in("subscription_serno", sernos);

  if (snapError) {
    throw new Error(`Fatura kayıtları alınamadı: ${snapError.message}`);
  }

  // Dedup: aynı (tesis, ay) için backdated kazanır — billed satırı atılır.
  // Kapılardan ÖNCE uygulanır: dönemi temsil eden kayıt backdated'dır; o kayıt
  // kapıya takılırsa (ör. Metod 4) dönem satırsız kalır, billed geri gelmez.
  const dedupedSnapData = (() => {
    const byPeriod = new Map<string, any>();
    for (const row of (snapData ?? []) as any[]) {
      const key = `${Number(row.subscription_serno)}:${Number(row.period_month)}`;
      const existing = byPeriod.get(key);
      if (!existing || (existing.invoice_type !== "backdated" && row.invoice_type === "backdated")) {
        byPeriod.set(key, row);
      }
    }
    return Array.from(byPeriod.values());
  })();

  // 2) Fatura kalem override'ları — fail-open: hata durumunda doğal toplamlar.
  const ovMap = await fetchAllInvoiceOverridesForUser({
    userId: uid,
    periodYear: year,
    subscriptionSernos: sernos,
  }).catch((e) => {
    console.error("invoice overrides load error (ges tasarruf):", e);
    return new Map<string, InvoiceOverrides>();
  });

  // 3) Tesis ayarları (kbk, lisanslı satış, anlık üretim kullanımı).
  const settingsMap = new Map<number, SettingsRow>();
  {
    const { data, error } = await supabase
      .from("subscription_settings")
      .select("subscription_serno, kbk, lisansli_satis, anlik_uretim_kullanimi")
      .eq("user_id", uid)
      .in("subscription_serno", sernos);
    if (error) {
      throw new Error(`Tesis ayarları alınamadı: ${error.message}`);
    }
    for (const s of (data ?? []) as any[]) {
      settingsMap.set(Number(s.subscription_serno), {
        kbk: s.kbk,
        lisansli_satis: s.lisansli_satis,
        anlik_uretim_kullanimi: s.anlik_uretim_kullanimi,
      });
    }
  }

  // 4) Kendi santrali olan tesisler (hasOwnPlants / mode seçimi).
  const ownPlantSernos = new Set<number>();
  {
    const { data, error } = await supabase
      .from("ges_plants")
      .select("linked_serno")
      .eq("user_id", uid)
      .eq("is_active", true)
      .in("linked_serno", sernos);
    if (error) {
      throw new Error(`GES santral bilgisi alınamadı: ${error.message}`);
    }
    for (const p of (data ?? []) as any[]) {
      const s = Number(p.linked_serno);
      if (Number.isFinite(s)) ownPlantSernos.add(s);
    }
  }

  // 5) YEKDEM: billed snapshot'larda monthly_yekdem her zaman NULL (yalnız
  // backdated damgalanır) → canlı subscription_yekdem yıl bazında tek sorgu.
  // Eksik değer 0 SAYILMAZ — o ayın motor hesabı yapılmaz (kart spec'i).
  const yekdemMap = new Map<string, number>();
  {
    const { data, error } = await supabase
      .from("subscription_yekdem")
      .select("subscription_serno, period_month, yekdem_value")
      .eq("user_id", uid)
      .eq("period_year", year)
      .in("subscription_serno", sernos);
    if (error) {
      console.error("subscription_yekdem load error (ges tasarruf):", error);
    }
    for (const yk of (data ?? []) as any[]) {
      const v = nOrNull(yk.yekdem_value);
      if (v !== null) {
        yekdemMap.set(`${Number(yk.subscription_serno)}:${Number(yk.period_month)}`, v);
      }
    }
  }

  // GES satış dağıtım oranı fallback'i (eski snapshot'larda donmuş oran yok)
  // serno başına en fazla 1 kez çözülür.
  const dagitimRateCache = new Map<number, number>();

  // ── Kapılar + sıralama: tesis (seçim sırası) → ay artan ──
  const orderIndex = new Map<number, number>();
  selectedTesisler.forEach((t, i) => orderIndex.set(t.subscriptionSerNo, i));

  const eligibleRows = dedupedSnapData
    .filter((row) => {
      const m = Number(row.period_month);
      if (!Number.isFinite(m) || m < 1 || m > 12) return false;
      // Metod 4 = GES'siz düz fatura → tasarruf kavramı yok, satır üretme
      // (SnapshotGesOlmasaydiCard aynası).
      if (coerceInvoiceMethodId(row.invoice_method) === 4) return false;
      // GES sinyali yok (kendi santrali yok + mahsup tahsisi yok) → satır yok.
      const serno = Number(row.subscription_serno);
      const allocated = nOrNull(row.allocated_ges_kwh);
      if (!ownPlantSernos.has(serno) && !((allocated ?? 0) > 0)) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = orderIndex.get(Number(a.subscription_serno)) ?? 0;
      const tb = orderIndex.get(Number(b.subscription_serno)) ?? 0;
      if (ta !== tb) return ta - tb;
      return Number(a.period_month) - Number(b.period_month);
    });

  if (eligibleRows.length === 0) {
    throw new Error(
      "Seçilen yıl için GES tasarrufu hesaplanabilir kayıtlı fatura bulunamadı.",
    );
  }

  const total = eligibleRows.length;
  let done = 0;
  onProgress?.(0, total);

  // ── Hücre döngüsü — SEQUENTIAL (motor içi sorgular hücre başına 0-4+) ──
  const rows: GesTasarrufRow[] = [];

  for (const row of eligibleRows) {
    const serno = Number(row.subscription_serno);
    const m = Number(row.period_month);
    const ov = ovMap.get(overrideKey(serno, year, m));
    const settings = settingsMap.get(serno) ?? null;
    const hasOwnPlants = ownPlantSernos.has(serno);
    const allocatedKwh = nOrNull(row.allocated_ges_kwh);

    // Mevcut Fatura — InvoiceHistory "Ödenecek" ile birebir (içte stored'a düşer).
    const mevcutFatura = recomputeSnapshotTotalWithMahsup(row, ov);

    let mahsupKwh: number | null = null;
    let satilanKwh: number | null = null;
    let satisNetGelirTl: number | null = null;
    let gesOlmasaydiTl: number | null = null;
    let tasarrufTl: number | null = null;
    let tasarrufPct: number | null = null;

    // Bir ayın hatası raporu öldürmez → o ayın motor sütunları "—" kalır.
    try {
      // Override-farkındalıklı replay (saf, sorgusuz).
      let breakdown: ReturnType<typeof buildSnapshotBreakdown> | null = null;
      try {
        breakdown = buildSnapshotBreakdown(row, ov);
      } catch (e) {
        console.error(`snapshot breakdown replay error (${serno}/${year}-${m}):`, e);
      }

      if (breakdown) {
        mahsupKwh = nOrNull(breakdown.verisMahsupKwh);
        satilanKwh = nOrNull(breakdown.verisFazlaKwh);
      }

      // Kart 2 — GES Üretim Satışı (InvoiceSnapshotDetail ile aynı zincir:
      // donmuş oran → yoksa canlı tarife fallback'i, serno başına 1 kez).
      const satisKwh = Number(breakdown?.verisFazlaKwh ?? 0);
      if (satisKwh > 0) {
        let rate: number;
        const stored = nOrNull(row.ges_satis_dagitim_bedeli);
        if (stored !== null) {
          rate = stored;
        } else if (dagitimRateCache.has(serno)) {
          rate = dagitimRateCache.get(serno)!;
        } else {
          rate = await resolveGesSatisDagitimRate({
            supabase,
            userId: uid,
            subscriptionSerno: serno,
            storedRate: null,
            lisansliSatis: row.lisansli_satis ?? settings?.lisansli_satis ?? null,
          });
          dagitimRateCache.set(serno, rate);
        }
        satisNetGelirTl = calculateGesUretimSatisi({
          satisKwh,
          onYil: row.on_yil ?? false,
          usdKur: Number(row.usd_kur ?? 0),
          perakendeEnerjiBedeli: Number(row.perakende_enerji_bedeli ?? 0),
          dagitimBedeli: rate,
        }).satisNetGelir;
      }

      // Efektif (override'lı) enerji birim fiyatı — InvoiceSnapshotDetail ile aynı.
      const upOverride = ov?.enerji?.unitPriceOverride;
      const effUnitPrice =
        upOverride != null && Number.isFinite(upOverride)
          ? Number(upOverride)
          : row.unit_price_energy != null
            ? Number(row.unit_price_energy)
            : null;

      // monthlyYekdem: snapshot damgası → canlı subscription_yekdem → eksikse hesap YOK.
      const monthlyYekdem =
        nOrNull(row.monthly_yekdem) ?? yekdemMap.get(`${serno}:${m}`) ?? null;

      if (breakdown && effUnitPrice != null && monthlyYekdem != null) {
        const kbkSnap = nOrNull(row.kbk);
        const kbkLive = settings?.kbk != null ? Number(settings.kbk) : null;
        const kbk = (kbkSnap ?? kbkLive ?? 1) || 1;

        const mode: "producer" | "receiver" =
          !hasOwnPlants && (allocatedKwh ?? 0) > 0 ? "receiver" : "producer";

        const result = await calculateGesOlmasaydi({
          supabase,
          userId: uid,
          subscriptionSerno: serno,
          periodYear: year,
          periodMonth: m,
          mode,
          // Bilinçli canlı okuma (SnapshotGesOlmasaydiCard ile aynı gerekçe):
          // fiziksel tesis özelliği; düzeltilirse geriye dönük düzelsin.
          anlikUretimKullanimi: settings?.anlik_uretim_kullanimi ?? null,
          mevcutFatura,
          mevcutBirimFiyat: effUnitPrice,
          mevcutTuketimKwh: Number(row.total_consumption_kwh) || 0,
          verisMahsupKwh: Number(breakdown.verisMahsupKwh) || 0,
          satisKwh,
          satisNetGelir: satisNetGelirTl ?? 0,
          yekdemMahsup: Number(row.yekdem_mahsup) || 0,
          digerDegerler: Number(row.diger_degerler) || 0,
          allocatedKwh,
          monthlyYekdem,
          kbk,
          unitPriceAdjustment: Number(row.unit_price_adjustment) || 0,
          unitPriceDistribution: Number(row.unit_price_distribution) || 0,
          btvRate: Number(row.btv_rate) || 0,
          vatRate: Number(row.vat_rate) || 0,
          tariffType: ((row.tariff_type as TariffType) ?? "single"),
          contractPowerKw: Number(row.contract_power_kw) || 0,
          monthFinalDemandKw: Number(row.month_final_demand_kw) || 0,
          powerPrice: Number(row.power_price) || 0,
          powerExcessPrice: Number(row.power_excess_price) || 0,
          reactivePenaltyCharge: Number(breakdown.reactivePenaltyCharge) || 0,
          trafoDegeri: Number(row.trafo_degeri) || 0,
          onYil: row.on_yil ?? undefined,
          perakendeEnerjiBedeli: row.perakende_enerji_bedeli ?? undefined,
          // Snapshot-önce; lisanslı satış dalı erişilebilir kalır (GİZLENMEZ).
          lisansliSatis: row.lisansli_satis ?? settings?.lisansli_satis ?? false,
          invoiceMethodId: coerceInvoiceMethodId(row.invoice_method),
          methodInputs: methodInputsFromSnapshotRow(row) ?? null,
        });

        if (result) {
          gesOlmasaydiTl = result.gesOlmasaydiFatura;
          tasarrufTl = result.tasarruf;
          tasarrufPct = result.tasarrufYuzde;
        }
      }
    } catch (e) {
      console.error(`ges tasarruf cell error (${serno}/${year}-${m}):`, e);
    }

    rows.push({
      serno,
      month: m,
      backdated: row.invoice_type === "backdated",
      cekilenKwh: nOrNull(row.total_consumption_kwh),
      mahsupKwh,
      satilanKwh,
      mevcutFaturaTl: mevcutFatura,
      satisNetGelirTl,
      gesOlmasaydiTl,
      tasarrufTl,
      tasarrufPct,
    });

    done += 1;
    onProgress?.(done, total);
  }

  // Çıktıda satırı olan tesisler, seçim sırasıyla.
  const presentSernos = new Set(rows.map((r) => r.serno));
  const tesisler = selectedTesisler.filter((t) =>
    presentSernos.has(t.subscriptionSerNo),
  );

  return { year, tesisler, rows };
}
