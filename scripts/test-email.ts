// scripts/test-email.ts
// Kullanim: npx tsx scripts/test-email.ts ornek@email.com
import "dotenv/config";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM = process.env.RESEND_FROM ?? "";

const email = process.argv[2];
if (!email) {
  console.error("Kullanim: npx tsx scripts/test-email.ts ornek@email.com");
  process.exit(1);
}

async function main() {
  if (!RESEND_API_KEY || !RESEND_FROM) {
    console.error("HATA: RESEND_API_KEY veya RESEND_FROM .env dosyasinda tanimli degil.");
    process.exit(1);
  }

  console.log("Email gonderiliyor:", email);
  console.log("Gonderen:", RESEND_FROM);

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [email],
      subject: "PORTECO Test Email",
      text: "Bu bir PORTECO test emailidir. Email bildirim sistemi calisiyor.",
    }),
  });

  const body = await resp.text();

  console.log("Status:", resp.status);
  console.log("Response:", body);

  if (!resp.ok) {
    console.error("Email gonderilemedi!");
    process.exit(1);
  }

  console.log("Email basariyla gonderildi!");
}

main().catch((err) => {
  console.error("Hata:", err.message);
  process.exit(1);
});
