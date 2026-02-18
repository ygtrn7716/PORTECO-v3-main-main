-- ============================================================
-- Migration: email_logs tablosu
-- Gonderilen emaillerin kaydini tutar
-- ============================================================

create table if not exists public.email_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  subscription_serno text,
  email_address      text not null,
  subject            text not null,
  message_body       text not null,
  status             text not null default 'pending',
  provider_response  jsonb,
  error_message      text,
  created_at         timestamptz not null default now()
);

-- Hizli sorgulama indeksleri
create index if not exists idx_email_logs_user_id
  on public.email_logs(user_id);

create index if not exists idx_email_logs_created_at
  on public.email_logs(created_at desc);

create index if not exists idx_email_logs_subscription_serno
  on public.email_logs(subscription_serno);

-- ============================================================
-- RLS (Row Level Security) Politikalari
-- ============================================================

alter table public.email_logs enable row level security;

-- Kullanicilar kendi email loglarini gorebilir
create policy "users_select_own_email_logs"
  on public.email_logs
  for select
  using (auth.uid() = user_id);

-- Insert sadece service_role tarafindan yapilacak
-- service_role key RLS'i bypass eder

-- Adminler tum loglari gorebilir
create policy "admins_select_all_email_logs"
  on public.email_logs
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );
