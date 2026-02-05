-- ============================================================
-- Migration: reactive_alert_state tablosu
-- Her tesis icin reaktif uyari durumunu tutar (ay bazli)
-- ============================================================

create table if not exists public.reactive_alert_state (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  subscription_serno bigint not null,
  kind               text not null check (kind in ('ri', 'rc')),
  period_ym          text not null,           -- '2026-02' formatinda
  status             text not null default 'ok' check (status in ('ok', 'warn', 'limit')),
  last_value_pct     double precision,
  last_sent_at       timestamptz,
  updated_at         timestamptz not null default now(),

  constraint uq_reactive_alert_state
    unique (user_id, subscription_serno, kind, period_ym)
);

-- Indeksler
create index if not exists idx_reactive_alert_state_user
  on public.reactive_alert_state(user_id);

create index if not exists idx_reactive_alert_state_period
  on public.reactive_alert_state(period_ym);

-- updated_at trigger (set_updated_at fonksiyonu zaten 001'de tanimli)
create trigger trg_reactive_alert_state_updated_at
  before update on public.reactive_alert_state
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table public.reactive_alert_state enable row level security;

-- Kullanicilar kendi uyari durumlarini gorebilir
create policy "users_select_own_reactive_alerts"
  on public.reactive_alert_state
  for select
  using (auth.uid() = user_id);

-- Insert/update sadece service_role (edge function) tarafindan yapilir
-- service_role RLS'i bypass eder

-- Adminler tum kayitlari gorebilir
create policy "admins_select_all_reactive_alerts"
  on public.reactive_alert_state
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );

-- Adminler guncelleyebilir
create policy "admins_update_reactive_alerts"
  on public.reactive_alert_state
  for update
  using (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );
