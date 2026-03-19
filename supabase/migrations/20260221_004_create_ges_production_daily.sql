-- ============================================================
-- Migration 004: ges_production_daily tablosu
-- Günlük GES üretim verisi
-- ============================================================

create table if not exists public.ges_production_daily (
  id              uuid primary key default gen_random_uuid(),
  ges_plant_id    uuid not null references public.ges_plants(id) on delete cascade,
  date            date not null,
  energy_kwh      numeric not null default 0,
  created_at      timestamptz default now(),
  constraint uq_ges_production_daily_plant_date unique (ges_plant_id, date)
);

-- Hızlı sorgulama için indeksler
create index if not exists idx_ges_production_daily_plant_id
  on public.ges_production_daily(ges_plant_id);

create index if not exists idx_ges_production_daily_date
  on public.ges_production_daily(date);
