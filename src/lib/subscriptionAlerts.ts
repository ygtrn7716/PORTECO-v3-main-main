// src/lib/subscriptionAlerts.ts
import { supabase } from "@/lib/supabase";

/**
 * Tesisin alerts_enabled flag'ini DB'ye yazar.
 * update-then-insert pattern (subscriptionVisibility.ts ile ayni mantik).
 */
export async function setSubscriptionAlertsEnabled(
  uid: string,
  serno: number,
  enabled: boolean,
): Promise<void> {
  const { data: updData, error: updErr } = await supabase
    .from("subscription_settings")
    .update({ alerts_enabled: enabled })
    .eq("user_id", uid)
    .eq("subscription_serno", serno)
    .select("subscription_serno")
    .maybeSingle();

  if (updErr) throw updErr;

  if (!updData) {
    const { error: insErr } = await supabase
      .from("subscription_settings")
      .insert({
        user_id: uid,
        subscription_serno: serno,
        alerts_enabled: enabled,
      });

    if (insErr) throw insErr;
  }
}
