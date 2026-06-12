// supabase/functions/intake-notify/index.ts
// Yeni intake_forms kaydi gelince ekibe e-posta gonderir (Resend).
//
// Gerekli Supabase Secrets:
//   RESEND_API_KEY            (reactive-alerts ile ortak)
//   RESEND_FROM               (dogrulanmis ecoenerji.net.tr gonderici)
//   SB_URL / SUPABASE_URL
//   SB_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://ecoenerji.net.tr",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NOTIFY_EMAIL = "muratbahcivanci@ecoenerji.net.tr";

type TesisJSON = {
  tesis_no?: number;
  kbk?: number | null;
  terim?: string;
  tarife?: string;
  gerilim?: string;
};

type GesSaglayiciJSON = {
  saglayici?: string;
  saglayici_diger?: string;
  kullanici?: string;
  sifre?: string;
  tesis_sayisi?: number;
  lisansli_satis?: boolean;
  on_yil_ustu?: boolean;
  notlar?: string;
};

serve(async (req) => {
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

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";

    // Tüketim tesisi özeti
    const tesisler: TesisJSON[] = Array.isArray(record.tesisler) ? record.tesisler : [];
    const tesisOzet = tesisler.length
      ? tesisler
          .map(
            (t, i) =>
              `  #${i + 1}: ${t.terim || "-"} / ${t.tarife || "-"} / ${t.gerilim || "-"}`,
          )
          .join("\n")
      : "  —";

    // GES sağlayıcı bloğu (düz metin şifre)
    const gesList: GesSaglayiciJSON[] = Array.isArray(record.ges_saglayicilar)
      ? record.ges_saglayicilar
      : [];
    const gesBlok =
      record.has_ges && gesList.length
        ? "\n--- GES SAĞLAYICI BİLGİLERİ ---\n" +
          gesList
            .map((g, i) =>
              [
                `\nSağlayıcı #${i + 1}: ${g.saglayici || "-"}`,
                `  Kullanıcı:       ${g.kullanici || "-"}`,
                `  Şifre:           ${g.sifre || "-"}`,
                `  Tesis sayısı:    ${g.tesis_sayisi ?? "-"}`,
                `  Lisanslı satış:  ${g.lisansli_satis === undefined ? "-" : g.lisansli_satis ? "EVET" : "HAYIR"}`,
                `  10 yıl üstü:     ${g.on_yil_ustu === undefined ? "-" : g.on_yil_ustu ? "EVET (USD ile satış)" : "HAYIR"}`,
                g.notlar ? `  Not:             ${g.notlar}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            )
            .join("\n")
        : "";

    const subject = `PORTECO • Yeni Başvuru: ${record.firma_adi ?? ""}`.trim();
    const text = [
      "PORTECO - Yeni başvuru geldi.",
      "",
      `Ad Soyad:        ${record.ad_soyad ?? "-"}`,
      `Firma:           ${record.firma_adi ?? "-"}`,
      `Telefon:         ${record.telefon ?? "-"}`,
      "",
      "--- OSOS (TÜKETİM PORTALI) ---",
      `OSOS Kullanıcı:  ${record.osos_kullanici ?? "-"}`,
      `Tüketim Tesisi:  ${record.tesis_sayisi ?? 0} adet`,
      tesisOzet,
      "",
      "--- GES (ÜRETİM) ---",
      `GES var mı:       ${record.has_ges ? "EVET" : "HAYIR"}`,
      ...(record.has_ges
        ? [
            `Sağlayıcı say.:   ${record.ges_saglayici_sayisi ?? 0}`,
            `Toplam GES tesisi: ${record.ges_tesis_sayisi ?? 0}`,
          ]
        : []),
      gesBlok,
      "",
      "Admin paneli: https://ecoenerji.net.tr/dashboard/admin/tanimlama",
    ].join("\n");

    // Resend gönderim
    let status = "sent";
    let providerResp: unknown = null;
    let errorMsg: string | null = null;

    if (!RESEND_API_KEY || !RESEND_FROM) {
      status = "failed";
      errorMsg = "RESEND_API_KEY veya RESEND_FROM tanımlı değil.";
    } else {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [NOTIFY_EMAIL],
          subject,
          text,
        }),
      });
      const body = await resp.text();
      providerResp = body ? { raw: body } : null;
      if (!resp.ok) {
        status = "failed";
        errorMsg = body;
      }
    }

    console.log("intake-notify result:", status, errorMsg ?? "");

    // email_logs INSERT
    const SB_URL =
      Deno.env.get("SB_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
    const SB_KEY =
      Deno.env.get("SB_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    if (SB_URL && SB_KEY) {
      const sb = createClient(SB_URL, SB_KEY, {
        auth: { persistSession: false },
      });
      await sb.from("email_logs").insert({
        user_id: null,
        subscription_serno: null,
        email_address: NOTIFY_EMAIL,
        subject,
        message_body: text,
        message_type: "intake_form_notify",
        status,
        provider_response: providerResp,
        error_message: errorMsg,
      });
    }

    return new Response(
      JSON.stringify({ ok: status === "sent" }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("intake-notify error:", err);
    return new Response(
      JSON.stringify({ error: "İşlem sırasında bir hata oluştu." }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
