// src/content/faq.ts
export type FAQItem = {
  id: string;          // benzersiz id (slug gibi)
  question: string;    // soru
  answer: string;      // uzun cevap (istediğin kadar satır)
  blogSlug?: string;   // /blog/:slug için (opsiyonel)
};

export const FAQ_ITEMS: FAQItem[] = [
{
    id: "porteco-nedir",
    question: "PortEco nedir, ne işe yarar?",
    answer:
      "PORTECO, ECO Enerji tarafından geliştirilen bir enerji yönetim portalıdır. " +
      "Tesisinizin saatlik tüketim verilerini OSOS üzerinden otomatik çekerek gösterge panelinde sunar.\n\n" +
      "Fatura hesaplama, reaktif güç izleme, PTF takibi, YEKDEM mahsup hesaplama ve çoklu tesis yönetimi gibi " +
      "modülleriyle enerji maliyetlerinizi tek panelden kontrol etmenizi sağlar.",
    blogSlug: "porteco-nedir",
},
  {
    id: "tasarruf-orani",
    question: "Ne kadar tasarruf edebileceğimi önceden görebilir miyim?",
    answer:
      "Evet. OSOS ve EPİAŞ şeffaflık platformundaki verileri kullanarak geçmiş tüketiminizi ve olası senaryoları modelliyoruz. " +
      "Bu sayede sözleşme imzalamadan önce, farklı fiyat ve tarife seçeneklerinde ne kadarlık bir tasarruf potansiyeliniz olduğunu görebiliyorsunuz.\n\n" +
      "ECO Enerji platformunda bu analizler aylık olarak güncellenir ve sapmalar için otomatik uyarılar alırsınız.",
    blogSlug: "/",
  },
  {
    id: "ek-yatirim-gerekir-mi",
    question: "ECO Enerji ile çalışmak için ek altyapı yatırımı yapmam gerekir mi?",
    answer:
      "Çoğu durumda hayır. Mevcut sayaç ve OSOS altyapınız üzerinden verileri okuyarak analiz yapıyoruz. " +
      "Ek bir donanım veya saha yatırımı gerekmiyor.\n\n" +
      "Sadece özel projelerde (örneğin detaylı alt kırılım takibi, bina içi alt sayaçlandırma vb.) ek sensör veya ölçüm cihazları önerebiliyoruz.",
    blogSlug: "porteco-nedir",
  },
];
