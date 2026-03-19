import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight } from "lucide-react";
import Container from "@/components/layout/Container";
import TableOfContents from "@/components/blog/TableOfContents";
import BlogSidebar from "@/components/blog/BlogSidebar";
import { BLOG_POSTS, getCategoryLabel } from "@/content/blog";
import type { ReactNode } from "react";

/* ── slugify (Türkçe uyumlu) ─────────────────────────── */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function childrenToText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return childrenToText((children as { props: { children?: ReactNode } }).props.children ?? "");
  }
  return "";
}

/* ── component ───────────────────────────────────────── */

export default function BlogDetailPage() {
  const { slug } = useParams();
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    return (
      <section className="bg-white min-h-[60vh]">
        <Container className="py-16">
          <h1 className="text-2xl font-semibold text-brand-dark">
            Yazı bulunamadı
          </h1>
          <p className="mt-2 text-gray-500">
            Aradığınız blog yazısı kaldırılmış veya hiç oluşturulmamış olabilir.
          </p>
          <div className="mt-6">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 rounded-full border border-brand-blue px-4 py-2 text-sm font-medium text-brand-blue hover:bg-blue-50 transition"
            >
              ← Blog'a geri dön
            </Link>
          </div>
        </Container>
      </section>
    );
  }

  const categoryLabel = getCategoryLabel(post.categoryId);
  const formattedDate = new Date(post.publishedAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <section className="bg-white">
      {/* ── Breadcrumb ──────────────────────────────── */}
      <Container className="pt-6 pb-2">
        <nav className="flex items-center gap-1 text-sm text-gray-400 flex-wrap">
          <Link to="/" className="hover:text-brand-blue transition">
            Ana Sayfa
          </Link>
          <ChevronRight size={14} />
          <Link to="/blog" className="hover:text-brand-blue transition">
            Blog
          </Link>
          <ChevronRight size={14} />
          <span className="hover:text-brand-blue transition">
            {categoryLabel}
          </span>
          <ChevronRight size={14} />
          <span className="text-gray-300 line-clamp-1">{post.title}</span>
        </nav>
      </Container>

      {/* ── Başlık Alanı ────────────────────────────── */}
      <Container className="py-6">
        <span className="inline-flex items-center rounded-full bg-blue-50 text-brand-blue px-4 py-1 text-sm font-medium">
          {categoryLabel}
        </span>
        <h1 className="text-3xl md:text-4xl font-bold text-brand-dark mt-4 leading-tight">
          {post.title}
        </h1>
        <div className="flex items-center gap-3 text-sm text-gray-400 mt-3">
          <span>{formattedDate}</span>
          <span>·</span>
          <span>{post.readingMinutes} dk okuma</span>
        </div>

        {/* Banner */}
        <img
          src={post.bannerImage}
          alt={post.title}
          className="w-full rounded-2xl object-cover max-h-[400px] mt-6"
        />
      </Container>

      {/* ── 3 Kolon Grid ────────────────────────────── */}
      <Container className="pb-16">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] lg:grid-cols-[240px_1fr_280px] gap-8 mt-2">
          {/* Sol: TOC (sadece desktop) */}
          <aside className="hidden lg:block">
            {post.body && <TableOfContents markdown={post.body} />}
          </aside>

          {/* Orta: İçerik */}
          <div>
            {post.body ? (
              <article className="prose prose-lg max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h2: ({ children }) => {
                      const text = childrenToText(children);
                      return (
                        <h2
                          id={slugify(text)}
                          className="text-2xl font-bold text-brand-dark mt-10 mb-4 border-t border-gray-100 pt-8"
                        >
                          {children}
                        </h2>
                      );
                    },
                    h3: ({ children }) => {
                      const text = childrenToText(children);
                      return (
                        <h3
                          id={slugify(text)}
                          className="text-xl font-semibold text-brand-dark mt-8 mb-3"
                        >
                          {children}
                        </h3>
                      );
                    },
                    h4: ({ children }) => {
                      const text = childrenToText(children);
                      return (
                        <h4
                          id={slugify(text)}
                          className="text-lg font-semibold text-brand-dark mt-6 mb-2"
                        >
                          {children}
                        </h4>
                      );
                    },
                    p: ({ children }) => (
                      <p className="text-gray-600 leading-relaxed mb-4">
                        {children}
                      </p>
                    ),
                    strong: ({ children }) => (
                      <strong className="text-brand-dark font-semibold">
                        {children}
                      </strong>
                    ),
                    ul: ({ children }) => (
                      <ul className="ml-6 list-disc text-gray-600 mb-4">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="ml-6 list-decimal text-gray-600 mb-4">
                        {children}
                      </ol>
                    ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        className="text-brand-blue hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {post.body}
                </ReactMarkdown>
              </article>
            ) : (
              <p className="text-gray-500">
                Bu yazının ayrıntılı içeriği yakında eklenecektir. Şimdilik
                özet bilgileri blog listesinde görebilirsiniz.
              </p>
            )}

            {/* Geri dön */}
            <div className="mt-10">
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                ← Diğer yazılara dön
              </Link>
            </div>
          </div>

          {/* Sağ: Sidebar (tablet + desktop) */}
          <aside className="hidden md:block">
            <BlogSidebar />
          </aside>
        </div>

        {/* Mobil: Sidebar kartları yatay scroll */}
        <div className="md:hidden mt-10">
          <BlogSidebar />
        </div>
      </Container>
    </section>
  );
}
