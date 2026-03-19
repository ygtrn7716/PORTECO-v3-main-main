-- ============================================================
-- Migration 005: ges_snapshot tablosu
-- Anlık durum cache — Dashboard kartı buradan okur
-- ============================================================

create table if not exists public.ges_snapshot (
  id                uuid primary key default gen_random_uuid(),
  ges_plant_id      uuid not null references public.ges_plants(id) on delete cascade,
  current_power_w   numeric default 0,
  today_energy_kwh  numeric default 0,
  total_energy_kwh  numeric default 0,
  peak_power_kw     numeric default 0,
  efficiency_pct    numeric default 0,
  status            text default 'unknown',     -- 'normal','fault','offline'
  fetched_at        timestamptz default now(),
  constraint uq_ges_snapshot_plant unique (ges_plant_id)
);

-- Hızlı sorgulama için indeks
create index if not exists idx_ges_snapshot_plant_id
  on public.ges_snapshot(ges_plant_id);
