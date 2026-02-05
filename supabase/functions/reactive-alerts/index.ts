// supabase/functions/reactive-alerts/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SB_URL")!;
const SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_TOKEN")!;

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";

const SMS_PROVIDER = (Deno.env.get("SMS_PROVIDER") ?? "iletimerkezi").toLowerCase();
const SMS_SENDER = Deno.env.get("SMS_SENDER") ?? "ECOENERJI";
const ILETIM_KEY = Deno.env.get("ILETIMERKEZI_KEY") ?? "";
const ILETIM_HASH = Deno.env.get("ILETIMERKEZI_HASH") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

/* ── Yardımcı fonksiyonlar ── */

function trYM(date = new Date()) {
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${y}-${m}`;
}

function pct(num: number, den: number) {
  if (!den || !Number.isFinite(den)) return 0;
  const v = (num / den) * 100;
  return Number.isFinite(v) ? v : 0;
}

type Level = "ok" | "warn" | "limit";

function levelFor(kind: "ri" | "rc", valuePct: number): Level {
  if (kind === "ri") {
    if (valuePct >= 20) return "limit";
    if (valuePct >= 18) return "warn";
    return "ok";
  }
  // rc — warn esigi %13, limit %15
  if (valuePct >= 15) return "limit";
  if (valuePct >= 13) return "warn";
  return "ok";
}

function msgText(params: {
  kind: "ri" | "rc";
  level: Level;
  meterSerial: string | null;
  title: string | null;
  valuePct: number;
}) {
  const prefix = `${params.meterSerial ?? ""} ${params.title ?? ""}`.trim();
  const kindName = params.kind === "ri" ? "Reaktif Induktif" : "Reaktif Kapasitif";

  if (params.level === "warn") {
    const thr = params.kind === "ri" ? 18 : 13;
    const lim = params.kind === "ri" ? 20 : 15;
    return `${prefix}: Dikkat! ${kindName} degeri %${thr} seviyesine ulasti (Su an: %${params.valuePct.toFixed(
      1
    )}). Sinira yaklastiniz. Limit: %${lim}.`;
  }

  if (params.level === "limit") {
    const lim = params.kind === "ri" ? 20 : 15;
    return `${prefix}: Uyari! ${kindName} degeri %${lim} limitini asti (Su an: %${params.valuePct.toFixed(
      1
    )}). Asimdasiniz, kullaniminizi kontrol altina alin.`;
  }

  return "";
}

/* ── SMS / Email gonderim ── */

async function sendEmail(to: string[], subject: string, text: string) {
  if (!RESEND_API_KEY || !RESEND_FROM) return;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, text }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Resend error: ${resp.status} ${err}`);
  }
}

async function sendSms(phone: string, text: string): Promise<string | null> {
  if (SMS_PROVIDER !== "iletimerkezi") return null;

  const cleaned = phone.replace(/\D/g, "");
  if (!cleaned) return null;

  const url = new URL("https://api.iletimerkezi.com/v1/send-sms/get/");
  url.searchParams.set("key", ILETIM_KEY);
  url.searchParams.set("hash", ILETIM_HASH);
  url.searchParams.set("text", text);
  url.searchParams.set("receipents", cleaned);
  url.searchParams.set("sender", SMS_SENDER);
  url.searchParams.set("iys", "1");
  url.searchParams.set("iysList", "BIREYSEL");

  const resp = await fetch(url.toString(), { method: "GET" });
  const body = await resp.text();

  if (!resp.ok) {
    throw new Error(`SMS error: ${resp.status} ${body}`);
  }

  return body; // provider response
}

/* ── SMS log yardimcisi ── */

async function logSms(params: {
  userId: string;
  subscriptionSerno: number;
  phoneNumber: string;
  messageType: string;
  messageBody: string;
  status: "sent" | "failed";
  providerResponse?: string | null;
  errorMessage?: string | null;
}) {
  await supabase.from("sms_logs").insert({
    user_id: params.userId,
    subscription_serno: String(params.subscriptionSerno),
    phone_number: params.phoneNumber,
    message_type: params.messageType,
    message_body: params.messageBody,
    status: params.status,
    provider_response: params.providerResponse ? { raw: params.providerResponse } : null,
    error_message: params.errorMessage ?? null,
  });
}

/* ── Ana handler ── */

serve(async (req) => {
  // cron guvenlik kontrolu
  if ((req.headers.get("x-cron-token") ?? "") !== CRON_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }

  const periodYM = trYM();

  // 1) butun kullanicilarin email listesi (user_integrations.aril_user)
  const { data: integRows, error: integErr } = await supabase
    .from("user_integrations")
    .select("user_id, aril_user")
    .not("aril_user", "is", null);

  if (integErr) {
    return new Response(`integrations error: ${integErr.message}`, { status: 500 });
  }

  const emailsByUser = new Map<string, string[]>();
  for (const r of integRows ?? []) {
    const uid = String((r as any).user_id);
    const mail = String((r as any).aril_user ?? "").trim();
    if (!mail.includes("@")) continue;
    const arr = emailsByUser.get(uid) ?? [];
    if (!arr.includes(mail)) arr.push(mail);
    emailsByUser.set(uid, arr);
  }

  // 2) her user icin tesisler + ay-to-date reaktif oranlar
  let sent = 0;
  const errors: string[] = [];

  for (const [userId, toEmails] of emailsByUser.entries()) {
    if (!toEmails.length) continue;

    // user_phone_numbers tablosundan aktif telefonlari al
    const { data: phoneRows } = await supabase
      .from("user_phone_numbers")
      .select("phone_number, receive_warnings, receive_alerts")
      .eq("user_id", userId)
      .eq("is_active", true);

    const phones = (phoneRows ?? []) as {
      phone_number: string;
      receive_warnings: boolean;
      receive_alerts: boolean;
    }[];

    const { data: subs, error: subsErr } = await supabase
      .from("owner_subscriptions")
      .select("subscription_serno, meter_serial, title")
      .eq("user_id", userId);

    if (subsErr || !subs?.length) continue;

    // RPC agregasyon
    const { data: mtdRows, error: mtdErr } = await supabase.rpc("reactive_mtd_totals", {
      p_user_id: userId,
    });

    if (mtdErr) {
      errors.push(`rpc error for ${userId}: ${mtdErr.message}`);
      continue;
    }

    const mtdMap = new Map<number, any>();
    for (const row of (mtdRows ?? []) as any[]) {
      mtdMap.set(Number(row.subscription_serno), row);
    }

    for (const s of subs as any[]) {
      const subNo = Number(s.subscription_serno);
      const meterSerial = s.meter_serial ?? null;
      const title = s.title ?? null;

      const row = mtdMap.get(subNo);
      const active = Number(row?.active_kwh ?? 0);
      const ri = Number(row?.ri_kvarh ?? 0);
      const rc = Number(row?.rc_kvarh ?? 0);

      if (!(active > 0)) continue;

      const riPct = pct(ri, active);
      const rcPct = pct(rc, active);

      for (const kind of ["ri", "rc"] as const) {
        const valuePct = kind === "ri" ? riPct : rcPct;
        const nextLevel = levelFor(kind, valuePct);

        // state oku
        const { data: st } = await supabase
          .from("reactive_alert_state")
          .select("status")
          .eq("user_id", userId)
          .eq("subscription_serno", subNo)
          .eq("kind", kind)
          .eq("period_ym", periodYM)
          .maybeSingle();

        const prevLevel = (st as any)?.status ?? "ok";

        const shouldSend =
          (nextLevel === "warn" && prevLevel === "ok") ||
          (nextLevel === "limit" && prevLevel !== "limit");

        // state upsert (her zaman guncelle)
        await supabase.from("reactive_alert_state").upsert(
          {
            user_id: userId,
            subscription_serno: subNo,
            kind,
            period_ym: periodYM,
            status: nextLevel,
            last_value_pct: valuePct,
            last_sent_at: shouldSend ? new Date().toISOString() : undefined,
          },
          { onConflict: "user_id,subscription_serno,kind,period_ym" }
        );

        if (!shouldSend || nextLevel === "ok") continue;

        const text = msgText({
          kind,
          level: nextLevel,
          meterSerial,
          title,
          valuePct,
        });

        const messageType =
          nextLevel === "warn" ? `reactive_${kind}_warn` : `reactive_${kind}_limit`;

        const subjectPrefix = `${meterSerial ?? ""} ${title ?? ""}`.trim();
        const subject =
          nextLevel === "warn"
            ? `${subjectPrefix} - Reaktif uyari: sinira yaklasiyor`
            : `${subjectPrefix} - Reaktif uyari: limit asildi`;

        // Email gonder
        try {
          if (toEmails.length) {
            await sendEmail(toEmails, subject, text);
            sent++;
          }
        } catch (e) {
          errors.push(`email error ${userId}: ${(e as Error).message}`);
        }

        // SMS gonder — her aktif telefon numarasina
        const targetPhones = phones.filter((p) =>
          nextLevel === "warn" ? p.receive_warnings : p.receive_alerts
        );

        for (const ph of targetPhones) {
          try {
            const providerResp = await sendSms(ph.phone_number, text);
            await logSms({
              userId,
              subscriptionSerno: subNo,
              phoneNumber: ph.phone_number,
              messageType,
              messageBody: text,
              status: "sent",
              providerResponse: providerResp,
            });
            sent++;
          } catch (e) {
            const errMsg = (e as Error).message;
            errors.push(`sms error ${userId} ${ph.phone_number}: ${errMsg}`);
            await logSms({
              userId,
              subscriptionSerno: subNo,
              phoneNumber: ph.phone_number,
              messageType,
              messageBody: text,
              status: "failed",
              errorMessage: errMsg,
            });
          }
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, sent, errors: errors.length ? errors : undefined }),
    { headers: { "Content-Type": "application/json" } }
  );
});
