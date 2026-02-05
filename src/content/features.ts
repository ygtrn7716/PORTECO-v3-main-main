// src/content/features.ts
export type FeatureHero = {
  image?: string;                 // varsayılan: image alanı
  align?: "left" | "center" | "right"; // metin kutusunun konumu
  tint?: "dark" | "light";        // görsel üstü degrade tonu
};

export type FeatureSection = {
  heading: string;
  body: string;
  bullets?: string[];
  image?: string;                 // istersen bölüm içinde görsel
};

export type FeatureItem = {
  slug: string;
  title: string;
  desc: string;
  image: string;                  // kart görseli (detayda da hero olur)
  hero?: FeatureHero;
  sections?: FeatureSection[];
  cta?: { label: string; href: string };
};

export const FEATURES: FeatureItem[] = [
  {
    slug: "perakende-satis",
    title: "Elektrik Perakende Satış Hizmeti",
    desc: "İndirimli Elektrik",
    image: "/features/satis.png",
    hero: { align: "left", tint: "dark" },
    sections: [
      {
        heading: "Neden Perakende Satış Hizmeti?",
        body:
          "Tüketim profilinize göre güncel birim fiyat analizleri yapıp indirimli tedarik imkânı sunuyoruz. Sözleşme öncesi tasarruf simülasyonu ile riskinizi minimize ederiz.",
        bullets: [
          "Tüketim kırılımına göre teklif",
          "Ceza/taahhüt maddeleri analizi",
          "Aylık fatura doğrulama ve rapor"
        ]
      },
      {
        heading: "Süreç Nasıl İşler?",
        body:
          "Yetkilendirme, veri toplama, teklif kıyaslama ve sözleşme yönetimi aşamalarını şeffaf şekilde yürütürüz."
      }
    ],
    cta: { label: "Teklif Al", href: "/iletisim" }
  },
  {
    slug: "ges",
    title: "Güneş Enerjisi Sistemi Kurulumu",
    desc: "Güneş Enerjisi Hakkında Her Şey",
    image: "/features/ges.png",
    hero: { align: "right", tint: "dark" },
    sections: [
      {
        heading: "Çatı ve Arazi GES",
        body:
          "Anahtar teslim EPC: keşif, projelendirme, resmi süreçler, montaj ve devreye alma. Üretim-kullanım dengesine göre optimum kurulu güç planları."
      },
      {
        heading: "Finans ve Geri Dönüş",
        body:
          "Ödeme planı, KDV avantajları ve öz tüketimde geri dönüş süresi hesaplarıyla yatırım kararını netleştiriyoruz.",
        bullets: ["Simülasyon dosyası", "Marka/komponent seçimi", "Bakım & izleme"]
      }
    ],
    cta: { label: "Ücretsiz Keşif Talep Et", href: "/iletisim" }
  },
  {
    slug: "portal",
    title: "PORTECO",
    desc: "Gereksiz Faturalar Ödemeye Son!",
    image: "/features/porteco.png",
    hero: { align: "left", tint: "dark" },
    sections: [
      {
        heading: "Akıllı Enerji Portalı",
        body:
          "Saatlik tüketim, maliyet ve sapma takibini tek ekranda toplar. EPİAŞ entegrasyonlarıyla veriler otomatik akar. Güç bedeli ve kullanım tavsiyeleri ile faturalarınızı düşürün!"
      },
      {
        heading: "Alarm & Bildirim",
        body:
          "Eşik aşımlarında ve riskli değerlere gelindiğini bildiren mail/SMS sistemi ile reaktiflerinizi takip etmenize gerek yok. Abonelik bazlı yetkilendirme ve çoklu kullanıcı."
      }
    ]
  },
  {
    slug: "tarife",
    title: "Tarife Danışmanlığı",
    desc: "OSOS/EPIAŞ ve ERP entegrasyonları.",
    image: "/features/tarifedanismanligi.png",
    hero: { align: "right", tint: "dark" },
    sections: [
      {
        heading: "Doğru Tarife Seçimi",
        body:
          "Mesken, ticarethane, sanayi… Reaktif/kapasitif cezaları ve talep gücü yönetimiyle toplam maliyeti düşürüyoruz."
      }
    ]
  },
  {
    slug: "verimlilik",
    title: "Enerji Verimliliği",
    desc: "Enerji Etüdü ile tüketimlerinizi optimize edin!",
    image: "/features/verimlilik.png",
    hero: { align: "left", tint: "dark" },
    sections: [
      {
        heading: "Etüt & Uygulama",
        body:
          "Hat bazlı ölçüm, kayıp-kaçak analizi, motor/kompresör/aydınlatma optimizasyonu ve yatırım önerileri."
      }
    ]
  },
  {
    slug: "yes",
    title: "Yeşil Enerji Sertifikası Tedariği",
    desc: "Saatler içinde devreye alın.",
    image: "/features/yesilenerji.png",
    hero: { align: "left", tint: "dark" },
    sections: [
      {
        heading: "I-REC / YEK-G",
        body:
          "Tüketiminizi gönüllü sertifikalarla yeşilleştirip karbon ayak izinizi düşürün. Raporlanabilir ve denetlenebilir dokümantasyon."
      }
    ]
  },

  {
    slug: "iso50001",
    title: "ISO 50001 Danışmanlığı",
    desc: "--",
    image: "/features/iso.png",
    hero: { align: "center", tint: "light" },
    sections: [
      {
        heading: "Enerji Yönetim Sistemi",
        body:
          "Politika, hedef, ölçümleme (EnPI), iç denetim ve sürekli iyileştirme döngüsünü kuruyoruz."
      }
    ]
  },
  
];
