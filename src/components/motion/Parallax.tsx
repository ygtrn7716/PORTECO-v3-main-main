import * as React from "react";

type Props = {
  children: React.ReactNode;
  /** 0.0–1.0 arası: hız katsayısı (ne kadar “fazla” yukarı çıksın) */
  strength?: number;       // default 0.35
  /** Maksimum piksel kaydırma (px) – fazla olursa yapay durur */
  maxTranslate?: number;   // default 120
  /** Wrapper tag */
  as?: React.ElementType;  // default 'div'
  className?: string;
};

function clamp(v: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v));
}

export default function Parallax({
  children,
  strength = 0.35,
  maxTranslate = 120,
  as: Tag = "div",
  className = "",
}: Props) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setReady(true);

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;

        // Bölüm görünürlüğe girdikçe 0→1 arası ilerleme
        const visible = clamp(1 - rect.top / (vh + rect.height));
        // Yukarı doğru çeviri (eksi değer)
        const t = -visible * maxTranslate * strength;

        el.style.transform = `translate3d(0, ${t}px, 0)`;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [strength, maxTranslate]);

  return (
    // will-change performansı artırır; reduced-motion için CSS’te kapatacağız
    <Tag ref={ref as any} className={`will-change-transform ${className}`}>
      {children}
    </Tag>
  );
}
