-- ============================================================
-- Migration 006: ges_sync_log tablosu
-- Senkronizasyon logları
-- ============================================================

create table if not exists public.ges_sync_log (
  id              uuid primary key default gen_random_uuid(),
  credential_id   uuid references public.ges_credentials(id) on delete set null,
  ges_plant_id    uuid references public.ges_plants(id) on delete set null,
  sync_type       text not null,                -- 'plant_discovery','daily_energy','snapshot'
  status          text not null,                -- 'success','failed'
  error_message   text,
  records_synced  int default 0,
  started_at      timestamptz default now(),
  completed_at    timestamptz
);

-- Hızlı sorgulama için indeksler
create index if not exists idx_ges_sync_log_credential_id
  on public.ges_sync_log(credential_id);

create index if not exists idx_ges_sync_log_started_at
  on public.ges_sync_log(started_at);
