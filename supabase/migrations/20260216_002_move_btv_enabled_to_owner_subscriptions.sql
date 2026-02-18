-- ============================================================
-- Migration: btv_enabled'i subscription_settings'den
-- owner_subscriptions'a tasi (tesis bazli BTV toggle)
-- Default true = mevcut davranis korunur
-- ============================================================

-- 1) Yeni kolon ekle
alter table public.owner_subscriptions
  add column if not exists btv_enabled boolean not null default true;

-- 2) Mevcut subscription_settings verilerini backfill et
--    Her (user_id, subscription_serno) icin subscription_settings'deki
--    btv_enabled degerini owner_subscriptions'a kopyala.
--    Eslesmeyenler default true kalir.
update public.owner_subscriptions os
set btv_enabled = ss.btv_enabled
from public.subscription_settings ss
where os.user_id = ss.user_id
  and os.subscription_serno = ss.subscription_serno
  and ss.btv_enabled is not null;
