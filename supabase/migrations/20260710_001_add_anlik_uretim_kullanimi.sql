-- GES Olmasaydı modülü: tesis tipine göre ham tüketim ayrımı.
-- NULL/true = behind-the-meter (mevcut davranış), false = anlık kullanım yok
-- (arazi GES / talep birleştirme). Default YOK — mevcut tesislerin davranışı
-- değişmesin diye NULL bırakılır.
alter table public.subscription_settings
  add column if not exists anlik_uretim_kullanimi boolean default null;

comment on column public.subscription_settings.anlik_uretim_kullanimi is
  'GES üretimi anlık tüketimi besliyor mu? null/true = behind-the-meter (mevcut davranış: ham tüketim = çekiş + üretim − veriş). false = anlık kullanım yok (arazi GES / talep birleştirme): ham tüketim = çekiş; GES olmasaydı fatura = veriş mahsubu ve dağıtım düzeltmesi uygulanmadan hesaplanan fatura.';
