// ===============================
// File: src/components/forms/LeadForm.tsx
// Mini "İletişime Geç" formu – Perakende Satış sayfasında kullanılacak
// ===============================

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function LeadForm({
  featureSlug,
  featureTitle,
  submitUrl = "/api/contact.php", // cPanel/public_html altında api/contact.php olacak
}: {
  featureSlug: string;
  featureTitle: string;
  submitUrl?: string;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [monthlyKwh, setMonthlyKwh] = useState<string>("");
  const [message, setMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | { ok: boolean; error?: string }>(null);

  const emailOk = /.+@.+\..+/.test(email);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !emailOk) {
      setDone({ ok: false, error: "Lütfen zorunlu alanları kontrol edin." });
      return;
    }

    setSubmitting(true);
    setDone(null);
    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: featureTitle,
          featureSlug,
          fullName,
          phone,
          email,
          monthlyKwh,
          message,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      setDone({ ok: !!data?.ok, error: data?.error });
      if (data?.ok) {
        setFullName("");
        setPhone("");
        setEmail("");
        setMonthlyKwh("");
        setMessage("");
      }
    } catch (err) {
      setDone({ ok: false, error: "Bağlantı hatası" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="iletisim-formu" className="mt-8">
      <div className="rounded-2xl border border-black/10 bg-white p-5 md:p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg md:text-xl font-semibold text-neutral-900">İletişime Geç</h2>
          <p className="text-neutral-600 text-sm mt-1">
            Aşağıdaki formu doldurun, ekibimiz en kısa sürede sizinle iletişime geçsin.
          </p>
        </div>

        {done?.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            Teşekkürler! Talebiniz bize ulaştı. En kısa sürede dönüş yapacağız.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* İsim Soyisim */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-neutral-700">İsim Soyisim *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Adınız Soyadınız"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>

            {/* Telefon */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-neutral-700">Telefon *</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xx xxx xx xx"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>

            {/* E‑posta */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-neutral-700">E‑posta *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@firma.com"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
              />
              {!emailOk && email.length > 0 && (
                <p className="mt-1 text-xs text-red-600">Geçerli bir e‑posta girin.</p>
              )}
            </div>

            {/* Aylık ort. tüketim */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-neutral-700">Aylık Ortalama Tüketim (kWh)</label>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={monthlyKwh}
                onChange={(e) => setMonthlyKwh(e.target.value)}
                placeholder="örn. 120000"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>

            {/* Not */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-700">Açıklamak istediğiniz başka bir şey</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Kısaca belirtin (opsiyonel)"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>

            {/* Hata */}
            {done && !done.ok && (
              <div className="md:col-span-2">
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {done.error || "Gönderim sırasında bir sorun oluştu."}
                </div>
              </div>
            )}

            <div className=" md:col-span-2 flex justify-end">
              <Button  type="submit" size="lg" disabled={submitting} className="bg-[#0A59E0] hover:bg-[#0A59E0]/90 text-white focus-visible:ring-2 focus-visible:ring-[#0A59E0]/30">
                {submitting ? "Gönderiliyor…" : "Gönder"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );

}

// ===============================
// PATCH: src/pages/FeatureDetail.tsx (ilgili kısım)
// – import ekleyin ve Perakende Satış sayfasında 2 karttan sonra formu gösterin
// ===============================
// import LeadForm from "@/components/forms/LeadForm"; // <— dosyanın tepesine ekleyin

// ... mevcut içerik render'ından sonra, CTA'dan ÖNCE şu blok:
// {feature.slug === "perakende-satis" && (
//   <LeadForm
//     featureSlug={feature.slug}
//     featureTitle={feature.title}
//     submitUrl="/api/contact.php" // cPanel'de /public_html/api/contact.php
//   />
// )}


// ===============================
// File (server): public_html/api/contact.php  (cPanel'de oluşturun)
// Basit mail() ile gönderim – SMTP/PHPMailer kuruluysa ona geçebilirsiniz
// ===============================
/*
<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST');

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

$fullName   = trim($data['fullName'] ?? '');
$phone      = trim($data['phone'] ?? '');
$email      = trim($data['email'] ?? '');
$monthlyKwh = trim($data['monthlyKwh'] ?? '');
$message    = trim($data['message'] ?? '');
$feature    = trim($data['feature'] ?? 'Genel Talep');

if ($fullName === '' || $phone === '' || $email === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing_fields']);
  exit;
}

$to = 'destek@SENIN-ALANADIN.com'; // TODO: kendi mail adresin
$subject = 'Yeni Talep – ' . $feature;
$body = "\n— Yeni Talep —\n" .
        "Özellik: $feature\n" .
        "İsim Soyisim: $fullName\n" .
        "Telefon: $phone\n" .
        "E-posta: $email\n" .
        "Aylık Tüketim (kWh): $monthlyKwh\n" .
        "Mesaj: $message\n" .
        "Tarih: " . date('Y-m-d H:i:s') . "\n";

$headers = 'From: no-reply@SENIN-ALANADIN.com' . "\r\n" .
           'Reply-To: ' . $email . "\r\n" .
           'Content-Type: text/plain; charset=UTF-8' . "\r\n";

$ok = @mail($to, $subject, $body, $headers);

echo json_encode(['ok' => (bool)$ok]);
?>
*/
