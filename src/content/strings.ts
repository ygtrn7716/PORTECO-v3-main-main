// Tüm metinleri tek yerden yönetelim. Yönetici sadece burayı düzenleyecek.
export const STR = {
  brand: "ECO Enerji",

  nav: {
    features: "Hizmetlerimiz",
    about: "Hakkımızda",
    how: "PORTECO",
    faq: "SSS",
    login: "Giriş Yap"
  },


  faq: {
    heading: "Sık Sorulan Sorular",
    items: [
      { q:"Veriler nasıl çekiliyor?", a:"Yetkilendirdiğiniz hesaplarla güvenli oturum kurulur; veriler periyodik olarak çekilir." },
      { q:"Veri gizliliği?", a:"Veriler şifrelenir, erişimler rol bazlıdır ve tüm işlemler kayda alınır." },
      { q:"Alarm eşiği?", a:"Tesis bazlı kurallar ve anomali skoru birlikte değerlendirilir." },
    ]
  }
} as const;