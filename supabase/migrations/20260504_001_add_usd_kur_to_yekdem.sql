-- ============================================================
-- subscription_yekdem.usd_kur:
-- 10 yıl üstü (on_yil=true) tesislerin veriş fazlası satış bedeli için
-- kullanılan ay sonu USD/TL kuru.
--
-- Kural:
--   verisFazla × 0.133 USD/kWh × usd_kur (TL/USD) = TL satış bedeli
--
-- Tesis × ay başına bir değer. Admin AdminUsersPage YEKDEM sekmesinden
-- elle girer. NULL ise perakende_enerji_bedeli formülüne fallback.
-- ============================================================

ALTER TABLE public.subscription_yekdem
  ADD COLUMN IF NOT EXISTS usd_kur numeric(10,4) DEFAULT NULL;

COMMENT ON COLUMN public.subscription_yekdem.usd_kur IS
  '10 yıl üstü tesislerin veriş fazlası satış bedeli için kullanılan ay sonu USD/TL kuru (1 USD = X TL). NULL ise perakende_enerji_bedeli formülüne fallback yapılır.';
