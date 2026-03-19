-- ============================================================
-- Migration 001: ges_providers tablosu
-- GES API sağlayıcı firmaları (Growatt, Huawei, Sungrow vb.)
-- ============================================================

create table if not exists public.ges_providers (
  id            serial primary key,
  name          text unique not null,           -- 'growatt', 'huawei', 'sungrow'
  display_name  text not null,                  -- 'Growatt', 'Huawei FusionSolar'
  api_base_url  text not null,                  -- 'https://server.growatt.com/v1/'
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- İlk kayıt: Growatt
insert into public.ges_providers (name, display_name, api_base_url)
values ('growatt', 'Growatt', 'https://server.growatt.com/v1/')
on conflict (name) do nothing;
