import Container from "@/components/layout/Container";
import { Target, Shield, Clock } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    title: "Ölçülebilir Tasarruf",
    desc: "Faturalarınızı ve tüketim verinizi analiz ederek en uygun tarife/tedarik modelini belirleriz. Verimlilik fırsatlarını VAP/etüt ile somutlaştırır, gereksiz bedel ve cezaları önleriz.",
    icon: Target,
    color: "from-[#0A66FF] to-[#3B82F6]",
  },
  {
    title: "Güvenilir Veri & Proaktif İzleme",
    desc: "OSOS/EPİAŞ ve ERP entegrasyonlarıyla verilerinizi otomatik toplar, PORTECO üzerinden anlık takip ve uyarılar sağlar, raporlamayı standartlaştırırız. ISO 50001 yaklaşımımızla süreçleriniz şeffaf ve denetlenebilir olur.",
    icon: Shield,
    color: "from-emerald-500 to-emerald-600",
  },
  {
    title: "7/24 Online Takip",
    desc: "Kurulumdan sözleşmeye, saha operasyonundan yönetim sunumlarına kadar yanınızdayız. SLA’lı destek; WhatsApp/telefon/e-posta kanallarından hızlı geri dönüş.",
    icon: Clock,
    color: "from-amber-500 to-orange-500",
  },
];

export default function AboutUs() {
  return (
    <section className="bg-gradient-to-b from-[#F6F8FB] to-white">
      <Container className="py-16 md:py-24">
        <motion.div
          className="text-center max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-neutral-900">
            Neden ECO Enerji?
          </h2>
          <p className="mt-3 text-neutral-600">
            Enerji maliyetinizi düşürürken sürdürülebilirlik hedeflerinizi güvenle
            yönetin: analiz, tedarik, izleme ve raporlama tek çatı altında.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                className="group rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <span
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.color} text-white shadow-md group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-neutral-900">
                  {f.title}
                </h3>
                <p className="mt-1 text-neutral-600">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
