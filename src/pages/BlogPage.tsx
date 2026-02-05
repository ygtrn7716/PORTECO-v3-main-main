// src/pages/BlogPage.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Container from "@/components/layout/Container";
import {
  BLOG_POSTS,
  BLOG_FILTERS,
  type BlogCategoryId,
  getCategoryLabel,
} from "@/content/blog";
import { cn } from "@/lib/utils";

type FilterId = "all" | BlogCategoryId;

export default function BlogPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");

  // Sayfa açılış animasyonu
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Slider için featured yazılar
  const featured = BLOG_POSTS.filter((p) => p.isFeatured);
  const heroItems = featured.length ? featured : BLOG_POSTS.slice(0, 3);

  const [activeHeroIdx, setActiveHeroIdx] = useState(0);

  // 5 sn'de bir otomatik geçiş
  useEffect(() => {
    if (!heroItems.length) return;
    const id = setInterval(() => {
      setActiveHeroIdx((prev) => (prev + 1) % heroItems.length);
    }, 5000);
    return () => clearInterval(id);
  }, [heroItems.length]);

  const activeHero = heroItems[activeHeroIdx];

  // Filtrelenmiş liste
  const visiblePosts =
    activeFilter === "all"
      ? BLOG_POSTS
      : BLOG_POSTS.filter((p) => p.categoryId === activeFilter);

  return (
    <section className="bg-white">
      <Container className="pt-8 md:pt-12 pb-12 md:pb-16">
        {/* ÜST BAŞLIK */}
        <div
          className={cn(
            "max-w-3xl mx-auto text-center mb-6 md:mb-10 transition-all duration-500",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          <p className="text-xs mt-12 md:text-sm tracking-[0.25em] uppercase text-brand-blue">
            Bilgi Merkezi
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl lg:text-5xl font-semibold text-neutral-900">
            Enerji maliyetlerinizi azaltmanıza yardım edecek içerikler.
          </h1>
          <p className="mt-3 text-neutral-600">
            Elektrik perakende sözleşmelerinden GES yatırımlarına, enerji
            etüdünden reaktif cezalara kadar tüm süreci yalın bir dille
            anlattığımız yazıları burada bulabilirsiniz.
          </p>
        </div>

        {/* HERO / BANNER SLIDER */}
        {activeHero && (
          <div
            className={cn(
              "transition-all duration-500",
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="relative overflow-hidden rounded-3xl  bg-gradient-to-br from-[#0B1C33] via-[#0A2A5E] to-[#061023] text-white shadow-xl">
              <button
                type="button"
                onClick={() => navigate(`/blog/${activeHero.slug}`)}
                className="block w-full text-left"
              >
                <div className="grid md:grid-cols-2">
                  {/* Sol metin */}
                  <div className="p-6 md:p-9 flex flex-col justify-center gap-4">
                    <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium tracking-wide uppercase text-white/80">
                      {getCategoryLabel(activeHero.categoryId)}
                    </span>
                    <div>
                      <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight">
                        {activeHero.title}
                      </h2>
                      <p className="mt-3 text-sm md:text-base text-white/80 max-w-xl">
                        {activeHero.summary}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm text-white/70">
                      <span>
                        {new Date(
                          activeHero.publishedAt
                        ).toLocaleDateString("tr-TR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-white/40" />
                      <span>{activeHero.readingMinutes} dk okuma</span>
                    </div>
                    <div className="mt-1">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-black bg-white rounded-full px-4 py-2">
                        Yazıyı oku
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            d="M9 5l7 7-7 7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </div>
                  </div>

                  {/* Sağ görsel */}
                  <div className="relative h-52 md:h-full">
                    <img
                      src={activeHero.bannerImage}
                      alt={activeHero.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-l from-neutral-900/40 via-neutral-900/10 to-transparent" />
                  </div>
                </div>
              </button>

              {/* Slider kontrolleri */}
              <div className="absolute inset-x-0 bottom-4 flex items-center justify-between px-4 md:px-6">
                <div className="flex gap-2">
                  {heroItems.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveHeroIdx(i)}
                      className={cn(
                        "h-2.5 rounded-full transition-all",
                        i === activeHeroIdx
                          ? "w-5 bg-white"
                          : "w-2.5 bg-white/40 hover:bg-white/70"
                      )}
                      aria-label={`Banner ${i + 1}`}
                    />
                  ))}
                </div>

                <div className="hidden md:flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveHeroIdx(
                        (prev) =>
                          (prev - 1 + heroItems.length) % heroItems.length
                      )
                    }
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/30 text-white"
                    aria-label="Önceki"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveHeroIdx(
                        (prev) => (prev + 1) % heroItems.length
                      )
                    }
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white hover:bg-neutral-100 text-neutral-900"
                    aria-label="Sonraki"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* KATEGORİ FİLTRELERİ */}
        <div className="mt-10 md:mt-12">
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
            {BLOG_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={cn(
                  "px-3 md:px-4 py-1.5 rounded-full border text-sm md:text-[15px] transition-colors",
                  activeFilter === f.id
                    ? "bg-brand-blue text-white border-brand-blue shadow-sm"
                    : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* BLOG LİSTESİ */}
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visiblePosts.map((post) => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="group rounded-2xl border border-black/5 bg-white shadow-sm hover:shadow-md transition overflow-hidden flex flex-col"
              >
                <div className="relative h-40">
                  <img
                    src={post.bannerImage}
                    alt={post.title}
                    className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.02] transition-transform"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
                  <span className="absolute bottom-3 left-3 inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-neutral-900">
                    {getCategoryLabel(post.categoryId)}
                  </span>
                </div>

                <div className="p-4 md:p-5 flex-1 flex flex-col">
                  <h3 className="text-base md:text-lg font-semibold text-neutral-900 group-hover:text-brand-blueDark transition-colors">
                    {post.title}
                  </h3>
                  <p className="mt-2 text-sm text-neutral-600">
                    {post.summary}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
                    <span>
                      {new Date(post.publishedAt).toLocaleDateString(
                        "tr-TR",
                        {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }
                      )}
                    </span>
                    <span>{post.readingMinutes} dk okuma</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
