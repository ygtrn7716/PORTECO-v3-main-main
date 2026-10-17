// src/lib/ges/medasVerisKesinti.ts
//
// MEDAŞ usulü GES satış kartı kesintisi — Metot 1 "dağıtım kendi verişiyle"
// (subscription_settings.dagitim_kendi_veris).
//
// Bayraklı tesiste veriş, ayrı bir MEDAŞ faturasıyla (Sistem Kullanım Bedeli) kesilir:
// (G − C) × dagitim_uretici_1 (G = tesisin kendi ham verişi, C = ham çekiş + trafo).
// GES Üretim Satışı kartının dağıtım kesintisi bu durumda oran × satış kWh DEĞİL;
// satışın AKTIĞI karttaki (havuzda priority = minPriority tesis; havuz/atama yoksa
// tesisin kendisi) bayraklı katkıcıların MEDAŞ veriş faturaları TOPLAMIDIR.
//
// Kurallar:
//   • Host bayrağı false → null (eski oran kesintisi; bayraklı katkıcı varsa uyarı).
//   • Host minPriority değilse → boş kesinti (satış bu kartta değil).
//   • Katkıcılar: havuz modunda listedekiler; sirali modda listede olmayan kaynak da.
//   • Tutar: host → kendi breakdown'ı (çağıran verir). Diğerleri `prefer`'e göre:
//     "snapshot" → aynı tip/dönem snapshot'ının medas_veris_* damgası (yoksa CANLI);
//     "live" → ham Σcn/Σgn + trafo (resolveTrafoKwh) + uretici_1 → helper.
//   • Hata → çağıran yakalar ve GÖRÜNÜR gösterir (oran kesintisine sessizce düşmez).
// Çağıranlar yalnız breakdown.dagitimKendiVeris varken çağırır → diğer müşterilerde
// EK SORGU YOK. YAZMA YOK.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dayjsTR } from "@/lib/dayjs";
import { fetchAllConsumption } from "@/lib/paginatedFetch";
import { fetchGesMahsupContext, isPoolMode } from "@/components/utils/gesAllocation";
import { resolveTrafoKwh } from "@/components/utils/trafoKaybi";
import { hesaplaDagitimKendiVeris, roundHalfUp } from "@/components/utils/dagitimKendiVeris";
import type { MedasKesinti, MedasKesintiSatiri } from "@/lib/ges/gesUretimSatisi";

export type MedasHostKatki = { kwh: number; birim: number; bedeli: number };

/** Breakdown'daki dagitimKendiVeris bloğundan host katkısı (yoksa null). */
export function medasHostKatkiFromBreakdown(
  breakdown: { dagitimKendiVeris?: { medasKwh: number; medasBirim: number; medasBedeli: number } } | null | undefined
): MedasHostKatki | null {
  const kv = breakdown?.dagitimKendiVeris;
  return kv ? { kwh: kv.medasKwh, birim: kv.medasBirim, bedeli: kv.medasBedeli } : null;
}

type LoadParams = {
  supabase: SupabaseClient;
  userId: string;
  /** Satış kartının gösterildiği tesis. */
  hostSerno: number;
  periodYear: number;
  periodMonth: number;
  invoiceType?: "billed" | "backdated";
  /** Diğer katkıcıların tutar kaynağı: kartın kendi kaynağıyla aynı seçilir. */
  prefer: "live" | "snapshot";
  /** Host'un kendi MEDAŞ katkısı (breakdown'dan); null → host da yükleyiciden. */
  host: MedasHostKatki | null;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<MedasKesinti | null> }>();

export function clearMedasVerisKesintiCache(): void {
  cache.clear();
}

export function loadMedasVerisKesintisi(p: LoadParams): Promise<MedasKesinti | null> {
  const key = [
    p.userId,
    p.hostSerno,
    p.periodYear,
    p.periodMonth,
    p.invoiceType ?? "billed",
    p.prefer,
    p.host ? `${p.host.kwh}|${p.host.birim}|${p.host.bedeli}` : "-",
  ].join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = loadUncached(p);
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    const cur = cache.get(key);
    if (cur && cur.promise === promise) cache.delete(key);
  });
  return promise;
}

type SettingsRow = {
  subscription_serno: number;
  nickname: string | null;
  dagitim_kendi_veris: boolean | null;
  trafo_degeri: number | null;
  trafo_kaybi_saatlik: number | null;
  invoice_method_override: number | null;
  terim: string | null;
  gerilim: string | null;
  tarife: string | null;
};

async function loadUncached(p: LoadParams): Promise<MedasKesinti | null> {
  const { supabase, userId, hostSerno, periodYear, periodMonth } = p;
  const invoiceType = p.invoiceType ?? "billed";

  // ── Katkıcılar (gesAllocation.ts minPriority kuralının aynası)
  const ctx = await fetchGesMahsupContext(supabase, userId);
  let members: number[] = [hostSerno];
  const plantId = ctx.assignedSernos.get(hostSerno);
  if (plantId) {
    const list = ctx.byPlant.get(plantId) ?? [];
    const minPriority = list.reduce((m, a) => Math.min(m, a.priority), Infinity);
    const hostPriority = list.find((a) => a.subscription_serno === hostSerno)?.priority;
    if (hostPriority !== minPriority) return { tutar: 0, satirlar: [] };
    members = list.map((a) => a.subscription_serno);
    const mode = ctx.plantMode.get(plantId) ?? "sirali";
    const src = ctx.plantSourceSerno.get(plantId);
    if (!isPoolMode(mode) && src != null && !members.includes(src)) members.push(src);
  }

  // ── Ayarlar (bayrak + trafo + tarife)
  const { data: sRows, error: sErr } = await supabase
    .from("subscription_settings")
    .select(
      "subscription_serno, nickname, dagitim_kendi_veris, trafo_degeri, trafo_kaybi_saatlik, invoice_method_override, terim, gerilim, tarife"
    )
    .eq("user_id", userId)
    .in("subscription_serno", members);
  if (sErr) throw sErr;
  const settings = new Map<number, SettingsRow>();
  for (const r of (sRows ?? []) as SettingsRow[]) settings.set(Number(r.subscription_serno), r);

  const flagged = members.filter((s) => settings.get(s)?.dagitim_kendi_veris === true);
  if (settings.get(hostSerno)?.dagitim_kendi_veris !== true) {
    if (flagged.length > 0) {
      console.warn(
        `medasVerisKesinti: satış kartı tesisi ${hostSerno} bayraksız ama katkıcılar bayraklı (${flagged.join(", ")}) — oran kesintisi uygulanıyor.`
      );
    }
    return null;
  }

  const uyarilar: string[] = [];
  const unflagged = members.filter((s) => !flagged.includes(s));
  if (unflagged.length > 0) {
    uyarilar.push(
      `Bayraksız katkıcı(lar) ${unflagged.join(", ")}: MEDAŞ usulü dışında — kesintiye eklenmedi.`
    );
  }

  const m = dayjsTR().date(1).year(periodYear).month(periodMonth - 1).startOf("month");
  const startIso = m.toDate().toISOString();
  const endIso = m.clone().add(1, "month").toDate().toISOString();

  const satirlar: MedasKesintiSatiri[] = [];
  for (const serno of flagged) {
    const s = settings.get(serno)!;
    const label = s.nickname?.trim() || `Tesis ${serno}`;
    let katki: MedasHostKatki | null = null;

    if (serno === hostSerno && p.host) {
      katki = p.host;
    } else {
      if (p.prefer === "snapshot") {
        const { data: snap, error: snapErr } = await supabase
          .from("invoice_snapshots")
          .select("dagitim_kendi_veris, medas_veris_kwh, medas_veris_birim, medas_veris_bedeli")
          .eq("user_id", userId)
          .eq("subscription_serno", serno)
          .eq("period_year", periodYear)
          .eq("period_month", periodMonth)
          .eq("invoice_type", invoiceType)
          .maybeSingle();
        if (snapErr) throw snapErr;
        if (snap?.dagitim_kendi_veris === true && snap.medas_veris_bedeli != null) {
          katki = {
            kwh: Number(snap.medas_veris_kwh ?? 0),
            birim: Number(snap.medas_veris_birim ?? 0),
            bedeli: Number(snap.medas_veris_bedeli),
          };
        }
      }
      if (!katki) katki = await liveKatki({ supabase, userId, serno, s, startIso, endIso });
    }

    if (katki.bedeli > 0 || katki.kwh > 0) {
      satirlar.push({ serno, label, kwh: katki.kwh, birim: katki.birim, bedeli: katki.bedeli });
    }
  }

  const tutar = roundHalfUp(
    satirlar.reduce((sum, r) => sum + r.bedeli, 0),
    2
  );
  return { tutar, satirlar, ...(uyarilar.length > 0 ? { uyarilar } : {}) };
}

/** Katkıcının canlı MEDAŞ tutarı: ham Σcn + trafo (C), ham Σgn (G), uretici_1.
 *  Metot 7 (abonelik override'ı 7): aylık trafo_degeri KULLANILMAZ — m7'nin C'si yalnız
 *  saatlik t'li (t × dönem saati); t yoksa trafo 0. */
async function liveKatki(a: {
  supabase: SupabaseClient;
  userId: string;
  serno: number;
  s: SettingsRow;
  startIso: string;
  endIso: string;
}): Promise<MedasHostKatki> {
  const { supabase, userId, serno, s, startIso, endIso } = a;
  const res = await fetchAllConsumption({
    supabase,
    userId,
    subscriptionSerno: serno,
    columns: "ts, cn, gn",
    startIso,
    endIso,
  });
  if (res.error) throw res.error;
  let sumCn = 0;
  let sumGn = 0;
  let lastTs: string | null = null;
  let lastMs = -Infinity;
  for (const row of (res.data ?? []) as Array<{ ts: string; cn?: unknown; gn?: unknown }>) {
    sumCn += Number(row.cn) || 0;
    sumGn += Number(row.gn) || 0;
    const ms = new Date(row.ts).getTime();
    if (ms > lastMs) {
      lastMs = ms;
      lastTs = row.ts;
    }
  }
  const trafo = resolveTrafoKwh({
    trafoKaybiSaatlik: s.trafo_kaybi_saatlik,
    trafoDegeri: Number(s.invoice_method_override) === 7 ? null : s.trafo_degeri,
    startIso,
    endIso,
    lastTs,
    nowMs: Date.now(),
  });

  if (!s.terim || !s.gerilim || !s.tarife) {
    throw new Error(`MEDAŞ veriş kesintisi: tesis ${serno} terim/gerilim/tarife eksik.`);
  }
  const { data: t, error: tErr } = await supabase
    .from("distribution_tariff_official")
    .select("dagitim_bedeli, dagitim_uretici_1")
    .eq("terim", s.terim)
    .eq("gerilim", s.gerilim)
    .eq("tarife", s.tarife)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!t) throw new Error(`MEDAŞ veriş kesintisi: tesis ${serno} için tarife bulunamadı.`);

  const kv = hesaplaDagitimKendiVeris({
    cKwh: sumCn + (trafo.trafoKwh > 0 ? trafo.trafoKwh : 0),
    gKwh: sumGn,
    dagitimBedeli: Number(t.dagitim_bedeli ?? 0),
    ureticiBirim: Number(t.dagitim_uretici_1 ?? 0),
  });
  return { kwh: kv.medasKwh, birim: kv.medasBirim, bedeli: kv.medasBedeli };
}

/** Çağıran sarmalayıcısı: hata GÖRÜNÜR (tutar 0 + hata metni) — oran kesintisine düşmez. */
export async function loadMedasVerisKesintisiSafe(p: LoadParams): Promise<MedasKesinti | null> {
  try {
    return await loadMedasVerisKesintisi(p);
  } catch (e: unknown) {
    console.error("MEDAŞ veriş kesintisi hesaplanamadı:", e);
    return {
      tutar: 0,
      satirlar: [],
      hata: `MEDAŞ veriş kesintisi hesaplanamadı (${e instanceof Error ? e.message : "bilinmeyen hata"}) — kesinti uygulanmadan gösteriliyor.`,
    };
  }
}
