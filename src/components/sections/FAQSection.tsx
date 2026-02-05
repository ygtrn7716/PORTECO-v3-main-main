import { useState } from "react";
import { Link } from "react-router-dom";
import Container from "@/components/layout/Container";
import { FAQ_ITEMS } from "@/content/faq";
import { cn } from "@/lib/utils";
import { ChevronRight, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

export default function FAQSection() {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!FAQ_ITEMS.length) return null;

  return (
    <section id="faq" className="bg-gradient-to-b from-white to-[#F6F8FB]">
      <Container className="py-10 md:py-20">
        {/* BASLIK */}
        <motion.div
          className="text-center max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-semibold text-neutral-dark">
            Sik Sorulan Sorular
          </h2>
          <p className="mt-2 text-neutral-gray">
            ECO Enerji cozumleri hakkinda en cok merak edilen sorulari derledik.
          </p>
        </motion.div>

        {/* SORU LISTESI */}
        <div className="mt-8 space-y-4">
          {FAQ_ITEMS.map((faq, i) => {
            const isOpen = faq.id === openId;

            return (
              <motion.div
                key={faq.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="rounded-2xl border border-black/8 bg-white shadow-sm hover:shadow-md transition-shadow duration-300"
              >
                {/* SORU SATIRI */}
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : faq.id)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 md:px-6 md:py-5 text-left"
                >
                  <div className="min-h-[24px] md:min-h-[32px] flex items-center">
                    <h3 className="text-base md:text-lg font-semibold text-neutral-900">
                      {faq.question}
                    </h3>
                  </div>

                  <span
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-neutral-500 transition-all duration-300 flex-shrink-0",
                      isOpen && "rotate-90 bg-[#0A66FF]/10 border-[#0A66FF]/20 text-[#0A66FF]"
                    )}
                    aria-hidden="true"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>

                {/* CEVAP */}
                <div
                  className={cn(
                    "px-5 md:px-6 overflow-hidden transition-all duration-300 ease-out",
                    isOpen ? "max-h-[600px] pb-4 md:pb-5 opacity-100" : "max-h-0 pb-0 opacity-0"
                  )}
                >
                  <div className="text-sm md:text-[15px] text-neutral-700 leading-relaxed">
                    {faq.answer.split("\n\n").map((para, idx) => (
                      <p key={idx} className={idx > 0 ? "mt-2" : ""}>
                        {para}
                      </p>
                    ))}
                  </div>

                  {faq.blogSlug && (
                    <div className="mt-3">
                      <Link
                        to={`/blog/${faq.blogSlug}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:text-brand-blueDark transition-colors"
                      >
                        Daha fazlasini blog yazisinda oku
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* DIGER YAZILAR BUTONU */}
        <motion.div
          className="mt-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 rounded-full border border-brand-blue px-5 py-2.5 text-sm md:text-base font-medium text-brand-blue hover:bg-[#0A66FF]/5 transition-colors"
          >
            Diger yazilari oku
            <ChevronRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </Container>
    </section>
  );
}
