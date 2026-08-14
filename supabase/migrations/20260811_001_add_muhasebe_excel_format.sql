-- Muhasebe Excel çıktı formatı — müşteri bazlı sunum varyantı (hesaplama değişmez).
-- standard = varsayılan Girdi/Çıktı raporu; penguen_tahakkuk = Penguen Gıda özel
-- tahakkuk görünümü (yalnız Metot 2). Text (boolean değil): ileride başka müşteri
-- kendi formatını isterse yeni değer eklenir.

alter table public.subscription_settings
  add column if not exists muhasebe_excel_format text not null default 'standard';

alter table public.subscription_settings
  add constraint subscription_settings_muhasebe_excel_format_chk
  check (muhasebe_excel_format in ('standard','penguen_tahakkuk'));

comment on column public.subscription_settings.muhasebe_excel_format is
  'Muhasebe Excel cikti formati. standard = varsayilan Girdi/Cikti raporu. penguen_tahakkuk = Penguen Gida ozel tahakkuk gorunumu (yalniz Metot 2).';
