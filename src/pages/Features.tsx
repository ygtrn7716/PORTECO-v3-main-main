// src/pages/Features.tsx
import { Link } from "react-router-dom";
import Container from "@/components/layout/Container";
import { FEATURES } from "@/content/features";
import { cn } from "@/lib/utils";

const MOBILE_WIDE_INDEXES = [2]; // 0 tabanlı: 3. kart

export default function Features() {
  return (
    <section className="bg-gradient-to-b from-white to-[#F6F8FB]">
      <Container className="py-10 md:py-24">
        <h1 className="text-3xl font-semibold text-neutral-dark mt-10">Özellikler</h1>
        <p className="text-neutral-gray mt-1">
          Ürün/servis özellik açıklamalarını burada detaylandırın.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-3 md:gap-6">
          {FEATURES.map((f, i) => (
            <Link
              key={f.slug}
              to={`/features/${f.slug}`}
              className={cn(
                "group block rounded-xl border border-black/10 bg-white p-5 shadow-sm hover:shadow-md transition",
                "col-span-1",
                MOBILE_WIDE_INDEXES.includes(i) && "col-span-2",
                "md:col-span-1"
              )}
            >
              {/* ÜST GÖRSEL ALANI */}
              <div className="mb-3 h-28 w-full overflow-hidden rounded-md bg-neutral-100">
                {f.image ? (
                  <img
                    src={f.image}
                    alt={f.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  // Görsel yoksa placeholder
                  <div className="h-full w-full bg-neutral-200" />
                )}
              </div>

              {/* METİN */}
              <div className="font-medium text-neutral-dark">{f.title}</div>
              <div className="text-sm text-neutral-gray">{f.desc}</div>

              <div className="mt-4 text-sm text-brand-blue opacity-0 group-hover:opacity-100 transition">
                Detaya git →
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
