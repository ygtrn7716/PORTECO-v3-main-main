-- ges_satis_hakki: tesis bazında yıllık satış hakkı limiti
create table if not exists public.ges_satis_hakki (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  subscription_serno bigint not null,
  max_satis_kwh      numeric(12,3),
  aciklama           text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint uq_ges_satis_hakki_user_serno unique (user_id, subscription_serno)
);

create index if not exists idx_ges_satis_hakki_user_id
  on public.ges_satis_hakki(user_id);

-- updated_at otomatik güncelleme (mevcut set_updated_at fonksiyonunu kullanır)
create trigger trg_ges_satis_hakki_updated_at
  before update on public.ges_satis_hakki
  for each row
  execute function public.set_updated_at();

-- RLS: kullanıcı kendi kaydını okuyabilir, yazma sadece service_role ile
alter table public.ges_satis_hakki enable row level security;

create policy "users_select_own_ges_satis_hakki"
  on public.ges_satis_hakki
  for select
  using (auth.uid() = user_id);
