-- ✅ 2026-10-14'te UYGULANDI (kullanıcı, MCP). Tekrar çalıştırmaya gerek yok (idempotent).
--    Doğrulama (SELECT): 10128583 / 10126953 / 9062757 → invoice_method_override 7, kbk 0.952;
--    Ağustos yekdem_gddk 1180.11 / 82.26 / 51.54.
--
-- VERİ DÜZELTMESİ (migration DEĞİL) — Niğde As Beton → Metot 7 (Meram), ABONELİK BAZLI.
-- Kullanıcı tarafından MCP execute_sql ile uygulanır; supabase/migrations dışında tutulur.
--
-- Kapsam: user 77a8df85-41f9-4545-a16e-f3f53822be2c, YALNIZ 3 abonelik:
--   10128583, 10126953, 9062757  → invoice_method_override = 7, kbk = 0.952
-- invoice_companies.meram = 1 KALIR (şirket switch'i YOK): aynı şirketteki ODTÜ GV Niğde
-- (9034081) ve 10124578 Metot 1'de kalır.
--
-- ⚠️ ÖNKOŞULLAR:
--   • subscription_settings kolon kilidi tetikleyicisi (izin listesi) UYGULANMIŞ olmalı.
--   • invoice_method_override'ı okuyan frontend DEPLOY EDİLMİŞ olmalı (eski bundle override'ı
--     tanımaz → m1 hesaplar; açık sekmeler M-1 snapshot'ını m1 olarak yazabilir).
--   • 20261014075946_add_invoice_method_override uygulanmış (kolon mevcut).
-- Zaten uygulanmış olanlar (bu dosyada YOK): 9062757 / 10126953 trafo_kaybi_saatlik = 1.12 ve
-- trafo_degeri = null; 10128583 trafo_degeri = null.
--
-- Ağustos 2026 YEKDEM GDDK — MEPAŞ faturalarındaki "YEKDEM Mahsup + YEKDEM GDDK" notları
-- (invoice_line_overrides.item_key = 'yekdem_gddk', yalnız tutar):
--   serno      tutar (TL)   fatura / not
--   10126953      82,26     MEP2026001106751 · Not 21
--   10128583    1180,11     MEP2026001103027 · Not 21
--    9062757      51,54     MEP2026001105368 · Not 22
-- Eylül 2026 GDDK = 0 (satır eklenmez).
--
-- Idempotent. Snapshot'lara DOKUNMAZ: ardından Ağustos ve Eylül için 3 tesiste admin
-- "Kaydet + Snapshot'ı Yeniden Yaz" (Dashboard m1 damgalı snapshot'a kısa devre yapıyor).

begin;

-- 1) Abonelik bazlı metot + KBK
update public.subscription_settings
   set invoice_method_override = 7,
       kbk = 0.952
 where user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
   and subscription_serno in (10128583, 10126953, 9062757);

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

commit;
