-- ============================================================
-- Migration 003: notification_channels → user_phone_numbers veri taşıma
-- Mevcut telefon numaralarını yeni tabloya kopyalar
-- Boş veya null olanları atlar
-- ============================================================

insert into public.user_phone_numbers (user_id, phone_number, label, is_active, receive_warnings, receive_alerts)
select
  nc.user_id,
  nc.phone,
  'Ana Telefon',           -- varsayılan etiket
  coalesce(nc.sms_enabled, true),  -- mevcut sms_enabled durumu → is_active
  true,                    -- sarı bölge uyarıları varsayılan açık
  true                     -- kırmızı bölge uyarıları varsayılan açık
from public.notification_channels nc
where nc.phone is not null
  and trim(nc.phone) <> ''
on conflict (user_id, phone_number) do nothing;  -- zaten varsa atla
