import { useEffect, useRef, useState } from "react";
import { Link2, MessageCircle, Share2 } from "lucide-react";

/* ── helpers ─────────────────────────────────────────── */

const TR_MAP: Record<string, string> = {
  ı: "i", İ: "i", ö: "o", Ö: "o", ü: "u", Ü: "u",
  ş: "s", Ş: "s", ç: "c", Ç: "c", ğ: "g", Ğ: "g",
};

function slugify(text: string): string {
  return text
    .replace(/[ıİöÖüÜşŞçÇğĞ]/g, (c) => TR_MAP[c] ?? c)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-");
}

type Heading = { id: string; text: string; level: number };

function extractHeadings(md: string): Heading[] {
  const result: Heading[] = [];
  const re = /^(#{2,4})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const level = m[1].length; // 2 = ##, 4 = ####
    const text = m[2].trim();
    result.push({ id: slugify(text), text, level });
  }
  return result;
}

/* ── share helpers ───────────────────────────────────── */

function shareWhatsApp() {
  window.open(`https://wa.me/?text=${encodeURIComponent(window.location.href)}`, "_blank");
}
function shareX() {
  window.open(`https://x.com/intent/tweet?url=${encodeURIComponent(window.location.href)}`, "_blank");
}
function shareLinkedIn() {
  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`, "_blank");
}
function copyLink() {
  navigator.clipboard.writeText(window.location.href);
}

/* ── component ───────────────────────────────────────── */

export default function TableOfContents({ markdown }: { markdown: string }) {
  const headings = extractHeadings(markdown);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current?.disconnect();

    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter(Boolean) as HTMLElement[];

    if (els.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 },
    );

    els.forEach((el) => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav className="hidden lg:block sticky top-24">
      {/* TOC */}
      <p className="text-xs font-semibold tracking-widest text-gray-400 mb-4">
        İÇİNDEKİLER
      </p>

      <ul className="flex flex-col gap-1">
        {headings.map((h) => {
          const isActive = activeId === h.id;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`block text-sm transition-all duration-200 ${
                  h.level === 4 ? "pl-4" : ""
                } ${
                  isActive
                    ? "border-l-2 border-brand-blue pl-3 font-semibold text-brand-dark"
                    : "border-l-2 border-transparent pl-3 text-gray-400 hover:text-gray-600"
                }`}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>

      {/* PAYLAŞ */}
      <div className="mt-8 pt-6 border-t border-gray-100">
        <p className="text-xs font-semibold tracking-widest text-gray-400 mb-3">
          PAYLAŞ
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={shareWhatsApp}
            aria-label="WhatsApp'ta paylaş"
            className="rounded-full p-2 text-gray-400 hover:bg-green-50 hover:text-green-600 transition"
          >
            <MessageCircle size={18} />
          </button>
          <button
            onClick={shareX}
            aria-label="X'te paylaş"
            className="rounded-full p-2 text-gray-400 hover:bg-sky-50 hover:text-sky-600 transition"
          >
            <Share2 size={18} />
          </button>
          <button
            onClick={shareLinkedIn}
            aria-label="LinkedIn'de paylaş"
            className="rounded-full p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </button>
          <button
            onClick={copyLink}
            aria-label="Linki kopyala"
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <Link2 size={18} />
          </button>
        </div>
      </div>
    </nav>
  );
}
