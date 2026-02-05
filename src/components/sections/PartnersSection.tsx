// src/components/sections/PartnersSection.tsx
import Container from "@/components/layout/Container";
import { PARTNERS } from "@/content/partners";
import { motion } from "framer-motion";

export default function PartnersSection() {
  if (!PARTNERS.length) return null;

  const marqueeItems = [...PARTNERS, ...PARTNERS];

  return (
    <section id="partners" className="bg-gradient-to-b from-[#F6F8FB] to-white">
      <Container className="py-10 md:py-20">
        {/* BASLIK */}
        <motion.div
          className="text-center max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl md:text-3xl font-semibold text-neutral-dark">
            Birlikte Calistigimiz Kurumlar
          </h2>
          <p className="mt-2 text-neutral-gray">
            Enerji verimliligi yolculugunda PortEco ayircaligina sahip is ortaklarimiz.
          </p>
        </motion.div>

        {/* SLIDER with edge fades */}
        <div className="mt-8 relative">
          {/* Left fade */}
          <div className="absolute left-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-r from-[#F6F8FB] to-transparent z-10 pointer-events-none" />
          {/* Right fade */}
          <div className="absolute right-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-l from-[#F6F8FB] to-transparent z-10 pointer-events-none" />

          <div className="overflow-hidden">
            <div className="partner-marquee-track gap-8 md:gap-10">
              {marqueeItems.map((p, idx) => (
                <a
                  key={`${p.name}-${idx}`}
                  href={p.url ?? "#"}
                  target={p.url ? "_blank" : undefined}
                  rel={p.url ? "noopener noreferrer" : undefined}
                  className="flex-shrink-0 opacity-60 hover:opacity-100 grayscale hover:grayscale-0 transition-all duration-300"
                >
                  <img
                    src={p.logo}
                    alt={p.name}
                    className="h-10 md:h-12 w-auto object-contain"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
