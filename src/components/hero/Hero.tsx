// src/components/hero/Hero.tsx
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

const PARALLAX = {
  RELEASE_OFFSET: 120,
  TRANSLATE_PX: 40,
  FADE_MULT: 1.2,
};

// ⚠️ LOGO
const LOGO_SRC = "/features/ecologo.png";

export default function Hero() {
  const [t, setT] = useState(0);

  useEffect(() => {
    const el = document.getElementById("hero-section") as HTMLDivElement | null;
    if (!el) return;

    const onScroll = () => {
      const start = el.offsetTop;
      const view = window.innerHeight;
      const HEADER = 64;
      const hold = (el.offsetHeight - (view - HEADER)) - PARALLAX.RELEASE_OFFSET;
      const end = start + Math.max(hold, 1);
      const y = window.scrollY;

      let p = (y - start) / (end - start);
      if (!Number.isFinite(p)) p = 0;
      p = Math.min(1, Math.max(0, p));
      setT(p);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const fade = 1 - Math.min(1, t * PARALLAX.FADE_MULT);
  const translate = Math.round(t * PARALLAX.TRANSLATE_PX);

  return (
    <section id="hero-section" className="relative h-[160vh] md:h-[180vh]">
      <div className="sticky top-16 h-[calc(100vh-64px)] bg-[#08111B] overflow-hidden">
        <div className="relative h-full">
          {/* ==== SPOTLIGHT GLOW (#005EBA) – HERO'NUN İÇİNDE ==== */}
          <div
            className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[126px] -translate-x-1/2 rounded-full blur-[160px] opacity-80"
            style={{
              background:
                "radial-gradient(circle, rgba(0,94,186,0.95), rgba(0,94,186,0.4) 40%, transparent 70%)",
            }}
          />

          {/* İstersen hafif alt glow da olsun diye, hero'nun alt kısmına ikinci bir yumuşak spot: */}
          <div
            className="pointer-events-none absolute bottom-[-200px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-[180px] opacity-35"
            style={{
              background:
                "radial-gradient(circle, rgba(0,94,186,0.8), transparent 70%)",
            }}
          />

          {/* === DEVASA ARKA PLAN LOGO (YAZILARIN ARKASINDA) === */}
          <div className="pointer-events-none select-none absolute inset-0 z-10 hidden md:block">
            <div
              className="absolute top-[67%] right-[4vw]"
              style={{
                width: "clamp(800px, 60vw, 1600px)",
                transform: `translateY(calc(-50% + ${Math.round(
                  -translate * 0.4
                )}px))`,
                willChange: "transform",
                opacity: 0.9,
              }}
            >
              <img
                src={LOGO_SRC}
                alt="Arka plan logo"
                className="block w-full h-auto object-contain drop-shadow-[0_20px_80px_rgba(10,102,255,0.25)]"
              />
            </div>
          </div>

          {/* === ARKA PLAN LOGO (MOBİL İÇİN) === */}
          <div className="pointer-events-none select-none absolute inset-0 z-10 md:hidden">
            <div
              className="absolute top-[55%] right-[-30vw]"
              style={{
                width: "clamp(520px, 115vw, 1400px)",
                transform: `translateY(calc(-50% + ${Math.round(
                  -translate * 0.35
                )}px))`,
                willChange: "transform",
              }}
            >
              <img
                src={LOGO_SRC}
                alt=""
                className="block w-full h-auto object-contain opacity-20 drop-shadow-[0_16px_64px_rgba(10,102,255,0.22)]"
              />
            </div>
          </div>

          {/* === İÇERİK === */}
          <div className="relative z-20 mx-auto max-w-7xl !px-3 md:!px-4 lg:!px-6 xl:!px-8 2xl:!px-10 h-full">
            <div className="grid grid-cols-12 gap-6 h-full items-center">
              {/* Sol metin */}
              <div className="col-span-12 lg:col-span-7 relative z-20">
                <div
                  className="max-w-3xl"
                  style={{
                    opacity: fade,
                    transform: `translateY(${translate}px)`,
                    transition: "opacity 80ms linear, transform 80ms linear",
                  }}
                >
                  <p className="text-xs md:text-sm tracking-[0.2em] text-white/70 uppercase">
                    Doğru Enerji Çözümleri ile
                  </p>
                  <h1 className="mt-4 text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight text-white">
                    Daha fazla üretin,
                    <br className="hidden md:block" />
                    daha az harcayın.
                  </h1>
                  <p className="mt-4 text-base md:text-lg text-white/70 max-w-2xl">
                    Tesisinizde enerji tüketimini gerçek zamanlı izleyin, verimsizlikleri görün ve
                    maliyetleri düşürün.
                  </p>
                  <div className="mt-8 flex items-center gap-3">
                    <Link
                      to="/#features"
                      className="inline-flex items-center rounded-md bg-[#0A66FF] px-6 py-3 text-sm font-medium text-white hover:bg-[#0a59e0] transition"
                    >
                      Enerji Çözümlerimiz
                    </Link>
                    <Link
                      to="/login"
                      className="inline-flex items-center rounded-md bg-white/10 backdrop-blur px-6 py-3 text-sm font-medium text-white hover:bg-white/20 transition border border-white/20"
                    >
                      Giriş Yap
                    </Link>
                  </div>
                </div>
              </div>

              {/* Sağ kolon boş (arka plan logo burada zaten) */}
              <div className="hidden lg:block col-span-12 lg:col-span-5" />
            </div>
          </div>
          {/* === /İÇERİK === */}
        </div>
      </div>
    </section>
  );
}
