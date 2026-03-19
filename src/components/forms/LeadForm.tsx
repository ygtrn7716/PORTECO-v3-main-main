import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function LeadForm({
  featureSlug,
  featureTitle,
}: {
  featureSlug: string;
  featureTitle: string;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const emailOk = /.+@.+\..+/.test(form.email);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!form.firstName.trim()) {
      setResult({ ok: false, msg: "Ad alanı zorunludur." });
      return;
    }
    if (!form.phone.trim()) {
      setResult({ ok: false, msg: "Telefon alanı zorunludur." });
      return;
    }
    if (!emailOk) {
      setResult({ ok: false, msg: "Geçerli bir e-posta adresi girin." });
      return;
    }
    if (form.message.trim().length > 0 && form.message.trim().length < 10) {
      setResult({ ok: false, msg: "Mesaj en az 10 karakter olmalıdır." });
      return;
    }

    setSubmitting(true);
    try {
      const contactRecord = {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim() || null,
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: form.message.trim()
          ? `[${featureTitle}] ${form.message.trim()}`
          : `[${featureTitle}] Bilgi talebi`,
      };

      const { error } = await supabase
        .from("contact_messages")
        .insert(contactRecord);

      if (error) throw error;

      setResult({
        ok: true,
        msg: "Mesajınız başarıyla gönderildi. En kısa sürede size dönüş yapacağız.",
      });
      setForm({ firstName: "", lastName: "", email: "", phone: "", message: "" });

      // Edge Function ile SMS bildirim (fire-and-forget)
      supabase.functions
        .invoke("contact-notify", { body: { record: contactRecord } })
        .catch((err) => console.error("SMS notify failed:", err));
    } catch {
      setResult({
        ok: false,
        msg: "Mesaj gönderilemedi. Lütfen tekrar deneyin.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="iletisim-formu" className="mt-8">
      <div className="rounded-2xl border border-black/10 bg-white p-5 md:p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg md:text-xl font-semibold text-neutral-900">
            İletişime Geç
          </h2>
          <p className="text-neutral-600 text-sm mt-1">
            Aşağıdaki formu doldurun, ekibimiz en kısa sürede sizinle iletişime
            geçsin.
          </p>
        </div>

        {result?.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            {result.msg}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ad */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Ad *
              </label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={set("firstName")}
                placeholder="Adınız"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/40"
              />
            </div>

            {/* Soyad */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Soyad
              </label>
              <input
                type="text"
                value={form.lastName}
                onChange={set("lastName")}
                placeholder="Soyadınız"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/40"
              />
            </div>

            {/* E-posta */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                E-posta *
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={set("email")}
                placeholder="ornek@firma.com"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/40"
              />
              {!emailOk && form.email.length > 0 && (
                <p className="mt-1 text-xs text-red-600">
                  Geçerli bir e-posta girin.
                </p>
              )}
            </div>

            {/* Telefon */}
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Telefon *
              </label>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={set("phone")}
                placeholder="05xx xxx xx xx"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/40"
              />
            </div>

            {/* Mesaj */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-700">
                Mesajınız
              </label>
              <textarea
                value={form.message}
                onChange={set("message")}
                rows={4}
                placeholder="Kısaca belirtin (opsiyonel)"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/40"
              />
            </div>

            {/* Hata */}
            {result && !result.ok && (
              <div className="md:col-span-2">
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {result.msg}
                </div>
              </div>
            )}

            <div className="md:col-span-2 flex justify-end">
              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="bg-[#0A59E0] hover:bg-[#0A59E0]/90 text-white focus-visible:ring-2 focus-visible:ring-[#0A59E0]/30"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Gönderiliyor…
                  </>
                ) : (
                  "Gönder"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
