-- ============================================================
-- Migration 002: sms_logs tablosu
-- Gönderilen SMS'lerin kaydını tutar
-- ============================================================

create table if not exists public.sms_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  subscription_serno text,                      -- hangi tesis için gönderildi
  phone_number      text not null,              -- SMS gönderilen numara
  message_type      text not null,              -- reactive_warn, reactive_limit, vb.
  message_body      text not null,              -- SMS içeriği
  status            text not null default 'pending',  -- sent, failed, pending
  provider_response jsonb,                      -- İleti Merkezi API cevabı
  error_message     text,                       -- hata durumunda açıklama
  created_at        timestamptz not null default now()
);

-- Hızlı sorgulama indeksleri
create index if not exists idx_sms_logs_user_id
  on public.sms_logs(user_id);

create index if not exists idx_sms_logs_created_at
  on public.sms_logs(created_at desc);

create index if not exists idx_sms_logs_subscription_serno
  on public.sms_logs(subscription_serno);

-- ============================================================
-- RLS (Row Level Security) Politikaları
-- ============================================================

alter table public.sms_logs enable row level security;

-- Kullanıcılar kendi SMS loglarını görebilir
create policy "users_select_own_sms_logs"
  on public.sms_logs
  for select
  using (auth.uid() = user_id);

-- Insert sadece service_role (VPS cron job) tarafından yapılacak
-- Anon/authenticated kullanıcılar insert yapamaz
-- service_role key RLS'i bypass eder, bu yüzden ayrı policy gerekmez

-- Adminler tüm logları görebilir (auth.users app_metadata is_admin alanına göre)
create policy "admins_select_all_sms_logs"
  on public.sms_logs
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );
