-- Kayseri OSB → Metod 8 GEÇİŞİ (tek onay, deploy SONRASI uygulanır).
--
-- ⚠️ ÖNKOŞULLAR
--   1) Metod 8 kodu (calculateInvoiceOsb.ts, OsbInvoiceRows, OsbAylikFiyatlarAdmin …) DEPLOY
--      EDİLMİŞ olmalı. Eski bundle metod 8'i tanımaz ve Metod 1'e düşer (coerceInvoiceMethodId);
--      geçiş deploy'dan ÖNCE yapılırsa açık sekmeler M-1 snapshot'ını m1 olarak yeniden yazabilir.
--   2) 20261001_002 (osb_aylik_fiyatlar + osb_* snapshot kolonları) uygulanmış olmalı.
--   3) Fatura ayı için osb_aylik_fiyatlar satırı girilmiş olmalı (yoksa cari ay "tahmini fiyat",
--      geçmiş/billed ay görünür hata). 2026-08 satırı: 3,480765 / 0.
--
-- ⚠️ GEÇİŞTEN ÖNCE KARAR: AYTEKS Ağustos 2026 subscription_yekdem.diger_degerler
--   (105013200: 6.150 · 107183100: 28.211 · 107196200: 7.615) Metod 1 için elle girilmiş OSB
--   bedelleri gibi görünüyor; Metod 8'de bu bedeller zaten fatura KALEMİ → temizlenmezse ÇİFT sayılır.
--   Bu migration o verilere DOKUNMAZ.
--
-- Etki alanı: user_integrations.invoice_from = 'kayseri_osb' olan ve provider eşleşmesi tutan
-- entegrasyonlar (AYTEKS, INCI GIDA ×2). OĞUZHAN PLASTİK (user_integrations.provider = 'manual' ≠
-- owner_subscriptions.provider = 'vhs_kayseri') eşleşmediği için Metod 1'de KALIR.
-- Mevcut snapshot'lara DOKUNMAZ (damga-bazlı replay; yeniden yazım admin "Kaydet + Snapshot'ı
-- Yeniden Yaz" ile, tesis tesis). Idempotent.

update public.invoice_companies
   set method_id = 8
 where key = 'kayseri_osb';
