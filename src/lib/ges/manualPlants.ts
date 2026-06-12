import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bir kullanıcının "manuel" sağlayıcıya bağlı GES tesislerinin id kümesini döner.
 *
 * Manuel tesis zinciri: ges_plants.credential_id → ges_credentials.provider_id →
 * ges_providers.name === 'manual'. Provider id HARDCODE edilmez; name='manual'
 * üzerinden çözülür (mevcut GesProductionUploadAdmin kalıbıyla aynı).
 *
 * Hata durumunda ASLA throw etmez — boş Set döner ki çağıran (dashboard vs.) kırılmasın.
 * RLS kullanıcının kendi ges_plants/ges_credentials satırlarını okumasına izin verir;
 * ges_providers public read'tir.
 */
export async function resolveManualPlantIds(
  supabase: SupabaseClient,
  uid: string,
): Promise<Set<string>> {
  try {
    // 1) 'manual' provider id
    const { data: prov, error: provErr } = await supabase
      .from("ges_providers")
      .select("id")
      .eq("name", "manual")
      .maybeSingle();

    if (provErr || !prov?.id) return new Set();
    const manualProviderId = prov.id as number;

    // 2) Kullanıcının aktif tesisleri
    const { data: plants, error: plantsErr } = await supabase
      .from("ges_plants")
      .select("id, credential_id")
      .eq("user_id", uid)
      .eq("is_active", true);

    if (plantsErr || !plants?.length) return new Set();

    const credIds = Array.from(
      new Set(
        (plants as { id: string; credential_id: string | null }[])
          .map((p) => p.credential_id)
          .filter((c): c is string => !!c),
      ),
    );
    if (!credIds.length) return new Set();

    // 3) İlgili credential'ların provider_id'leri
    const { data: creds, error: credsErr } = await supabase
      .from("ges_credentials")
      .select("id, provider_id")
      .in("id", credIds);

    if (credsErr || !creds?.length) return new Set();

    const manualCredIds = new Set(
      (creds as { id: string; provider_id: number }[])
        .filter((c) => c.provider_id === manualProviderId)
        .map((c) => c.id),
    );
    if (!manualCredIds.size) return new Set();

    // 4) Manuel credential'a bağlı plant id'leri
    const result = new Set<string>();
    for (const p of plants as { id: string; credential_id: string | null }[]) {
      if (p.credential_id && manualCredIds.has(p.credential_id)) result.add(p.id);
    }
    return result;
  } catch {
    return new Set();
  }
}
