// src/components/layout/Footer.tsx
import Container from "./Container";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { MouseEvent } from "react";
import { useSession } from "@/hooks/useSession";

type FooterProps = {
  variant?: "gradient" | "light"; // Home: gradient, diğer sayfalar: light
  className?: string;
};

export default function Footer({ variant = "light", className = "" }: FooterProps) {
  const isGradient = variant === "gradient";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session } = useSession();
  const isLoggedIn = !!session;
  const isHome = pathname === "/";

  const year = new Date().getFullYear();

  const handleEcoClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    const scrollToTopSmooth = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (!isHome) {
      navigate("/");
      setTimeout(scrollToTopSmooth, 50);
    } else {
      scrollToTopSmooth();
    }
  };

  const headingClass =
    (isGradient ? "text-white" : "text-brand-blueDark") + " font-semibold";

  const columnLinkClass = "hover:opacity-80 transition-opacity";
  const subLinkClass = "text-xs md:text-sm hover:opacity-100 transition-opacity";

  return (
    <footer
      className={`relative mt-12 overflow-hidden ${
        isGradient ? "text-white" : "text-neutral-gray"
      } ${className}`}
    >
      <Container
        className={`relative z-10 py-10 md:py-12 text-sm ${
          isGradient ? "text-white/80" : "text-neutral-gray"
        }`}
      >
        {/* 🔧 Burayı değiştirdik: ilk kolon artık 2fr değil, hepsi auto */}
        <div className="grid gap-y-8 gap-x-10 md:grid-cols-[auto_auto_auto_auto_auto] items-start">
          {/* Eco Enerji + iletişim */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleEcoClick}
              className={`${headingClass} hover:opacity-80 transition`}
            >
              ECO Enerji
            </button>
            <div className="flex flex-col space-y-1 text-xs md:text-sm">
              <a
                href="mailto:muratbahcivanci@ecoenerji.net.tr"
                className={columnLinkClass}
              >
                muratbahcivanci@ecoenerji.net.tr
              </a>
              <a
                href="tel:+905552003300"
                className={columnLinkClass}
              >
                90 555 200 33 00
              </a>
            </div>
          </div>

          {/* Ana sayfa alt başlıkları */}
          <div>
            <div className={headingClass}>Ana sayfa</div>
            <ul className="mt-2 space-y-1">
              <li>
                <Link to="/#features" className={subLinkClass}>
                  Hizmetlerimiz
                </Link>
              </li>
              <li>
                <Link to="/#partners" className={subLinkClass}>
                  Partnerlerimiz
                </Link>
              </li>
              <li>
                <Link to="/#faq" className={subLinkClass}>
                  Sık Sorulan Sorular
                </Link>
              </li>
              <li>
                <Link to="/#contact" className={subLinkClass}>
                  İletişime Geç
                </Link>
              </li>
            </ul>
          </div>

          {/* PORTECO */}
          <div className="flex flex-col gap-2">
            <Link to="/how" className={headingClass + " " + columnLinkClass}>
              PORTECO
            </Link>
          </div>

          {/* Blog */}
          <div className="flex flex-col gap-2">
            <Link to="/blog" className={headingClass + " " + columnLinkClass}>
              Blog
            </Link>
          </div>

          {/* Giriş Yap / Panel */}
          <div className="flex flex-col gap-2">
            {isLoggedIn ? (
              <Link
                to="/dashboard"
                className={headingClass + " " + columnLinkClass}
              >
                Panel
              </Link>
            ) : (
              <Link
                to="/login"
                className={headingClass + " " + columnLinkClass}
              >
                Giriş Yap
              </Link>
            )}
          </div>
        </div>
      </Container>

      <Container
        className={`relative z-10 pb-8 text-xs ${
          isGradient ? "text-white/60" : "text-neutral-gray"
        }`}
      >
        <p>
          © {year} ECO Enerji{" "}
          <span className="mx-1">made by</span>
          <a
            href="https://ideova.com.tr"
            target="_blank"
            rel="noreferrer"
            className={
              (isGradient
                ? "text-white/70 hover:text-white"
                : "text-brand-blueDark hover:opacity-80") + " transition"
            }
          >
            IDEOVA
          </a>
        </p>
      </Container>
    </footer>
  );
}
