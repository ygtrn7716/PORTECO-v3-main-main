// src/components/layout/Header.tsx
import { useState, useEffect } from "react";
import type { MouseEvent } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import Container from "./Container";
import { STR } from "@/content/strings";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Menu, X } from "lucide-react";

export default function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const isHow = pathname.startsWith("/how");
  const [open, setOpen] = useState(false);

  const { session, loading } = useSession();
  const isLoggedIn = !!session;

  const hasDarkHero = isHome || isHow;

  const HEADER_H = 64;
  const FADE_SPAN = 32;
  const [whiteAlpha, setWhiteAlpha] = useState(0);

  const { isAdmin, loading: adminLoading } = useIsAdmin();

  useEffect(() => {
    if (!hasDarkHero) {
      setWhiteAlpha(1);
      return;
    }

    const getHeroEl = () =>
      document.getElementById("hero-section") ||
      document.getElementById("how-hero") ||
      (document.querySelector("[data-hero-host]")?.closest("section") as HTMLElement | null);

    const update = () => {
      const el = getHeroEl();
      if (!el) {
        setWhiteAlpha(1);
        return;
      }

      const heroH = el.offsetHeight;
      const end = Math.max(heroH - HEADER_H, 1);
      const start = Math.max(end - FADE_SPAN, 0);
      const y = window.scrollY;

      let a = (y - start) / (end - start);
      if (!Number.isFinite(a)) a = 0;
      a = Math.min(1, Math.max(0, a));
      setWhiteAlpha(a);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [hasDarkHero, pathname]);

  const onDark = hasDarkHero ? whiteAlpha < 0.5 : false;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-2 py-2 text-[15px] md:text-base font-medium transition-colors ${
      onDark
        ? "text-white/80 hover:text-white"
        : "text-neutral-gray hover:text-brand-blueDark"
    } ${isActive ? (onDark ? "text-white" : "text-brand-blueDark") : ""}`;

  const handleBrandClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setOpen(false);

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

  const sectionLinkClass =
    "px-2 py-2 text-[15px] md:text-base font-medium transition-colors " +
    (onDark
      ? "text-white/80 hover:text-white"
      : "text-neutral-gray hover:text-brand-blueDark");

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setOpen(false);
    navigate("/");
  };

  return (
    <header
      className="fixed top-0 inset-x-0 z-50"
      style={{
        backgroundColor: `rgba(8,17,27, ${1 - whiteAlpha})`,
        ...(whiteAlpha > 0 && {
          background: `linear-gradient(rgba(8,17,27,${1 - whiteAlpha}), rgba(255,255,255,${whiteAlpha}))`,
          backdropFilter: "saturate(180%) blur(6px)",
          borderBottom: "1px solid rgba(0,0,0,0.10)",
        }),
      }}
    >
      <Container
        className="relative z-10 max-w-7xl
        !pr-3 md:!pr-4 lg:!pr-6 xl:!pr-8 2xl:!pr-10
        !pl-1 md:!pl-2 lg:!pl-3 xl:!pl-4 2xl:!pl-4
        flex h-16 items-center justify-between"
      >
        {/* SOL: ECO Enerji + desktop nav */}
        <div className="flex items-center gap-8">
          <button
            id="nav-brand"
            type="button"
            onClick={handleBrandClick}
            className="flex items-center focus:outline-none cursor-pointer"
            aria-label="ECO Enerji anasayfa"
          >
            <div className="relative h-8 md:h-9 lg:h-10">
              <img
                src="/features/eco-logo-dark.png?v=1"
                alt="ECO Enerji"
                className={`block h-full w-auto transition-opacity duration-300 ${onDark ? "opacity-100" : "opacity-0"}`}
              />
              <img
                src="/features/eco-logo-light.png?v=1"
                alt="ECO Enerji"
                className={`absolute inset-0 h-full w-auto transition-opacity duration-300 ${onDark ? "opacity-0" : "opacity-100"}`}
              />
            </div>
          </button>

          {/* DESKTOP NAV */}
          <nav className="hidden md:flex items-center gap-5">
            <Link to="/#features" className={sectionLinkClass} onClick={() => setOpen(false)}>
              {STR.nav.features}
            </Link>
            <Link to="/#faq" className={sectionLinkClass} onClick={() => setOpen(false)}>
              {STR.nav.faq}
            </Link>
            <Link to="/#about" className={sectionLinkClass} onClick={() => setOpen(false)}>
              {STR.nav.about}
            </Link>
            <NavLink to="/blog" className={linkClass} onClick={() => setOpen(false)}>
              Blog
            </NavLink>
            {!loading && isLoggedIn && (
              <NavLink to="/dashboard" className={linkClass} onClick={() => setOpen(false)}>
                Panel
              </NavLink>
            )}
            {!adminLoading && isLoggedIn && isAdmin && (
              <NavLink to="/dashboard/admin" className={linkClass} onClick={() => setOpen(false)}>
                Admin
              </NavLink>
            )}
          </nav>
        </div>

        {/* SAG: CTA + hamburger */}
        <div className="flex items-center gap-3">
          {/* Desktop CTA */}
          <div id="nav-cta" className="hidden md:block">
            {!loading &&
              (isLoggedIn ? (
                <button
                  onClick={handleLogout}
                  className={`inline-flex h-9 items-center rounded-md px-4 text-xs font-medium transition-colors ${
                    onDark
                      ? "text-white border border-white/30 hover:bg-white/10"
                      : "text-brand-blue border border-brand-blue hover:bg-neutral-lightBlue"
                  }`}
                >
                  Cikis Yap
                </button>
              ) : (
                <Link
                  to="/login"
                  className={`inline-flex h-9 items-center rounded-md px-4 text-xs font-medium transition-colors ${
                    onDark
                      ? "text-white border border-white/30 hover:bg-white/10"
                      : "text-brand-blue border border-brand-blue hover:bg-neutral-lightBlue"
                  }`}
                  onClick={() => setOpen(false)}
                >
                  Giris Yap
                </Link>
              ))}
          </div>

          {/* Mobile hamburger */}
          <button
            className={`md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
              onDark ? "border-white/30 text-white" : "border-black/10 text-neutral-700"
            }`}
            aria-label="Menuyu ac"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </Container>

      {/* MOBILE DROPDOWN */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          open ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        } ${onDark ? "bg-black/60 backdrop-blur" : "bg-white"} border-t ${
          onDark ? "border-white/10" : "border-black/10"
        }`}
      >
        <Container className="max-w-7xl !px-3 md:!px-4 lg:!px-6 xl:!px-8 2xl:!px-10 py-2">
          <nav className="flex flex-col items-center text-center">
            <Link to="/#features" className={sectionLinkClass} onClick={() => setOpen(false)}>
              {STR.nav.features}
            </Link>
            <Link to="/#faq" className={sectionLinkClass} onClick={() => setOpen(false)}>
              {STR.nav.faq}
            </Link>
            <Link to="/#about" className={sectionLinkClass} onClick={() => setOpen(false)}>
              {STR.nav.about}
            </Link>
            <NavLink to="/blog" className={linkClass} onClick={() => setOpen(false)}>
              Blog
            </NavLink>
            {!loading && isLoggedIn && (
              <NavLink to="/dashboard" className={linkClass} onClick={() => setOpen(false)}>
                Panel
              </NavLink>
            )}
            {!adminLoading && isLoggedIn && isAdmin && (
              <NavLink to="/dashboard/admin" className={linkClass} onClick={() => setOpen(false)}>
                Admin
              </NavLink>
            )}

            {/* Auth CTA (mobile) */}
            <div className="pt-2 w-full flex justify-center">
              {!loading &&
                (isLoggedIn ? (
                  <button
                    onClick={() => {
                      setOpen(false);
                      handleLogout();
                    }}
                    className={`w-full inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-medium transition-colors ${
                      onDark
                        ? "text-white border border-white/30 hover:bg-white/10"
                        : "text-brand-blue border border-brand-blue hover:bg-neutral-lightBlue"
                    }`}
                  >
                    Cikis Yap
                  </button>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className={`w-full inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-medium transition-colors ${
                      onDark
                        ? "text-white border border-white/30 hover:bg-white/10"
                        : "text-brand-blue border border-brand-blue hover:bg-neutral-lightBlue"
                    }`}
                  >
                    Giris Yap
                  </Link>
                ))}
            </div>
          </nav>
        </Container>
      </div>
    </header>
  );
}
