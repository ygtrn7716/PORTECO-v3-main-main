// src/content/faq.ts
export type FAQItem = {
  id: string;          // benzersiz id (slug gibi)
  question: string;    // soru
  answer: string;      // uzun cevap (istediğin kadar satır)
  blogSlug?: string;   // /blog/:slug için (opsiyonel)
};

export const FAQ_ITEMS: FAQItem[] = [
  {
    id: "fatura-tasima-sureci",
    question: "Elektrik faturamı ECO Enerji'ye nasıl taşıyorum?",
    answer:
      "Öncelikle mevcut tedarikçinizden son döneme ait elektrik faturalarınızı ve tüketim bilgilerinizi bizimle paylaşıyorsunuz. " +
      "ECO Enerji ekibi, OSOS/EPİAŞ verilerinizi analiz ederek işletmenize özel bir teklif oluşturuyor.\n\n" +
      "Onayınız sonrasında sözleşme ve tedarikçi değişikliği sürecini sizin adınıza yürütüyor, kesintisiz bir geçiş sağlıyoruz. " +
      "Bu süreçte üretim veya tüketim tarafında herhangi bir aksama yaşamıyorsunuz.",
    blogSlug: "elektrik-faturasi-tasima-sureci",
  },
  {
    id: "tasarruf-orani",
    question: "Ne kadar tasarruf edebileceğimi önceden görebilir miyim?",
    answer:
      "Evet. OSOS ve EPİAŞ şeffaflık platformundaki verileri kullanarak geçmiş tüketiminizi ve olası senaryoları modelliyoruz. " +
      "Bu sayede sözleşme imzalamadan önce, farklı fiyat ve tarife seçeneklerinde ne kadarlık bir tasarruf potansiyeliniz olduğunu görebiliyorsunuz.\n\n" +
      "ECO Enerji platformunda bu analizler aylık olarak güncellenir ve sapmalar için otomatik uyarılar alırsınız.",
    blogSlug: "enerji-tasarrufu-nasil-hesaplanir",
  },
  {
    id: "ek-yatirim-gerekir-mi",
    question: "ECO Enerji ile çalışmak için ek altyapı yatırımı yapmam gerekir mi?",
    answer:
      "Çoğu durumda hayır. Mevcut sayaç ve OSOS altyapınız üzerinden verileri okuyarak analiz yapıyoruz. " +
      "Ek bir donanım veya saha yatırımı gerekmiyor.\n\n" +
      "Sadece özel projelerde (örneğin detaylı alt kırılım takibi, bina içi alt sayaçlandırma vb.) ek sensör veya ölçüm cihazları önerebiliyoruz.",
    blogSlug: "enerji-danismanligi-altyapi-gereksinimleri",
  },
];
