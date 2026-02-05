import { Link } from "react-router-dom";
import Container from "@/components/layout/Container";
import { Monitor, Smartphone, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

const FEATURES_TRIO = [
  { icon: Monitor, label: "Anlik Reaktif Takip" },
  { icon: Smartphone, label: "Uyari Sistemi" },
  { icon: BarChart3, label: "Dashboard & Raporlama" },
];

export default function SmartPortal() {
  return (
    <section className="bg-transparent">
      <Container className="py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          {/* Left text */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900">
              PortECO ile enerji maliyetlerini kontrol altina alin.
            </h2>
            <p className="mt-3 text-neutral-600 max-w-xl">
              Akilli enerji portali PortECO sizin yerinize panelinizi kontrol eder ve asimlari engeller.
            </p>

            {/* Feature trio */}
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              {FEATURES_TRIO.map(({ icon: Icon, label }, i) => (
                <motion.div
                  key={label}
                  className="group flex flex-col items-center gap-3"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.1 }}
                >
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0A66FF]/10 to-[#0A66FF]/5 text-[#0A66FF] group-hover:from-[#0A66FF] group-hover:to-[#3B82F6] group-hover:text-white group-hover:shadow-lg group-hover:shadow-[#0A66FF]/25 transition-all duration-300">
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-medium text-neutral-700">{label}</span>
                </motion.div>
              ))}
            </div>

            <div className="mt-8">
              <Link
                to="/#features"
                className="inline-flex items-center rounded-md bg-[#0A66FF] px-5 py-3 text-sm font-medium text-white hover:bg-[#0a59e0] transition shadow-sm shadow-[#0A66FF]/20"
              >
                Nasil Calisir ?
              </Link>
            </div>
          </motion.div>

          {/* Right visual */}
          <motion.div
            className="relative"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="rounded-xl border-4 border-neutral-200 bg-transparent shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-2 hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)] transition-shadow duration-300">
              <div className="relative w-full overflow-hidden rounded-lg bg-neutral-100">
                {/* 16:9 ratio box */}
                <div className="pt-[60%]" />
                <img src="/features/smartportal.png" alt="PortECO Smart Portal" className="absolute inset-0 h-full w-full object-cover" />
              </div>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
