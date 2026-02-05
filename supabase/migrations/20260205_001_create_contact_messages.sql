-- ============================================================
-- Migration: contact_messages tablosu
-- Web sitesi iletisim formundan gelen mesajlari saklar
-- ============================================================

create table if not exists public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  last_name    text,
  email        text not null,
  phone        text,
  message      text,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Hizli sorgulama indeksleri
create index if not exists idx_contact_messages_created_at
  on public.contact_messages(created_at desc);

create index if not exists idx_contact_messages_is_read
  on public.contact_messages(is_read);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

alter table public.contact_messages enable row level security;

-- Herkes (anon dahil) mesaj gonderebilir (insert)
create policy "anyone_can_insert_contact"
  on public.contact_messages
  for insert
  with check (true);

-- Sadece adminler gorebilir
create policy "admins_select_contact_messages"
  on public.contact_messages
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );

-- Sadece adminler guncelleyebilir (is_read toggle)
create policy "admins_update_contact_messages"
  on public.contact_messages
  for update
  using (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );
