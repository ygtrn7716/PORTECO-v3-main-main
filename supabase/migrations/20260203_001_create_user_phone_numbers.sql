-- ============================================================
-- Migration 001: user_phone_numbers tablosu
-- Kullanıcıların birden fazla telefon numarası kaydetmesini sağlar
-- ============================================================

create table if not exists public.user_phone_numbers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  phone_number text not null,
  label        text not null default 'Birincil', -- kullanıcının numaraya verdiği isim (örn: "İş Telefonu")
  is_active    boolean not null default true,  -- numara aktif mi
  receive_warnings boolean not null default true,  -- sarı bölge uyarıları
  receive_alerts   boolean not null default true,  -- kırmızı bölge uyarıları
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- aynı kullanıcı aynı numarayı iki kez ekleyemesin
  constraint uq_user_phone unique (user_id, phone_number)
);

-- Hızlı sorgulama için indeks
create index if not exists idx_user_phone_numbers_user_id
  on public.user_phone_numbers(user_id);

-- updated_at otomatik güncelleme trigger'ı
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_user_phone_numbers_updated_at
  before update on public.user_phone_numbers
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- RLS (Row Level Security) Politikaları
-- ============================================================

alter table public.user_phone_numbers enable row level security;

-- Kullanıcılar kendi numaralarını görebilir
create policy "users_select_own_phones"
  on public.user_phone_numbers
  for select
  using (auth.uid() = user_id);

-- Kullanıcılar kendi numaralarını ekleyebilir
create policy "users_insert_own_phones"
  on public.user_phone_numbers
  for insert
  with check (auth.uid() = user_id);

-- Kullanıcılar kendi numaralarını güncelleyebilir
create policy "users_update_own_phones"
  on public.user_phone_numbers
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Kullanıcılar kendi numaralarını silebilir
create policy "users_delete_own_phones"
  on public.user_phone_numbers
  for delete
  using (auth.uid() = user_id);

-- Adminler her şeyi görebilir (auth.users app_metadata is_admin alanına göre)
create policy "admins_select_all_phones"
  on public.user_phone_numbers
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );
