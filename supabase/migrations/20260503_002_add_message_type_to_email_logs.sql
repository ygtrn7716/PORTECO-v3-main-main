-- ============================================================
-- Migration: email_logs tablosuna message_type kolonu ekle
-- sms_logs ile sema simetrisi icin. reactive_instant_notification,
-- reactive_daily_notification gibi tip ayrimlarini destekler.
-- ============================================================

alter table public.email_logs
  add column if not exists message_type text not null default 'unknown';

create index if not exists idx_email_logs_message_type
  on public.email_logs(message_type);
