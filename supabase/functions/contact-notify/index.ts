// supabase/functions/contact-notify/index.ts
// Yeni iletişim mesajı geldiğinde SMS bildirim gönderir.
//
// Gerekli Supabase Secrets (Dashboard > Edge Functions > Secrets):
//   ILETIMERKEZI_KEY
//   ILETIMERKEZI_HASH
//   SMS_SENDER (varsayılan: ECOENERJI)
//   SB_URL
//   SB_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://ecoenerji.net.tr",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NOTIFY_PHONE = "905550125527"; // Bildirim alacak numara (rakam only)

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { record } = await req.json();

    if (!record) {
      return new Response(JSON.stringify({ error: "No record" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- SMS Gönder (İleti Merkezi — GET endpoint, reactive-alerts ile aynı) ---
    const ILETIM_KEY = Deno.env.get("ILETIMERKEZI_KEY") ?? "";
    const ILETIM_HASH = Deno.env.get("ILETIMERKEZI_HASH") ?? "";
    const SMS_SENDER = Deno.env.get("SMS_SENDER") ?? "ECOENERJI";

    const smsText = [
      "PORTECO - Yeni iletisim mesaji!",
      "",
      `Ad: ${record.first_name} ${record.last_name || ""}`.trim(),
      `Tel: ${record.phone || "-"}`,
      `Email: ${record.email}`,
      `Mesaj: ${(record.message || "").substring(0, 120)}`,
      "",
      "Admin paneli kontrol edin.",
    ].join("\n");

    // reactive-alerts ile birebir aynı format
    const url = new URL("https://api.iletimerkezi.com/v1/send-sms/get/");
    url.searchParams.set("key", ILETIM_KEY);
    url.searchParams.set("hash", ILETIM_HASH);
    url.searchParams.set("text", smsText);
    url.searchParams.set("receipents", NOTIFY_PHONE);
    url.searchParams.set("sender", SMS_SENDER);
    url.searchParams.set("iys", "1");
    url.searchParams.set("iysList", "BIREYSEL");

    const smsRes = await fetch(url.toString(), { method: "GET" });
    const smsBody = await smsRes.text();

    console.log("SMS result:", smsBody);

    // --- SMS logunu kaydet ---
    const SB_URL = Deno.env.get("SB_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
    const SB_SERVICE_KEY =
      Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (SB_URL && SB_SERVICE_KEY) {
      const sb = createClient(SB_URL, SB_SERVICE_KEY, {
        auth: { persistSession: false },
      });
      await sb.from("sms_logs").insert({
        user_id: null,
        subscription_serno: null,
        phone_number: NOTIFY_PHONE,
        message_type: "contact_form_notify",
        message_body: smsText,
        status: smsRes.ok ? "sent" : "failed",
        provider_response: smsBody ? { raw: smsBody } : null,
        error_message: smsRes.ok ? null : smsBody,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, sms: smsRes.ok }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("contact-notify error:", err);
    return new Response(
      JSON.stringify({ error: "İşlem sırasında bir hata oluştu." }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
