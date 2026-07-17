-- ============================================================
-- Talep Birleştirme: GES üretiminin (veriş) birden çok tüketim
-- tesisine öncelik sırasıyla mahsup edilmesi için atama tablosu.
-- Atama satırı OLMAYAN GES'lerde davranış değişmez (geriye uyum).
-- ============================================================

create table if not exists public.ges_mahsup_assignments (
  id                 uuid primary key default gen_random_uuid(),
  ges_plant_id       uuid not null references public.ges_plants(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  subscription_serno bigint not null,
  priority           int not null check (priority >= 1),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Bir tesis bir listeye bir kez girer
  constraint uq_gma_plant_serno unique (ges_plant_id, subscription_serno),
  -- v1: bir tesis kullanıcı genelinde yalnız TEK listede olabilir
  -- (iki bağımsız waterfall aynı tesisin cn'ine tahsis yapıp
  --  Σalloc + excess = Σgn kimliğini bozar; ileride zincirli
  --  waterfall ile gevşetilebilir)
  constraint uq_gma_user_serno unique (user_id, subscription_serno),
  -- Reorder tek transaction'da swap yapabilsin diye deferred
  constraint uq_gma_plant_priority unique (ges_plant_id, priority)
    deferrable initially deferred
);

create index if not exists idx_gma_user_serno
  on public.ges_mahsup_assignments(user_id, subscription_serno);
create index if not exists idx_gma_plant
  on public.ges_mahsup_assignments(ges_plant_id);

create trigger trg_ges_mahsup_assignments_updated_at
  before update on public.ges_mahsup_assignments
  for each row execute function public.set_updated_at();

-- user_id, plant sahibiyle aynı olmalı (cross-user atama engeli;
-- owner_subscriptions'a composite FK bilinçli olarak eklenmedi)
create or replace function public.validate_ges_mahsup_assignment()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.ges_plants p
    where p.id = new.ges_plant_id and p.user_id = new.user_id
  ) then
    raise exception 'user_id, ges_plant sahibi ile eslesmiyor';
  end if;
  return new;
end $$;

create trigger trg_gma_validate
  before insert or update on public.ges_mahsup_assignments
  for each row execute function public.validate_ges_mahsup_assignment();

alter table public.ges_mahsup_assignments enable row level security;

-- Kullanıcı kendi satırlarını okuyabilir
create policy "gma_user_select_own" on public.ges_mahsup_assignments
  for select using (auth.uid() = user_id);

-- Admin tam erişim (mevcut konvansiyon: app_metadata.is_admin)
create policy "gma_admin_all" on public.ges_mahsup_assignments
  for all
  using ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true)
  with check ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true);

-- ============================================================
-- Reorder / renumber — TEK transaction. SECURITY DEFINER DEĞİL:
-- RLS uygulanır; admin olmayanın UPDATE'i 0 satır etkiler ve
-- fonksiyon exception atar (fiilen admin-only).
-- ============================================================
create or replace function public.set_ges_mahsup_priorities(
  p_ges_plant_id uuid,
  p_ordered_ids uuid[]
) returns void language plpgsql as $$
declare
  v_expected int;
  v_updated  int;
begin
  select count(*) into v_expected
    from public.ges_mahsup_assignments
   where ges_plant_id = p_ges_plant_id;

  if v_expected <> coalesce(array_length(p_ordered_ids, 1), 0) then
    raise exception 'ordered id sayisi mevcut atama sayisiyla uyusmuyor (% / %)',
      coalesce(array_length(p_ordered_ids, 1), 0), v_expected;
  end if;

  update public.ges_mahsup_assignments a
     set priority = x.ord
    from unnest(p_ordered_ids) with ordinality as x(id, ord)
   where a.id = x.id
     and a.ges_plant_id = p_ges_plant_id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'yetki yok veya id listesi gecersiz (% / %)', v_updated, v_expected;
  end if;
end $$;

grant execute on function public.set_ges_mahsup_priorities(uuid, uuid[]) to authenticated;
