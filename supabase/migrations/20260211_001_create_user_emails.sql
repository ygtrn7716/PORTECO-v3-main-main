-- ============================================================
-- Migration: user_emails tablosu
-- Kullanicilarin birden fazla email adresi kaydetmesini saglar
-- ============================================================

create table if not exists public.user_emails (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  email            text not null,
  label            text not null default 'Birincil',
  is_active        boolean not null default true,
  receive_warnings boolean not null default true,
  receive_alerts   boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint uq_user_email unique (user_id, email)
);

-- Hizli sorgulama icin indeks
create index if not exists idx_user_emails_user_id
  on public.user_emails(user_id);

-- updated_at otomatik guncelleme trigger'i
-- set_updated_at fonksiyonu zaten user_phone_numbers migration'inda tanimli
create trigger trg_user_emails_updated_at
  before update on public.user_emails
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- RLS (Row Level Security) Politikalari
-- ============================================================

alter table public.user_emails enable row level security;

-- Kullanicilar kendi emaillerini gorebilir
create policy "users_select_own_emails"
  on public.user_emails
  for select
  using (auth.uid() = user_id);

-- Kullanicilar kendi emaillerini ekleyebilir
create policy "users_insert_own_emails"
  on public.user_emails
  for insert
  with check (auth.uid() = user_id);

-- Kullanicilar kendi emaillerini guncelleyebilir
create policy "users_update_own_emails"
  on public.user_emails
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Kullanicilar kendi emaillerini silebilir
create policy "users_delete_own_emails"
  on public.user_emails
  for delete
  using (auth.uid() = user_id);

-- Adminler her seyi gorebilir
create policy "admins_select_all_emails"
  on public.user_emails
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );
