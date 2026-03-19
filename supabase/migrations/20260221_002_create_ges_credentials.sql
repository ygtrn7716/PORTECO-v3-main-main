-- ============================================================
-- Migration 002: ges_credentials tablosu
-- Kullanıcıların GES sağlayıcı giriş bilgileri
-- Bir kullanıcının birden fazla provider'da hesabı olabilir
-- ============================================================

create table if not exists public.ges_credentials (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider_id     int not null references public.ges_providers(id),
  username        text not null,
  password_enc    text not null,                -- şifrelenmiş
  api_token       text,                         -- Provider API token
  provider_user_id text,                        -- Provider'daki user id
  is_active       boolean default true,
  last_sync_at    timestamptz,
  sync_status     text default 'pending',       -- 'pending','syncing','success','failed'
  sync_error      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint uq_ges_credentials_user_provider unique (user_id, provider_id)
);

-- Hızlı sorgulama için indeks
create index if not exists idx_ges_credentials_user_id
  on public.ges_credentials(user_id);

-- updated_at otomatik güncelleme trigger'ı (fonksiyon zaten mevcut)
create trigger trg_ges_credentials_updated_at
  before update on public.ges_credentials
  for each row
  execute function public.set_updated_at();
