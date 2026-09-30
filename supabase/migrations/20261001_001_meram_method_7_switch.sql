-- Meram → Metod 7 GEÇİŞİ + Niğde As Beton ayarları (tek onay, tek işlem).
--
-- ⚠️ ÖNKOŞUL: Metod 7 kodu (20260930_003 ile birlikte gelen frontend) DEPLOY EDİLMİŞ olmalı.
-- Eski bundle metod 7'yi tanımaz ve Metod 1'e düşer (coerceInvoiceMethodId) — geçiş
-- deploy'dan ÖNCE yapılırsa açık sekmeler M-1 snapshot'ını m1 olarak yeniden yazabilir.
--
-- Değerler Niğde As Beton Ağustos 2026 MEPAŞ faturalarından:
--   KBK 0,952 (3 tesis) · 10128583 OG ölçüm → aylık trafo yok (trafo_degeri null) ·
--   10126953 / 9062757 AG ölçüm → saatlik trafo kaybı 1,12 kWh (TRFKYB 833,28 = 1,12 × 744) ·
--   Ağustos "YEKDEM Mahsup + YEKDEM GDDK" notları 82,26 / 1180,11 / 51,54 TL.
-- Idempotent. Ağustos snapshot'larına DOKUNMAZ (m1 damgalı kalırlar; yeniden yazım ayrı,
-- admin "Kaydet + Snapshot'ı Yeniden Yaz" akışıyla, tesis tesis).

begin;

-- 1) As Beton tesis ayarları (user 77a8df85-41f9-4545-a16e-f3f53822be2c)
update public.subscription_settings
   set kbk = 0.952
 where user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
   and subscription_serno in (10126953, 10128583, 9062757);

update public.subscription_settings
   set trafo_degeri = null
 where user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
   and subscription_serno = 10128583;

update public.subscription_settings
   set trafo_kaybi_saatlik = 1.12
 where user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
   and subscription_serno in (10126953, 9062757);

-- 2) Ağustos 2026 YEKDEM GDDK tutarları (fatura kalem override'ı, yalnız tutar)
insert into public.invoice_line_overrides
  (user_id, subscription_serno, period_year, period_month, item_key,
   is_excluded, unit_price_override, amount_override, payload, note)
values
  ('77a8df85-41f9-4545-a16e-f3f53822be2c', 10126953, 2026, 8, 'yekdem_gddk', false, null,   82.26, null,
   'MEPAŞ MEP2026001106751 Not 21: YEKDEM Mahsup + YEKDEM GDDK'),
  ('77a8df85-41f9-4545-a16e-f3f53822be2c', 10128583, 2026, 8, 'yekdem_gddk', false, null, 1180.11, null,
   'MEPAŞ MEP2026001103027 Not 21: YEKDEM Mahsup + YEKDEM GDDK'),
  ('77a8df85-41f9-4545-a16e-f3f53822be2c',  9062757, 2026, 8, 'yekdem_gddk', false, null,   51.54, null,
   'MEPAŞ MEP2026001105368 Not 22: YEKDEM Mahsup + YEKDEM GDDK')
on conflict (user_id, subscription_serno, period_year, period_month, item_key) do update
  set is_excluded = false,
      unit_price_override = null,
      amount_override = excluded.amount_override,
      payload = null,
      note = excluded.note;

-- 3) Geçiş: Meram faturaları Metod 7 ile hesaplanır.
update public.invoice_companies
   set method_id = 7
 where key = 'meram';

commit;
