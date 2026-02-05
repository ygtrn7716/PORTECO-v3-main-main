// src/components/sections/ContactUs.tsx
import { useState } from "react";
import Container from "@/components/layout/Container";
import { supabase } from "@/lib/supabase";
import { Phone, Mail, Send, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function ContactUs() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    if (!form.firstName.trim() || !form.email.trim()) {
      setResult({ ok: false, msg: "Ad ve e-posta alanlari zorunludur." });
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.from("contact_messages").insert({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim() || null,
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        message: form.message.trim() || null,
      });

      if (error) throw error;

      setResult({ ok: true, msg: "Mesajiniz basariyla gonderildi!" });
      setForm({ firstName: "", lastName: "", email: "", phone: "", message: "" });
    } catch {
      setResult({ ok: false, msg: "Gonderim sirasinda bir hata olustu. Lutfen tekrar deneyin." });
    } finally {
      setSending(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-white placeholder-white/40 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all";

  return (
    <section className="bg-transparent mb-4 md:mb-8">
      <Container className="pt-12 md:pt-16 pb-8">
        {/* Title */}
        <motion.div
          className="text-center max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-neutral-900">Iletisime Gec</h2>
          <p className="mt-3 text-neutral-600">
            Hizmetlerimizden yararlanmak ve detaylari dinlemek icin asagidan
            iletisime gecmeyi unutmayin!
          </p>
        </motion.div>

        {/* Wrapper */}
        <motion.div
          id="contact-wrap"
          className="mt-12 relative isolate transform-gpu will-change-transform rounded-3xl overflow-hidden bg-gradient-to-br from-[#0B1C33] via-[#0A2A5E] to-[#061023] p-4 sm:p-5 md:p-6 ring-1 ring-white/10 shadow-[0_20px_60px_rgba(10,41,94,0.35)]"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Left: contact cards */}
            <div className="space-y-4 sm:space-y-5 p-2 sm:p-3 md:p-4">
              {[
                {
                  label: "Telefon",
                  value: "+90 555 200 3300 - Murat Bahcivanci",
                  href: "tel:+905552003300",
                  icon: <Phone className="h-5 w-5" />,
                },
                {
                  label: "Email",
                  value: "muratbahcivanci@ecoenerji.net.tr",
                  href: "mailto:muratbahcivanci@ecoenerji.net.tr",
                  icon: <Mail className="h-5 w-5" />,
                },
              ].map((c) => (
                <a
                  key={c.label}
                  href={c.href}
                  className="flex items-start gap-3 rounded-2xl bg-white/[0.08] p-4 sm:p-5 border border-white/10 transition-all duration-300 hover:bg-white/[0.12] hover:border-white/20 hover:shadow-lg hover:shadow-white/5 group"
                >
                  <span className="shrink-0 inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-white/10 text-white group-hover:bg-[#0A66FF]/30 transition-colors duration-300">
                    {c.icon}
                  </span>
                  <div className="text-white/90 min-w-0">
                    <div className="text-sm opacity-70">{c.label}</div>
                    <div className="font-medium break-words">{c.value}</div>
                  </div>
                </a>
              ))}
            </div>

            {/* Right: form */}
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5 md:p-6 backdrop-blur-sm"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/70 mb-1">Ad *</label>
                  <input
                    className={inputClass}
                    placeholder="Adiniz"
                    value={form.firstName}
                    onChange={set("firstName")}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Soyad</label>
                  <input
                    className={inputClass}
                    placeholder="Soyadiniz"
                    value={form.lastName}
                    onChange={set("lastName")}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs text-white/70 mb-1">E-mail Adresi *</label>
                <input
                  type="email"
                  inputMode="email"
                  className={inputClass}
                  placeholder="email@adresi.com"
                  value={form.email}
                  onChange={set("email")}
                  required
                />
              </div>

              <div className="mt-4">
                <label className="block text-xs text-white/70 mb-1">Telefon Numarasi</label>
                <input
                  type="tel"
                  inputMode="tel"
                  className={inputClass}
                  placeholder="(555) 123-4567"
                  value={form.phone}
                  onChange={set("phone")}
                />
              </div>

              <div className="mt-4">
                <label className="block text-xs text-white/70 mb-1">Mesajiniz</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder="Mesajinizi buraya yazin..."
                  value={form.message}
                  onChange={set("message")}
                />
              </div>

              {result && (
                <div
                  className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                    result.ok
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-red-500/20 text-red-300 border border-red-500/30"
                  }`}
                >
                  {result.msg}
                </div>
              )}

              <button
                type="submit"
                disabled={sending}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0A66FF] px-4 py-3 text-sm sm:text-base font-medium text-white hover:bg-[#0a59e0] transition-all duration-200 shadow-[0_6px_20px_rgba(10,102,255,0.35)] disabled:opacity-60 active:scale-[0.98]"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Gonderiliyor..." : "Mesaj Gonder"}
              </button>
            </form>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
