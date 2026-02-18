// src/lib/subscriptionVisibility.ts
import { supabase } from "@/lib/supabase";

const LS_SUB_KEY = "eco_selected_sub";

/**
 * is_hidden = true olan serno'lari Set<number> olarak dondurur.
 * Hata durumunda bos set doner (guvenli fallback — tum tesisler gorunur).
 */
export async function fetchHiddenSernos(uid: string): Promise<Set<number>> {
  const { data, error } = await supabase
    .from("subscription_settings")
    .select("subscription_serno")
    .eq("user_id", uid)
    .eq("is_hidden", true);

  if (error) {
    console.warn("fetchHiddenSernos error (falling back to show all):", error);
    return new Set();
  }

  const sernos = new Set<number>();
  for (const row of data ?? []) {
    const n = Number(row.subscription_serno);
    if (Number.isFinite(n)) sernos.add(n);
  }
  return sernos;
}

/**
 * Tesisin is_hidden flag'ini DB'ye yazar.
 * update-then-insert pattern (ProfilePage.saveNickname ile ayni mantik).
 */
export async function setSubscriptionHidden(
  uid: string,
  serno: number,
  isHidden: boolean,
): Promise<void> {
  const { data: updData, error: updErr } = await supabase
    .from("subscription_settings")
    .update({ is_hidden: isHidden })
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
        is_hidden: isHidden,
      });

    if (insErr) throw insErr;
  }
}

/**
 * Gorunur tesis listesinden secili tesisi belirler.
 * Secili tesis gizlenmisse ilk gorunur tesise duser, localStorage gunceller.
 */
export function resolveSelectedSub(
  visibleSernos: number[],
  currentSelected: number | null,
): number | null {
  if (visibleSernos.length === 0) {
    localStorage.removeItem(LS_SUB_KEY);
    return null;
  }

  if (currentSelected != null && visibleSernos.includes(currentSelected)) {
    localStorage.setItem(LS_SUB_KEY, String(currentSelected));
    return currentSelected;
  }

  const fallback = visibleSernos[0];
  localStorage.setItem(LS_SUB_KEY, String(fallback));
  return fallback;
}
