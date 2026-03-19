-- ============================================================
-- Migration 008: ges_production_hourly tablosu
-- Saatlik GES üretim verisi
-- ============================================================

create table if not exists public.ges_production_hourly (
  id              uuid primary key default gen_random_uuid(),
  ges_plant_id    uuid not null references public.ges_plants(id) on delete cascade,
  ts              timestamptz not null,       -- saat başlangıcı (ör. 09:00:00+03)
  energy_kwh      numeric not null default 0,
  avg_power_w     numeric not null default 0,
  sample_count    integer not null default 0,
  created_at      timestamptz default now(),
  constraint uq_ges_hourly_plant_ts unique (ges_plant_id, ts)
);

-- Hızlı sorgulama için indeksler
create index if not exists idx_ges_hourly_plant
  on public.ges_production_hourly(ges_plant_id);

create index if not exists idx_ges_hourly_ts
  on public.ges_production_hourly(ts);

-- RLS (ges_production_daily ile aynı pattern)
alter table public.ges_production_hourly enable row level security;

create policy "ges_production_hourly_user_select"
  on public.ges_production_hourly
  for select
  using (
    exists (
      select 1 from public.ges_plants
      where ges_plants.id = ges_production_hourly.ges_plant_id
        and ges_plants.user_id = auth.uid()
    )
  );

create policy "ges_production_hourly_admin_all"
  on public.ges_production_hourly
  for all
  using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
