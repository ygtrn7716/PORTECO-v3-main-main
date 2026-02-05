// src/content/partners.ts
export type Partner = {
  name: string;
  logo: string; // /partners/akbank.png gibi
  url?: string; // tıklanınca gideceği link
};

export const PARTNERS: Partner[] = [
  // ÖRNEKLER - bunları kendi logolarınla doldur
  {
    name: "Firma 1",
    logo: "/partners/aluminance-logo.png",
    url: "https://aluminance.com.tr/",
  },
  {
    name: "Firma 2",
    logo: "/partners/Has-Rubber-Logo.png",
    url: "https://www.hasrubber.com/en/rubber-flooring-products-hasrubber/",
  },
  {
    name: "Firma 3",
    logo: "/partners/celikyay-logo.png",
    url: "https://celikyay.com.tr/",
  },
  {
    name: "Firma 4",
    logo: "/partners/logo.png",
    url: "https://www.kahyakaucuk.com/",
  },
  {
    name: "Firma 5",
    logo: "/partners/tanrikulu-logo.png",
    url: "http://www.tanrikuludokum.com/",
  },
  {
    name: "Firma 6",
    logo: "/partners/bebhum.png",
    url: "https://www.bebehum.com/",
  },
  {
    name: "Firma 7",
    logo: "/partners/eminpilic.png",
    url: "https://www.eminpilic.com.tr/",
  },



  // istediğin kadar ekle
];
