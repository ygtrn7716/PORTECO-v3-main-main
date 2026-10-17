// src/pages/admin/OsbAylikFiyatlarAdmin.tsx
//
// Metod 8 (Kayseri OSB) — OSB aylık enerji birim fiyatı (P) ve YEKDEM fark birim fiyatı.
// Fatura hesabı fatura ayının satırını okur; yoksa en yakın ÖNCEKİ ayın P'si "tahmini fiyat"
// olarak kullanılır (YEKDEM farkı 0); hiç satır yoksa fatura görünür hatayla hesaplanmaz.
// Okuma tüm oturumlara açık (müşteri faturası tarayıcıda hesaplanır), yazma yalnız admin (RLS).

import TableManager from "@/components/admin/TableManager";

export default function OsbAylikFiyatlarAdmin() {
  return (
    <TableManager
      cfg={{
        title: "OSB Aylık Fiyatları (Metod 8)",
        table: "osb_aylik_fiyatlar",
        matchKeys: ["company_key", "period_year", "period_month"],
        orderBy: { key: "period_year", asc: false },
        filters: [
          { key: "period_year", label: "Yıl", type: "period_year" },
          { key: "period_month", label: "Ay", type: "period_month" },
        ],
        columns: [
          {
            key: "company_key",
            label: "firma",
            type: "enum",
            optionsFrom: {
              table: "invoice_companies",
              valueKey: "key",
              labelKey: "display_name",
              orderBy: "key",
            },
          },
          { key: "period_year", label: "yıl", type: "number" },
          { key: "period_month", label: "ay", type: "number" },
          { key: "enerji_birim_fiyati", label: "enerji birim fiyatı (TL/kWh)", type: "number" },
          { key: "yekdem_fark_birim_fiyati", label: "YEKDEM fark birim fiyatı (TL/kWh)", type: "number" },
          { key: "note", label: "not", type: "text" },
          { key: "updated_at", label: "updated_at", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
