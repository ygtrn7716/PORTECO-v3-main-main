// scripts/test-sms.ts
// Kullanim: npx tsx scripts/test-sms.ts +905XXXXXXXXX
import "dotenv/config";

const ILETIM_KEY = process.env.ILETIMERKEZI_KEY ?? "";
const ILETIM_HASH = process.env.ILETIMERKEZI_HASH ?? "";
const SMS_SENDER = process.env.SMS_SENDER ?? "ECOENERJI";

const phone = process.argv[2];
if (!phone) {
  console.error("Kullanim: npx tsx scripts/test-sms.ts +905XXXXXXXXX");
  process.exit(1);
}

const cleaned = phone.replace(/\D/g, "");
const text = "PORTECO test SMS mesajidir. Sistem calisiyor.";

const url = new URL("https://api.iletimerkezi.com/v1/send-sms/get/");
url.searchParams.set("key", ILETIM_KEY);
url.searchParams.set("hash", ILETIM_HASH);
url.searchParams.set("text", text);
url.searchParams.set("receipents", cleaned);
url.searchParams.set("sender", SMS_SENDER);
url.searchParams.set("iys", "1");
url.searchParams.set("iysList", "BIREYSEL");

async function main() {
  console.log("SMS gonderiliyor:", cleaned);

  const resp = await fetch(url.toString(), { method: "GET" });
  const body = await resp.text();

  console.log("Status:", resp.status);
  console.log("Response:", body);
}

main().catch((err) => {
  console.error("Hata:", err.message);
  process.exit(1);
});
