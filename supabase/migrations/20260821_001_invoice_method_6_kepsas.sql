-- Aşama 2L — Metod 6 (Kepsaş).
--
-- Metod 1 tabanının ekonomik olarak birebir aynısı; TEK FARK SUNUM: "Önceki
-- Dönem YEKDEM Mahsubu" ayrı bir post-total satır olarak DEĞİL, ÇIPLAK tutar
-- (fark × KBK × mahsupDönemiTüketim) olarak enerji birim fiyatına GÖMÜLÜR. Adder
-- BTV matrahına + KDV'ye doğal girer; ödenecek toplam metod 1 ile özdeş kalır.
--
-- ⚠️ id 5 ZATEN İpragaz'a (net metod) bağlı — Kepsaş id 6'dır. invoice_methods /
-- invoice_companies.id/method_id üzerinde CHECK kısıtı yok (yalnız FK); seed yeterli
-- (20260721_001 / 20260807_001 emsali).

insert into public.invoice_methods (id, name, description) values
  (6, 'Metod 6', 'Kepsaş: Metod 1 tabanı; Önceki Dönem YEKDEM Mahsubu ayrı satır yerine çıplak tutar olarak enerji birim fiyatına gömülür (BTV+KDV''ye doğal girer, ödenecek toplam metod 1 ile özdeş).')
on conflict (id) do nothing;

insert into public.invoice_companies (key, display_name, method_id) values
  ('kepsas', 'Kepsaş', 6)
on conflict (key) do nothing;

-- Pilot: nurdogal. provider DEĞİŞMEZ (kcetas kalır); yalnız fatura firması Kepsaş olur.
update public.user_integrations
   set invoice_from = 'kepsas'
 where user_id = 'e3abd7e1-ef7f-4777-883c-34aa0649ad01';

-- Replay determinizmi (bit-identik): enerji fiyatına gömülen ÇIPLAK YEKDEM
-- adder'ı ayrı kolonda damgalanır. Metod 6 dışında NULL. Metod 6 yazımında
-- yekdem_mahsup=0 + embedded_yekdem_adder=<çıplak> → recompute çift saymaz.
alter table public.invoice_snapshots
  add column if not exists embedded_yekdem_adder numeric;

comment on column public.invoice_snapshots.embedded_yekdem_adder is
  'Metod 6 (Kepsaş): enerji birim fiyatına gömülen çıplak (vergi öncesi) YEKDEM mahsup tutarı (TL). Diğer metodlarda NULL.';
