// src/lib/paginatedFetch.ts
//
// PostgREST max_rows (varsayılan 1000) limitini aşan sorgular için
// otomatik pagination utility'leri.
// Referans: exportConsumptionXlsx.ts'deki mevcut pagination pattern.

import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE = 1000;

/**
 * consumption_hourly tablosundan paginated şekilde tüm satırları çeker.
 * PostgREST max_rows limiti sonuçları sessizce kesmesin diye .range() kullanır.
 */
export async function fetchAllConsumption(params: {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  columns?: string;
  startIso: string;
  endIso: string;
  endInclusive?: boolean; // true → lte, false → lt (varsayılan: false)
}): Promise<{ data: any[]; error: any }> {
  const {
    supabase,
    userId,
    subscriptionSerno,
    columns = "ts, cn",
    startIso,
    endIso,
    endInclusive = false,
  } = params;

  const all: any[] = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from("consumption_hourly")
      .select(columns)
      .eq("user_id", userId)
      .eq("subscription_serno", subscriptionSerno)
      .gte("ts", startIso);

    q = endInclusive ? q.lte("ts", endIso) : q.lt("ts", endIso);

    const { data, error } = await q
      .order("ts", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) return { data: all, error };

    const batch = data ?? [];
    all.push(...batch);

    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return { data: all, error: null };
}

/**
 * consumption_hourly tablosundan user_id filtresi OLMADAN paginated çeker.
 * AdminHome gibi admin sayfaları için (RLS admin policy kullanır).
 */
export async function fetchAllConsumptionAdmin(params: {
  supabase: SupabaseClient;
  columns?: string;
  startIso: string;
  endIso: string;
}): Promise<{ data: any[]; error: any }> {
  const {
    supabase,
    columns = "subscription_serno, cn, ri, rc",
    startIso,
    endIso,
  } = params;

  const all: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("consumption_hourly")
      .select(columns)
      .gte("ts", startIso)
      .lt("ts", endIso)
      .order("ts", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) return { data: all, error };

    const batch = data ?? [];
    all.push(...batch);

    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return { data: all, error: null };
}

/**
 * epias_ptf_hourly tablosundan paginated şekilde tüm satırları çeker.
 * PTF global market data olduğu için user filtresi yoktur.
 */
export async function fetchAllPtf(params: {
  supabase: SupabaseClient;
  columns?: string;
  startIso: string;
  endIso: string;
  endInclusive?: boolean;
}): Promise<{ data: any[]; error: any }> {
  const {
    supabase,
    columns = "ts, ptf_tl_mwh",
    startIso,
    endIso,
    endInclusive = false,
  } = params;

  const all: any[] = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from("epias_ptf_hourly")
      .select(columns)
      .gte("ts", startIso);

    q = endInclusive ? q.lte("ts", endIso) : q.lt("ts", endIso);

    const { data, error } = await q
      .order("ts", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) return { data: all, error };

    const batch = data ?? [];
    all.push(...batch);

    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return { data: all, error: null };
}
