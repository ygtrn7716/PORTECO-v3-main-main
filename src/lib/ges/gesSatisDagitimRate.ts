// src/lib/ges/gesSatisDagitimRate.ts
//
// GES Üretim Satışı dağıtım kesinti oranı (TL/kWh) çözümü — TEK KAYNAK.
//
//  • Yeni snapshot'larda fatura kesilirken donmuş değer (ges_satis_dagitim_bedeli)
//    kullanılır → tarife sonradan değişse bile geçmiş kart sabit kalır.
//  • Eski snapshot'larda (null) subscription_settings + distribution_tariff_official
//    üzerinden canlı fallback yapılır: lisansli_satis'e göre dagitim_uretici_1/2.
//
// InvoiceSnapshotDetail ve GesSavingsSection bu helper'ı paylaşır.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveGesSatisDagitimRate(params: {
  supabase: SupabaseClient;
  userId: string;
  subscriptionSerno: number;
  /** Snapshot'ta donmuş oran (ges_satis_dagitim_bedeli). Sonlu sayıysa doğrudan döner. */
  storedRate?: number | null;
  /** Snapshot'taki lisansli_satis; null/undefined ise subscription_settings'ten okunur. */
  lisansliSatis?: boolean | null;
}): Promise<number> {
  const stored = params.storedRate;
  if (stored != null && Number.isFinite(Number(stored))) {
    return Number(stored);
  }

  try {
    const settingsRes = await params.supabase
      .from("subscription_settings")
      .select("terim, gerilim, tarife, lisansli_satis")
      .eq("user_id", params.userId)
      .eq("subscription_serno", params.subscriptionSerno)
      .maybeSingle();
    if (!settingsRes.data) return 0;

    const lisansliSatis =
      params.lisansliSatis ?? (settingsRes.data as any).lisansli_satis ?? false;

    const tariff = await params.supabase
      .from("distribution_tariff_official")
      .select("dagitim_uretici_1, dagitim_uretici_2")
      .eq("terim", settingsRes.data.terim)
      .eq("gerilim", settingsRes.data.gerilim)
      .eq("tarife", settingsRes.data.tarife)
      .maybeSingle();

    return lisansliSatis
      ? Number(tariff.data?.dagitim_uretici_1) || 0
      : Number(tariff.data?.dagitim_uretici_2) || 0;
  } catch {
    return 0;
  }
}
