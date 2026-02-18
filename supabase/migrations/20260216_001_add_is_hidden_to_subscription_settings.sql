-- ============================================================
-- Migration: subscription_settings tablosuna is_hidden kolonu ekle
-- Kullanicilarin tesisleri dashboard filtrelerinden gizlemesini saglar
-- Default false = tum mevcut ve yeni tesisler gorunur baslar
-- ============================================================

alter table public.subscription_settings
  add column if not exists is_hidden boolean not null default false;

create index if not exists idx_subscription_settings_user_hidden
  on public.subscription_settings(user_id, is_hidden);
