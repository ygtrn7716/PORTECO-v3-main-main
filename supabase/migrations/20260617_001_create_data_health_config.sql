-- ============================================================
-- Veri Sağlığı (Data Health) — sağlayıcı eşik konfigürasyonu
--
-- Tasarım notu: tesis→sağlayıcı eşlemesi için AYRI bir tablo
-- (subscription_providers) GEREKMEZ. owner_subscriptions.provider
-- kolonu zaten tüm tesisler için dolu ve güvenilir kaynaktır
-- (değerler: sepas, kcetas, meram, tredas). Bu yüzden bu tablo
-- doğrudan o gerçek provider değerleriyle anahtarlanır
-- (provider_key = owner_subscriptions.provider).
--
-- system_type yalnızca görsel gruplama içindir ('aril' | 'gridbox'):
--   - ARiL (sepas/kcetas): near real-time, ~2 saat kadans
--   - GridBox (meram/tredas): günde bir batch (~24 saat kadans)
-- ============================================================

create table if not exists public.data_health_providers (
  id                       uuid primary key default gen_random_uuid(),
  provider_key             text not null unique,      -- = owner_subscriptions.provider (sepas/kcetas/meram/tredas)
  display_name             text not null,             -- 'SEPAŞ (ARiL)', 'Meram (GridBox)'
  system_type              text,                      -- 'aril' | 'gridbox' (yalnızca gruplama/etiket)
  expected_period_hours    numeric not null,          -- normal kadans, ör. 2 veya 24
  healthy_threshold_hours  numeric not null,          -- gecikme < bu ise yeşil
  warning_threshold_hours  numeric not null,          -- gecikme < bu ise sarı, değilse kırmızı
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

alter table public.data_health_providers enable row level security;

-- Admin tam erişim (mevcut konvansiyon: app_metadata.is_admin)
create policy "data_health_providers_admin_all"
  on public.data_health_providers
  for all
  using ((((auth.jwt() -> 'app_metadata'::text) ->> 'is_admin'::text))::boolean = true)
  with check ((((auth.jwt() -> 'app_metadata'::text) ->> 'is_admin'::text))::boolean = true);

-- updated_at otomatik güncelleme trigger'ı (fonksiyon zaten mevcut)
create trigger trg_data_health_providers_updated_at
  before update on public.data_health_providers
  for each row
  execute function public.set_updated_at();

-- Makul varsayılanlar (owner_subscriptions.provider'daki mevcut 4 değer)
insert into public.data_health_providers
  (provider_key, display_name, system_type, expected_period_hours, healthy_threshold_hours, warning_threshold_hours)
values
  ('sepas',  'SEPAŞ (ARiL)',     'aril',     2,  6,  24),
  ('kcetas', 'KÇETAŞ (ARiL)',    'aril',     2,  6,  24),
  ('meram',  'Meram (GridBox)',  'gridbox', 24, 30, 48),
  ('tredas', 'Tredaş (GridBox)', 'gridbox', 24, 30, 48)
on conflict (provider_key) do nothing;
