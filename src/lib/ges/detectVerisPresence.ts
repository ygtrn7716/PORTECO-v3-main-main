import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";

export type VerisPresence = {
  hasGesApi: boolean;
  hasVeris: boolean;
  snapshotError: PostgrestError | null;
  hourlyError: PostgrestError | null;
  gesPlantsError: PostgrestError | null;
};

/**
 * Kullanıcının GES görünürlüğünü user-level iki sinyalle tespit eder:
 *   • hasGesApi — aktif ges_plants kaydı var mı
 *   • hasVeris  — invoice_snapshots.veris_kwh > 0 (Seviye 1) VEYA
 *                 consumption_hourly.gn > 0 (Seviye 2 fallback — sadece
 *                 Seviye 1 boş VE error'suz döndüğünde çalışır)
 *
 * RPC error'ları return shape'inde exposed edilir; caller
 * logVerisPresenceErrors ile console.warn'a düşürmeli.
 */
export async function detectVerisPresence(
  supabase: SupabaseClient,
  userId: string,
): Promise<VerisPresence> {
  // DEBUG — geçici, PR öncesi temizlenecek
  console.log("[GES-detect] userId:", userId);

  const [plantsRes, snapRes] = await Promise.all([
    supabase
      .from("ges_plants")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1),
    supabase
      .from("invoice_snapshots")
      .select("user_id")
      .eq("user_id", userId)
      .gt("veris_kwh", 0)
      .limit(1),
  ]);

  console.log("[GES-detect] ges_plants result:", {
    data: plantsRes.data,
    error: plantsRes.error,
  });
  console.log("[GES-detect] invoice_snapshots result:", {
    data: snapRes.data,
    error: snapRes.error,
    count: snapRes.data?.length,
  });

  const hasGesApi = (plantsRes.data?.length ?? 0) > 0;
  const hasVerisFromSnapshot = (snapRes.data?.length ?? 0) > 0;

  // Seviye 2: Seviye 1 boş VE error'suz iken consumption_hourly fallback
  let hasVerisFromHourly = false;
  let hourlyError: PostgrestError | null = null;
  if (!hasVerisFromSnapshot && !snapRes.error) {
    const hourlyRes = await supabase
      .from("consumption_hourly")
      .select("subscription_serno")
      .eq("user_id", userId)
      .gt("gn", 0)
      .limit(1);

    console.log("[GES-detect] hourly fallback result:", {
      data: hourlyRes.data,
      error: hourlyRes.error,
    });

    hasVerisFromHourly = (hourlyRes.data?.length ?? 0) > 0;
    hourlyError = hourlyRes.error;
  }

  const result: VerisPresence = {
    hasGesApi,
    hasVeris: hasVerisFromSnapshot || hasVerisFromHourly,
    snapshotError: snapRes.error,
    hourlyError,
    gesPlantsError: plantsRes.error,
  };

  console.log("[GES-detect] final:", {
    hasGesApi: result.hasGesApi,
    hasVeris: result.hasVeris,
  });

  return result;
}

/** Error alanlarını console.warn'a düşürür (kalıcı — sessiz yutmayı önler). */
export function logVerisPresenceErrors(label: string, r: VerisPresence): void {
  if (r.gesPlantsError)
    console.warn(`[GES-detect][${label}] ges_plants query failed:`, r.gesPlantsError);
  if (r.snapshotError)
    console.warn(`[GES-detect][${label}] invoice_snapshots query failed:`, r.snapshotError);
  if (r.hourlyError)
    console.warn(`[GES-detect][${label}] consumption_hourly query failed:`, r.hourlyError);
}
