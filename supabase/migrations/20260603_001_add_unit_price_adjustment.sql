-- Birim Fiyat Manipülasyonu — tesis bazında enerji birim fiyat düzeltmesi
--
-- subscription_settings.unit_price_adjustment: tesis bazında birim fiyat düzeltmesi
-- (TL/kWh, + veya − değer alabilir). Birim fiyat normal formülüyle
-- ((PTF + YEKDEM) * KBK) hesaplandıktan SONRA bu değer eklenir (negatifse düşer).
-- null = düzeltme yok (0 kabul edilir).
--
-- ÖNEMLİ: PTF, YEKDEM ve YEKDEM mahsubu (calculateYekdemMahsup) bu değerden
-- ETKİLENMEZ. Düzeltme yalnızca faturada kullanılan enerji birim fiyatına uygulanır.

alter table public.subscription_settings
  add column if not exists unit_price_adjustment numeric default null;

comment on column public.subscription_settings.unit_price_adjustment is
  'Tesis bazında enerji birim fiyat düzeltmesi (TL/kWh, +/-). (PTF+YEKDEM)*KBK hesabından sonra eklenir. null = düzeltme yok. PTF/YEKDEM/mahsup etkilenmez.';

-- invoice_snapshots.unit_price_adjustment: audit/şeffaflık — o snapshot yazılırken
-- uygulanan düzeltme değeri. unit_price_energy alanı zaten düzeltilmiş (final) değeri
-- tuttuğu için recompute bu sütunu KULLANMAZ; yalnızca kayıt amaçlıdır.

alter table public.invoice_snapshots
  add column if not exists unit_price_adjustment numeric default null;

comment on column public.invoice_snapshots.unit_price_adjustment is
  'Audit: bu snapshot yazılırken uygulanan birim fiyat düzeltmesi (TL/kWh). unit_price_energy zaten final değeri tutar; recompute bu alanı kullanmaz.';
