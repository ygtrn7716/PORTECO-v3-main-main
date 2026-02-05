// src/pages/Home.tsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Hero from "@/components/hero/Hero";
import SmartPortal from "@/components/sections/SmartPortal";
import Features from "@/components/sections/FeaturesSection";
import PartnersSection from "@/components/sections/PartnersSection";
import FAQSection from "@/components/sections/FAQSection";
import AboutUs from "@/components/sections/AboutUs";
import ContactUs from "@/components/sections/ContactUs";

export default function Home() {
  const location = useLocation();

  // Hero'yu scroll ile yumuşakça soldur
  useEffect(() => {
    const onScroll = () => {
      const vh = window.innerHeight || 1;
      const p = Math.min(1, Math.max(0, window.scrollY / (vh * 0.9))); // 0→1
      const val = (1 - p).toFixed(3);
      document.documentElement.style.setProperty("--hero-opacity", val);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // URL hash değişince ilgili bölüme smooth scroll
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1); // "#services" -> "services"
    const el = document.getElementById(id);
    if (!el) return;

    const HEADER_OFFSET = 72; // fixed header yüksekliği

    // Layout otursun diye bir tık gecikme
    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const offsetTop = rect.top + window.scrollY - HEADER_OFFSET;
      window.scrollTo({ top: offsetTop, behavior: "smooth" });
    }, 50);
  }, [location]);

  return (
    <div className="relative">
      {/* ==== GLOBAL BACKGROUND LAYERS ==== */}
      <div className="fixed inset-0 -z-10">
        {/* 1) koyu taban */}
        <div className="absolute inset-0 bg-[#08111B]" />
        {/* 2) hero görseli (sayfanın genelinde) */}
        {/* <div className="absolute inset-0 bg-[url('/dashboard-icons/ecologo.png')] bg-cover bg-center opacity-60" /> */}
        {/* 3) renk degrade */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#08111B] via-[#0B1C33]/70 to-[#0A66FF]/20" />
        {/* 4) sağ parlama (soft glow) */}
        <div
          className="absolute -right-40 top-1/4 h-[60vh] w-[60vw] rounded-full blur-[120px] opacity-40"
          style={{
            background:
              "radial-gradient(closest-side, #0A66FF, transparent 70%)",
          }}
        />
      </div>

      {/* HERO */}
      <Hero />

      {/* Beyaz sheet + curved fade */}
      <div className="relative z-10 -mt-8 rounded-t-[48px] shadow-[0_-2px_20px_rgba(0,0,0,0.28)]">
        <div className="rounded-t-[48px] bg-white overflow-hidden">
          {/* PORTeco lead */}
          <section id="porteco">
            <SmartPortal />
          </section>

          {/* Hizmetlerimiz */}
          <section id="features">
            <Features />
          </section>

          {/* Birlikte çalıştığımız kurumlar */}
          <PartnersSection />

          {/* SSS – kendi içinde id="faq" var, o yüzden tekrar sarmadım */}
          <FAQSection />

          {/* Hakkımızda / “What makes us special” */}
          <section id="about">
            <AboutUs />
          </section>

          {/* İletişim */}
          <section id="contact">
            <ContactUs />
          </section>
        </div>
      </div>
    </div>
  );
}
