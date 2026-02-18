// src/lib/btvToggle.ts
import { supabase } from "@/lib/supabase";

/**
 * Tesisin btv_enabled flag'ini owner_subscriptions tablosuna yazar.
 * update-then-insert pattern (subscriptionVisibility.ts ile ayni mantik).
 */
export async function setBtvEnabled(
  uid: string,
  serno: number,
  btvEnabled: boolean,
): Promise<void> {
  const { data: updData, error: updErr } = await supabase
    .from("owner_subscriptions")
    .update({ btv_enabled: btvEnabled })
    .eq("user_id", uid)
    .eq("subscription_serno", serno)
    .select("subscription_serno")
    .maybeSingle();

  if (updErr) throw updErr;

  if (!updData) {
    const { error: insErr } = await supabase
      .from("owner_subscriptions")
      .insert({
        user_id: uid,
        subscription_serno: serno,
        btv_enabled: btvEnabled,
      });

    if (insErr) throw insErr;
  }
}
