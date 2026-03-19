-- ============================================================
-- Migration 003: ges_plants tablosu
-- GES santralleri — Sync script tarafından API'den otomatik keşfedilir
-- ============================================================

create table if not exists public.ges_plants (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  credential_id       uuid not null references public.ges_credentials(id) on delete cascade,
  provider_plant_id   text not null,            -- Growatt plant_id
  plant_name          text,
  nickname            text,
  peak_power_kw       numeric,
  location            text,
  latitude            numeric,
  longitude           numeric,
  currency            text default 'TRY',
  timezone_id         int default 3,
  linked_serno        bigint,                   -- OPSİYONEL: OSOS tesis bağlantısı
  is_active           boolean default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  constraint uq_ges_plants_credential_plant unique (credential_id, provider_plant_id)
);

-- Hızlı sorgulama için indeksler
create index if not exists idx_ges_plants_user_id
  on public.ges_plants(user_id);

create index if not exists idx_ges_plants_credential_id
  on public.ges_plants(credential_id);

-- updated_at otomatik güncelleme trigger'ı
create trigger trg_ges_plants_updated_at
  before update on public.ges_plants
  for each row
  execute function public.set_updated_at();
