//src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON as string | undefined;

// Geçici debug: konsolda sadece var/yok yazsın (anahtarı göstermiyoruz)
if (!url || !anon) {
  console.error("[ENV CHECK] VITE_SUPABASE_URL?", !!url, " VITE_SUPABASE_ANON?", !!anon);
  throw new Error("Supabase env eksik. Kök klasöre .env koy ve dev server'ı yeniden başlat.");
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
