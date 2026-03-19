import { motion } from "framer-motion";
import {
  Phone,
  Mail,
  MapPin,
  CircleCheck,
  Shield,
  Zap,
  BarChart3,
} from "lucide-react";
import Container from "@/components/layout/Container";
import LeadForm from "@/components/forms/LeadForm";

/* ── Data ──────────────────────────────────────────── */

const CONTACT_CARDS = [
  {
    icon: Phone,
    title: "Bizi Arayın",
    value: "+90 555 200 33 00",
    sub: "Pazartesi – Cuma, 09:00 – 18:00",
  },
  {
    icon: Mail,
    title: "E-posta Gönderin",
    value: "muratbahcivanci@ecoenerji.net.tr",
    sub: "24 saat içinde yanıt",
  },
  
];

const FEATURES = [
  "Saatlik tüketim verilerinizi anlık olarak takip edin",
  "Faturanızı kalem kalem otomatik hesaplatın",
  "Reaktif güç limitlerine yaklaşınca SMS ile uyarı alın",
  "EPİAŞ PTF ve YEKDEM verilerini tüketiminizle eşleştirin",
  "Birden fazla tesisinizi tek panelden yönetin",
  "Tüketim verilerinizi Excel olarak indirin",
];

const TRUST_ITEMS = [
  { icon: Shield, label: "256-bit SSL ile korunan veriler" },
  { icon: Zap, label: "7/24 kesintisiz izleme" },
  { icon: BarChart3, label: "Gerçek zamanlı analiz" },
];

/* ── Page ──────────────────────────────────────────── */

export default function ContactPage() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────── */}
      <section id="hero-section" className="relative bg-[#0F1C2E] overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 20% 80%, rgba(0,174,239,0.08) 0%, transparent 60%)",
          }}
        />
        <Container className="relative py-16 md:py-28 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-3xl md:text-5xl font-bold text-white">
              Bizimle İletişime Geçin
            </h1>
            <p className="mt-4 text-lg text-gray-300 max-w-2xl mx-auto">
              PORTECO ile enerji maliyetlerinizi kontrol altına alın. Ücretsiz
              demo için formu doldurun, size en kısa sürede dönüş yapalım.
            </p>
          </motion.div>
        </Container>
      </section>

      {/* ── Contact Cards (overlap hero) ───────────── */}
      <Container className="-mt-8 md:-mt-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CONTACT_CARDS.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="bg-white rounded-2xl shadow-lg p-8 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="bg-brand-blue/10 rounded-full p-4 w-16 h-16 flex items-center justify-center mx-auto">
                <card.icon className="w-7 h-7 text-brand-blue" />
              </div>
              <h3 className="font-semibold text-brand-dark text-lg mt-4">
                {card.title}
              </h3>
              <p className="text-gray-600 text-sm mt-2">{card.value}</p>
              <p className="text-gray-400 text-xs mt-1">{card.sub}</p>
            </motion.div>
          ))}
        </div>
      </Container>

      {/* ── Main Content — 2 Columns ───────────────── */}
      <Container className="py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left — Info & Value Proposition */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold text-brand-dark">
              Ücretsiz Demo Talep Edin
            </h2>
            <p className="text-gray-500 mt-4 text-lg">
              Tesisinize özel PORTECO demo hesabı oluşturalım. Gerçek
              verilerinizle platformun tüm özelliklerini deneyimleyin.
            </p>

            <ul className="mt-8 flex flex-col gap-4">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <CircleCheck className="w-6 h-6 text-brand-blue flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600">{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 grid grid-cols-3 gap-4">
              {TRUST_ITEMS.map((t) => (
                <div key={t.label} className="text-center">
                  <t.icon className="w-8 h-8 text-brand-blue mx-auto" />
                  <p className="text-xs text-gray-400 mt-2">{t.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-2xl shadow-xl p-8 md:p-10 border border-gray-100"
          >
            <p className="text-sm font-medium text-brand-blue uppercase tracking-wider mb-6">
              Demo Talep Formu
            </p>
            <div className="[&_#iletisim-formu]:!mt-0 [&_#iletisim-formu>div]:!p-0 [&_#iletisim-formu>div]:!shadow-none [&_#iletisim-formu>div]:!border-0 [&_#iletisim-formu>div>div.mb-4]:!hidden">
              <LeadForm featureSlug="iletisim" featureTitle="Demo Talep" />
            </div>
          </motion.div>
        </div>
      </Container>
    </>
  );
}
