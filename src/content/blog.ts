// src/content/blog.ts
export type BlogCategoryId =
  | "elektrik-perakende"
  | "enerji-etudu"
  | "ges-kurulum"
  | "enerji-yonetimi";

export const BLOG_CATEGORIES: { id: BlogCategoryId; label: string }[] = [
  { id: "elektrik-perakende", label: "Elektrik Perakende" },
  { id: "enerji-etudu", label: "Enerji Etüdü" },
  { id: "ges-kurulum", label: "GES Kurulum" },
  { id: "enerji-yonetimi", label: "Enerji Yönetimi" },
];

export const BLOG_FILTERS: { id: "all" | BlogCategoryId; label: string }[] = [
  { id: "all", label: "Tümü" },
  ...BLOG_CATEGORIES,
];

export type BlogPost = {
  slug: string;
  title: string;
  summary: string;
  categoryId: BlogCategoryId;
  bannerImage: string;
  publishedAt: string; // ISO tarih
  readingMinutes: number;
  isFeatured?: boolean; // vitrindeki slider için
  body?: string[]; // opsiyonel detay içerik
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "dogru-elektrik-tarifesi-nasil-secilir",
    title: "Doğru elektrik tarifesi nasıl seçilir?",
    summary:
      "Sanayi veya ticarethane abonelerinde yanlış tarife seçimi, faturanın %10-20 oranında gereksiz şişmesine neden olabilir. Bu yazıda tarife tiplerini ve seçim kriterlerini özetledik.",
    categoryId: "elektrik-perakende",
    bannerImage: "/features/satis.png",
    publishedAt: "2025-01-10",
    readingMinutes: 6,
    isFeatured: true,
    body: [
      "Elektrik faturanızdaki en kritik kalemlerden biri, hangi tarifeden enerji satın aldığınızdır. Tek zamanlı, çok zamanlı, OSB içi/dışı, serbest tüketici ve ikili anlaşma gibi başlıklar, işletmeler için önemli maliyet farkları doğurur.",
      "Doğru tarifeyi seçerken yalnızca birim fiyatlara değil, tesisinizin gün içi yük profilinin nasıl değiştiğine bakmak gerekir. Örneğin gece ağırlıklı çalışan bir tesiste çok zamanlı tarife avantaj sağlayabilirken, gün boyu sabit yükü olan bir fabrikada tek zamanlı tarife daha mantıklı olabilir.",
      "ECO Enerji olarak OSOS ve EPİAŞ verilerini kullanarak, son 12 aydaki tüketiminizi analiz ediyor ve hangi tarife altında ne kadar tasarruf edebileceğinizi senaryolu olarak çıkarıyoruz.",
    ],
  },
  {
    slug: "tesisiniz-ges-kurulumu-icin-uygun-mu",
    title: "Tesisiniz GES kurulumu için uygun mu?",
    summary:
      "Her çatı GES için uygun değil. Statik dayanım, çatı kaplaması, gölgelenme ve tüketim profili gibi kriterler, yatırımın geri dönüş süresini doğrudan etkiler.",
    categoryId: "ges-kurulum",
    bannerImage: "/features/ges.png",
    publishedAt: "2025-01-05",
    readingMinutes: 7,
    isFeatured: true,
    body: [
      "GES yatırımına başlamadan önce atılması gereken ilk adım, çatı ve tüketim verilerinizin detaylı analizidir. Yalnızca panel gücünü hesaplamak değil, yıl içi üretim-tüketim eşleşmesini görmek gerekir.",
      "Özellikle OSOS verileri üzerinden saatlik tüketim profiliniz incelenerek, kurulacak GES'in kaç kW olması gerektiği, hangi saatlerde şebekeye satış veya çekiş olacağı senaryolarla modellenebilir.",
    ],
  },
  {
    slug: "enerji-etudu-ile-nereden-baslamali",
    title: "Enerji etüdü ile tasarrufa nereden başlanmalı?",
    summary:
      "Etüt çalışmaları sırasında, sahadaki her ekipmana tek tek bakmak yerine, en büyük tasarruf potansiyeli olan alanlardan başlamalısınız.",
    categoryId: "enerji-etudu",
    bannerImage: "/blog/banner-enerji-etudu.jpg",
    publishedAt: "2024-12-15",
    readingMinutes: 5,
    isFeatured: false,
  },
  {
    slug: "reaktif-cezalar-neden-olur-nasil-onlenir",
    title: "Reaktif cezalar neden olur, nasıl önlenir?",
    summary:
      "Reaktif güç limitlerinin aşılması, özellikle büyük motor yükü olan tesislerde sık görülen ve önlem alınmadığında ciddi maliyetler doğuran bir problemdir.",
    categoryId: "enerji-yonetimi",
    bannerImage: "/blog/banner-reaktif-ceza.jpg",
    publishedAt: "2024-11-20",
    readingMinutes: 4,
  },
  {
    slug: "osostan-alinan-verileri-nasil-okumaliyiz",
    title: "OSOS'tan alınan verileri nasıl okumalıyız?",
    summary:
      "Saatlik tüketim verileri yalnızca grafik değil, doğru okunduğunda üretim planlama ve bakım stratejisi için de önemli bir girdi sağlar.",
    categoryId: "enerji-yonetimi",
    bannerImage: "/blog/banner-osos-veri.jpg",
    publishedAt: "2024-10-05",
    readingMinutes: 5,
  },
  {
    slug: "enerji-perakende-sozlesmesi-icin-kontrol-listesi",
    title: "Enerji perakende sözleşmesi için kontrol listesi",
    summary:
      "Birim fiyat dışında sözleşmede nelere bakmalısınız? Taahhüt süresi, dengesizlik, teminat ve cezai şartlar gibi kritik maddeleri özetledik.",
    categoryId: "elektrik-perakende",
    bannerImage: "/blog/banner-sozlesme-checklist.jpg",
    publishedAt: "2024-09-18",
    readingMinutes: 6,
  },
];

export function getCategoryLabel(id: BlogCategoryId): string {
  const c = BLOG_CATEGORIES.find((c) => c.id === id);
  return c?.label ?? id;
}
