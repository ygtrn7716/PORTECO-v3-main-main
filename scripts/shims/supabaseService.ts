// scripts/shims/supabaseService.ts
//
// SALT-OKUNUR harness istemcisi. scripts/tsconfig.harness.json, "@/lib/supabase"
// importunu bu dosyaya yönlendirir: src/lib/supabase.ts `import.meta.env` ister
// (tsx altında yok) ve anon anahtarla RLS'e takılır. Burada .env'deki
// VITE_SUPABASE_URL + SB_SERVICE_ROLE_KEY ile servis istemcisi kurulur
// (check-invoice-method-snapshots.ts deseni).
//
// ⚠️ Her yazma yolu KAPALI: insert/update/upsert/delete ve rpc çağrıları throw eder.
// Uygulama kodu (billedInvoiceInputs, hourlyNetAggregates, gesAllocation…) bu
// istemciyle çalıştırıldığında DB'ye hiçbir şey yazamaz.

import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SB_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("Harness: VITE_SUPABASE_URL ve SB_SERVICE_ROLE_KEY gerekli (.env).");
}

const raw = createClient(url, serviceKey, { auth: { persistSession: false } });

const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);

/** Sorgu zincirini (from → select → eq …) her adımda sarar; yazma metodu görünce durdurur. */
function guard<T extends object>(target: T, table: string): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === "string" && WRITE_METHODS.has(prop)) {
        return () => {
          throw new Error(`READ-ONLY harness: ${table}.${prop} engellendi.`);
        };
      }
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== "function" || prop === "then") {
        return typeof value === "function" ? value.bind(obj) : value;
      }
      return (...args: unknown[]) => {
        const out = (value as (...a: unknown[]) => unknown).apply(obj, args);
        return out !== null && typeof out === "object" ? guard(out as object, table) : out;
      };
    },
  });
}

export const supabase = new Proxy(raw, {
  get(obj, prop, receiver) {
    if (prop === "from") {
      return (table: string) => guard(obj.from(table), table);
    }
    if (prop === "rpc") {
      return (fn: string) => {
        throw new Error(`READ-ONLY harness: rpc(${fn}) engellendi.`);
      };
    }
    const value = Reflect.get(obj, prop, receiver);
    return typeof value === "function" ? value.bind(obj) : value;
  },
}) as SupabaseClient;
