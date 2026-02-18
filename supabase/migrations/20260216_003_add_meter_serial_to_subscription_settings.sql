-- subscription_settings tablosuna meter_serial sutunu ekle
-- Admin panelde subscription_serno yaninda sayac numarasini gormek icin

-- 1) Sutunu ekle
alter table public.subscription_settings
  add column if not exists meter_serial text;

-- 2) owner_subscriptions'tan eslesenleri backfill et
update public.subscription_settings ss
set meter_serial = os.meter_serial
from public.owner_subscriptions os
where ss.user_id = os.user_id
  and ss.subscription_serno = os.subscription_serno
  and os.meter_serial is not null;
