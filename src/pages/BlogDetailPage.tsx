// src/pages/BlogDetailPage.tsx
import { Link, useParams } from "react-router-dom";
import Container from "@/components/layout/Container";
import { BLOG_POSTS, getCategoryLabel } from "@/content/blog";

export default function BlogDetailPage() {
  const { slug } = useParams();
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    return (
      <section className="bg-white">
        <Container className="py-16">
          <h1 className="text-2xl font-semibold text-neutral-900">
            Yazı bulunamadı
          </h1>
          <p className="mt-2 text-neutral-600">
            Aradığınız blog yazısı kaldırılmış veya hiç oluşturulmamış olabilir.
          </p>
          <div className="mt-6">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 rounded-full border border-brand-blue px-4 py-2 text-sm font-medium text-brand-blue hover:bg-neutral-lightBlue"
            >
              Blog'a geri dön
            </Link>
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="bg-white">
      {/* ÜST BANNER */}
      <div className="relative h-[260px] md:h-[340px] overflow-hidden">
        <img
          src={post.bannerImage}
          alt={post.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/30" />
        <Container className="relative h-full flex items-end pb-6 md:pb-10">
          <div className="max-w-3xl text-white">
            <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm text-white/80 mb-2">
              <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1">
                {getCategoryLabel(post.categoryId)}
              </span>
              <span>
                {new Date(post.publishedAt).toLocaleDateString("tr-TR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <span className="hidden md:inline">•</span>
              <span className="hidden md:inline">
                {post.readingMinutes} dk okuma
              </span>
            </div>
            <h1 className="text-2xl md:text-4xl font-semibold leading-tight">
              {post.title}
            </h1>
          </div>
        </Container>
      </div>

      {/* İÇERİK */}
      <Container className="py-10 md:py-14">
        <article className="prose prose-neutral max-w-3xl">
          {post.body && post.body.length > 0 ? (
            post.body.map((para, idx) => (
              <p key={idx} className="mb-4 text-neutral-800">
                {para}
              </p>
            ))
          ) : (
            <p className="text-neutral-700">
              Bu yazının ayrıntılı içeriği yakında eklenecek. Şimdilik özet
              bilgileri blog listesinde görebilirsiniz.
            </p>
          )}
        </article>

        <div className="mt-10">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            ← Diğer yazılara dön
          </Link>
        </div>
      </Container>
    </section>
  );
}
