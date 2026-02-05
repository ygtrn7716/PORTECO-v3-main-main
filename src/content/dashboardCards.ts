// src/content/dashboardCards.ts
export type DashCardKey = "consumption" | "cost" | "yekdem" | "valley" | "anomaly" | "files";

export const DASH_CARDS: {
  key: DashCardKey;
  title: string;
  subtitle?: string;
  path: string; // tıklanınca gideceği sayfa
}[] = [
  { key: "consumption", title: "Aylık Toplam Tüketim (kWh)", subtitle: "İşleyici eklenince dolacak", path: "/dashboard/consumption" },
{ key: "cost",        title: "Geçen Ay Ortalama PTF", subtitle: "TL/kWh", path: "/dashboard/ptf" },
{ key: "yekdem",      title: "Geçen Ay YEKDEM", subtitle: "TL/MWh (official / custom)", path: "/dashboard/yekdem" },
{ key: "valley",      title: "Geçen Ay Birim Fiyat", subtitle: "₺/kWh", path: "/dashboard/valley" },

  { key: "anomaly",     title: "Geçmiş Faturalar",       subtitle: "", path: "/dashboard/invoice-detail" },
  { key: "files",       title: "YEKDEM Mahsup Tutarı",        subtitle: "", path: "/dashboard/yekdem-mahsup" },
];

