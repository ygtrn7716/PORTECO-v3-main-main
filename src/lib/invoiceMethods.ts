//src/lib/invoiceMethods.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/lib/supabase";
import { calculateInvoice } from "@/components/utils/calculateInvoice";
import type { InvoiceOverrides } from "@/components/utils/invoiceOverrides";
import {
  calculateInvoiceMethod2,
  calculateInvoiceMethod3,
  type InvoiceMethodInputs,
  type MethodInvoiceBreakdown,
  type MethodInvoiceInput,
} from "@/components/utils/calculateInvoiceNetMethods";

export type {
  InvoiceMethodInputs,
  MethodInvoiceBreakdown,
  MethodInvoiceInput,
} from "@/components/utils/calculateInvoiceNetMethods";

/**
 * Tedarik firması bazlı fatura hesaplama metodu çekirdeği (Aşama 2A).
 *
 * Metod kimliği DB'de yaşar: user_integrations.invoice_from → invoice_companies.method_id.
 * Tesis→entegrasyon eşleşmesi owner_subscriptions.provider ↔ user_integrations.provider
 * üzerinden yapılır (owner_subscriptions'ta integration_id yok).
 *
 * user_integrations'ta self-access RLS bilinçli olarak yok (aril_pass hassas);
 * normal kullanıcı kendi metod bilgisini get_my_billing_integrations RPC'sinden okur.
 * Admin başka kullanıcıya bakarken RPC işe yaramaz (auth.uid() admin'i döner;
 * bkz. billedInvoiceInputs.ts başındaki not) → admin bağlamında doğrudan sorgu.
 */

export type InvoiceMethodId = 1 | 2 | 3 | 4;
export const DEFAULT_INVOICE_METHOD: InvoiceMethodId = 1;

export type BillingIntegrationMethod = {
  invoiceFrom: string;
  methodId: InvoiceMethodId;
};

/** key = user_integrations.provider (birebir string: "sepas", "_manuel-uedas", "vhs_kayseri"...) */
export type InvoiceMethodMap = Map<string, BillingIntegrationMethod>;

export type ResolveInvoiceMethodsParams =
  | { context: "self"; userId: string; supabase?: SupabaseClient }
  | { context: "admin"; userId: string; supabase: SupabaseClient };

export function isInvoiceMethodId(v: unknown): v is InvoiceMethodId {
  return v === 1 || v === 2 || v === 3 || v === 4;
}

/** Snapshot/DB'den gelen metod değerini güvenle daraltır.
 *  null/undefined → 1 SESSİZ (eski kayıt = metod 1); diğer geçersizler → warn + 1. */
export function coerceInvoiceMethodId(v: unknown): InvoiceMethodId {
  if (v == null) return DEFAULT_INVOICE_METHOD;
  const n = Number(v);
  if (isInvoiceMethodId(n)) return n;
  console.warn(`invoiceMethods: geçersiz metod değeri (${String(v)}) — Metod 1 varsayılıyor.`);
  return DEFAULT_INVOICE_METHOD;
}

type IntegrationMethodRow = {
  provider: string | null;
  invoice_from: string | null;
  method_id: unknown;
};

function buildMethodMap(rows: IntegrationMethodRow[]): InvoiceMethodMap {
  const map: InvoiceMethodMap = new Map();
  for (const row of rows) {
    if (!row.provider || !row.invoice_from) continue;
    if (map.has(row.provider)) {
      // Aynı kullanıcıda aynı provider'lı birden fazla entegrasyon şu an beklenmiyor;
      // olursa ilk kayıt kullanılır.
      console.warn(
        `invoiceMethods: "${row.provider}" provider'ında birden fazla entegrasyon — ilk kayıt kullanılıyor.`
      );
      continue;
    }
    map.set(row.provider, {
      invoiceFrom: row.invoice_from,
      methodId: coerceInvoiceMethodId(row.method_id),
    });
  }
  return map;
}

async function resolveInvoiceMethodsUncached(
  params: ResolveInvoiceMethodsParams
): Promise<InvoiceMethodMap> {
  if (params.context === "admin") {
    // Admin RLS user_integrations'a zaten izinli; aril_user/aril_pass ASLA seçilmez.
    const { data, error } = await params.supabase
      .from("user_integrations")
      .select("provider, invoice_from, invoice_companies(method_id)")
      .eq("user_id", params.userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return buildMethodMap(
      (data ?? []).map((r) => {
        // PostgREST many-to-one embed nesne döner; tip çıkarımı dizi sanabildiği için iki şekli de karşıla.
        const ic = (r as { invoice_companies?: unknown }).invoice_companies;
        const methodId = Array.isArray(ic)
          ? (ic[0] as { method_id?: number } | undefined)?.method_id ?? null
          : (ic as { method_id?: number } | null)?.method_id ?? null;
        return {
          provider: (r.provider as string) ?? null,
          invoice_from: (r.invoice_from as string) ?? null,
          method_id: methodId,
        };
      })
    );
  }

  const client = params.supabase ?? defaultClient;
  const { data, error } = await client.rpc("get_my_billing_integrations");
  if (error) throw error;
  return buildMethodMap(
    ((data ?? []) as Array<{
      integration_id: string;
      provider: string | null;
      invoice_from: string | null;
      method_id: number | null;
    }>).map((r) => ({
      provider: r.provider,
      invoice_from: r.invoice_from,
      method_id: r.method_id,
    }))
  );
}

// (context|userId) başına tek hesap; eşzamanlı caller'lar Promise'i paylaşır.
const CACHE_TTL_MS = 5 * 60 * 1000;
const methodMapCache = new Map<string, { at: number; promise: Promise<InvoiceMethodMap> }>();

export function clearInvoiceMethodCache(): void {
  methodMapCache.clear();
}

/** Kullanıcının entegrasyonlarının provider → { invoiceFrom, methodId } haritasını çözer.
 *  ASLA reject etmez: hata durumunda boş harita döner (→ her tesis Metod 1'e düşer). */
export function resolveInvoiceMethods(
  params: ResolveInvoiceMethodsParams
): Promise<InvoiceMethodMap> {
  const key = `${params.context}:${params.userId}`;
  const hit = methodMapCache.get(key);
  const promise =
    hit && Date.now() - hit.at < CACHE_TTL_MS
      ? hit.promise
      : (() => {
          const p = resolveInvoiceMethodsUncached(params);
          methodMapCache.set(key, { at: Date.now(), promise: p });
          // Hata alan çözümleme TTL boyunca cache'te kalmasın — sonraki çağrı yeniden dener.
          p.catch(() => {
            const cur = methodMapCache.get(key);
            if (cur && cur.promise === p) methodMapCache.delete(key);
          });
          return p;
        })();

  return promise.catch((e) => {
    console.warn("invoiceMethods: metod çözümleme başarısız — Metod 1 varsayılıyor.", e);
    return new Map();
  });
}

/** Tesisin metodunu provider'ından çözer. Eşleşme yoksa Metod 1 + warn. */
export function methodForProvider(
  map: InvoiceMethodMap,
  provider: string | null | undefined
): { methodId: InvoiceMethodId; invoiceFrom: string | null } {
  if (!provider) {
    console.warn("invoiceMethods: tesiste provider yok — Metod 1 varsayılıyor.");
    return { methodId: DEFAULT_INVOICE_METHOD, invoiceFrom: null };
  }
  const hit = map.get(provider);
  if (!hit) {
    console.warn(
      `invoiceMethods: "${provider}" provider'ına karşılık entegrasyon yok — Metod 1 varsayılıyor.`
    );
    return { methodId: DEFAULT_INVOICE_METHOD, invoiceFrom: null };
  }
  return { methodId: hit.methodId, invoiceFrom: hit.invoiceFrom };
}

/**
 * Metod dispatcher'ı (Aşama 2B).
 *
 * Metod 1 → değişmemiş calculateInvoice (bit-identik).
 * Metod 2/3 → saatlik-net motorları. Bu motorlar `input.methodInputs` (veya
 * açık `methodInputs` argümanı) olmadan çalışamaz; gelmemişse UYARI basıp
 * Metod 1'e düşülür. Böylece boru hattı henüz bağlanmamış bir yüzey (örn.
 * bir what-if simülasyonu) çökmez, yalnızca eski davranışı sürdürür.
 */
export function calculateInvoiceForMethod(
  methodId: InvoiceMethodId,
  input: MethodInvoiceInput,
  overrides?: InvoiceOverrides | null,
  methodInputs?: InvoiceMethodInputs
): MethodInvoiceBreakdown {
  const mi = methodInputs ?? input.methodInputs;

  if (methodId === 2 || methodId === 3) {
    // Lisanslı satış: net motor (saatlik mahsuplaşma) bu senaryoyu desteklemiyor.
    // Metod 1 lisanslı semantiğini tam onurlandırıyor (mahsuplaşma kapalı, gross
    // dağıtım, verisMahsup=0, tüm üretim → fazla/satış) → Metod 1'e yönlendir.
    // Bugün tüm tesisler lisansli_satis=false olduğundan davranış byte-identik.
    if (input.lisansliSatis) {
      return calculateInvoice(input, overrides);
    }
    if (!mi) {
      console.warn(
        `invoiceMethods: Metod ${methodId} için saatlik-net girdileri (methodInputs) yok — Metod 1 ile hesaplanıyor.`
      );
      return calculateInvoice(input, overrides);
    }
    return methodId === 2
      ? calculateInvoiceMethod2(input, overrides, mi)
      : calculateInvoiceMethod3(input, overrides, mi);
  }

  if (methodId === 4) {
    // Metod 4 — GES'siz düz fatura (BKA Enerji). Metod 1 çekirdeği AYNEN; yalnız üretim
    // etkileri sıfırlanır → mahsup yok, dağıtım = D×(brüt+trafo), veriş mahsup satırı yok.
    // GES tahsisi BİLEREK yok sayılır (net alanlar undefined; ges_mahsup_assignments'a satır
    // eklense bile mahsup alınmaz). calculateInvoice'a dokunulmaz; canlı hesap + snapshot
    // replay bu daldan geçer. Net alanlar `0` DEĞİL `undefined` — dağıtım birim-fiyat gösterimi
    // temiz kalsın (mahsupBaz sıfır-bölme guard'ına düşmesin).
    return calculateInvoice(
      { ...input, totalProductionKwh: 0, netPositiveDrawKwh: undefined, netExcessFeedKwh: undefined },
      overrides
    );
  }

  return calculateInvoice(input, overrides);
}
