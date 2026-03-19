export type BlogCtaCardData = {
  id: string;
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  gradient: string;
  iconName: string;
};

export const blogSidebarCards: BlogCtaCardData[] = [
  {
    id: "porteco-demo",
    title: "Enerji Tüketiminizi Takip Edin",
    description:
      "PORTECO ile saatlik tüketim, fatura hesaplama ve reaktif güç takibi yapın.",
    buttonText: "Ücretsiz Demo İsteyin",
    buttonLink: "/iletisim",
    gradient: "from-blue-500 to-cyan-400",
    iconName: "Zap",
  },
  {
    id: "enerji-analiz",
    title: "Ücretsiz Enerji Analizi",
    description:
      "Tesisinize özel tarife optimizasyonu ve tasarruf raporu hazırlayalım.",
    buttonText: "Analiz Talep Edin",
    buttonLink: "/iletisim",
    gradient: "from-emerald-500 to-teal-400",
    iconName: "BarChart3",
  },
  {
    id: "reaktif-uyari",
    title: "Reaktif Ceza Riski Var mı?",
    description:
      "Anlık reaktif güç oranlarınızı izleyin, ceza yemeden önlem alın.",
    buttonText: "Detaylı Bilgi",
    buttonLink: "/iletisim",
    gradient: "from-orange-500 to-amber-400",
    iconName: "AlertTriangle",
  },
];
