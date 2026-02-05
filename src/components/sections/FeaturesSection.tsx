// src/components/sections/FeaturesSection.tsx
import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";

import Container from "@/components/layout/Container";
import { FEATURES } from "@/content/features";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import LeadForm from "@/components/forms/LeadForm";
import { motion } from "framer-motion";

type Feature = (typeof FEATURES)[number];

const PORTECO_INDEX = 2;

function FeatureModal({
  feature,
  onClose,
}: {
  feature: Feature;
  onClose: () => void;
}) {
  const heroImg = feature.hero?.image ?? feature.image;
  const tint = feature.hero?.tint ?? "dark";
  const align = feature.hero?.align ?? "left";

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex min-h-full items-start justify-center px-3 pt-32 pb-10 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-5xl rounded-2xl bg-gradient-to-b from-white to-[#F6F8FB] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="p-4 md:p-6">
          {/* MINI BANNER */}
          <div className="relative overflow-hidden rounded-2xl border border-black/10 shadow-sm h-[220px] md:h-[260px]">
            {heroImg ? (
              <img
                src={heroImg}
                alt={feature.title}
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
              />
            ) : (
              <div className="absolute inset-0 bg-neutral-200" />
            )}

            <div
              className={cn(
                "absolute inset-0 z-0",
                tint === "dark"
                  ? "bg-gradient-to-r from-black/60 via-black/30 to-black/0"
                  : "bg-gradient-to-r from-white/70 via-white/40 to-white/0"
              )}
            />

            <button
              type="button"
              onClick={onClose}
              className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-xs md:text-sm font-medium text-neutral-800 shadow-md hover:bg-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Geri don</span>
            </button>

            <div
              className={cn(
                "relative h-full flex items-center p-5 md:p-8",
                align === "left" && "justify-start",
                align === "center" && "justify-center",
                align === "right" && "justify-end"
              )}
            >
              <div className="max-w-xl bg-white/75 backdrop-blur-md rounded-xl p-4 md:p-5 shadow-sm">
                <h3 className="text-2xl md:text-3xl font-semibold text-neutral-900">
                  {feature.title}
                </h3>
                {feature.desc && (
                  <p className="mt-1 text-neutral-700">{feature.desc}</p>
                )}
              </div>
            </div>
          </div>

          {/* ALT ICERIK */}
          <div className="mt-6 max-h-[50vh] overflow-y-auto pr-1">
            {feature.sections?.length ? (
              <div className="grid gap-6 md:grid-cols-2">
                {feature.sections.map((s, idx) => (
                  <article
                    key={idx}
                    className="rounded-xl border border-black/10 bg-white p-5 md:p-6 shadow-sm"
                  >
                    <h4 className="text-lg font-semibold text-neutral-900">
                      {s.heading}
                    </h4>
                    <p className="mt-2 text-neutral-700 leading-relaxed">
                      {s.body}
                    </p>
                    {s.bullets?.length ? (
                      <ul className="mt-3 list-disc pl-5 text-neutral-700 space-y-1">
                        {s.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                    {s.image ? (
                      <div className="mt-4 overflow-hidden rounded-lg border border-black/10">
                        <img
                          src={s.image}
                          alt={s.heading}
                          className="w-full h-48 object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-black/10 bg-white p-6 text-neutral-500">
                Bu ozellik icin ayrintilar yakinda eklenecek.
              </div>
            )}

            {feature.slug === "perakende-satis" && (
              <div className="mt-6">
                <LeadForm
                  featureSlug={feature.slug}
                  featureTitle={feature.title}
                  submitUrl="/api/contact.php"
                />
              </div>
            )}

            {feature.cta && (
              <div className="mt-6">
                <Button asChild size="lg">
                  <a href={feature.cta.href}>{feature.cta.label}</a>
                </Button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const getMdSpan = (index: number) => {
  if (index === PORTECO_INDEX) return "md:col-span-6";
  return "md:col-span-3";
};

const getMdOrder = (index: number) => {
  switch (index) {
    case 0: return "md:order-1";
    case 1: return "md:order-2";
    case 4: return "md:order-3";
    case 6: return "md:order-4";
    case 3: return "md:order-5";
    case PORTECO_INDEX: return "md:order-6";
    case 5: return "md:order-7";
    default: return "md:order-none";
  }
};

const getMobileSpan = (index: number) =>
  index === PORTECO_INDEX ? "col-span-2" : "col-span-1";

export default function FeaturesSection() {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const activeFeature = activeSlug
    ? FEATURES.find((f) => f.slug === activeSlug) ?? null
    : null;

  return (
    <section id="services" className="bg-gradient-to-b from-white to-[#F6F8FB]">
      <Container className="py-10 md:py-24">
        <motion.div
          className="text-center max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-semibold text-neutral-dark">
            Hizmetlerimiz
          </h2>
          <p className="mt-2 text-neutral-gray">
            Urun ve servislerimizi tek ekrandan inceleyin. Kartlara tiklayarak
            detaylari acabilirsiniz.
          </p>
        </motion.div>

        {/* GRID */}
        <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-12 md:gap-6">
          {FEATURES.map((f, i) => (
            <motion.button
              key={f.slug}
              type="button"
              onClick={() => setActiveSlug(f.slug)}
              className={cn(
                "group block rounded-xl border border-black/10 bg-white p-5 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-left",
                getMobileSpan(i),
                getMdSpan(i),
                getMdOrder(i)
              )}
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              {/* UST GORSEL */}
              <div className="mb-3 h-28 w-full overflow-hidden rounded-lg bg-neutral-100 relative">
                {f.image ? (
                  <img
                    src={f.image}
                    alt={f.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full bg-neutral-200" />
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-[#0A66FF]/0 group-hover:bg-[#0A66FF]/10 transition-colors duration-300 rounded-lg" />
              </div>

              {/* METIN */}
              <div className="font-medium text-neutral-dark">{f.title}</div>
              <div className="text-sm text-neutral-gray">{f.desc}</div>

              <div className="mt-4 text-sm text-[#0A66FF] font-medium opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                Detayi gor →
              </div>
            </motion.button>
          ))}
        </div>
      </Container>

      {activeFeature && (
        <FeatureModal
          feature={activeFeature}
          onClose={() => setActiveSlug(null)}
        />
      )}
    </section>
  );
}
