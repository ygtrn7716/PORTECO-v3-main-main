-- ============================================================
-- Migration 007: GES tabloları RLS politikaları
-- ============================================================

-- =====================
-- ges_providers: herkes okuyabilir
-- =====================
alter table public.ges_providers enable row level security;

create policy "ges_providers_public_read"
  on public.ges_providers
  for select
  using (true);

create policy "ges_providers_admin_all"
  on public.ges_providers
  for all
  using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);

-- =====================
-- ges_credentials: kullanıcı kendi kayıtlarını görebilir ve ekleyebilir
-- =====================
alter table public.ges_credentials enable row level security;

create policy "ges_credentials_user_select"
  on public.ges_credentials
  for select
  using (auth.uid() = user_id);

create policy "ges_credentials_user_insert"
  on public.ges_credentials
  for insert
  with check (auth.uid() = user_id);

create policy "ges_credentials_admin_all"
  on public.ges_credentials
  for all
  using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);

-- =====================
-- ges_plants: kullanıcı kendi tesislerini görebilir
-- =====================
alter table public.ges_plants enable row level security;

create policy "ges_plants_user_select"
  on public.ges_plants
  for select
  using (auth.uid() = user_id);

create policy "ges_plants_admin_all"
  on public.ges_plants
  for all
  using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);

-- =====================
-- ges_production_daily: join ile kullanıcı kontrolü
-- =====================
alter table public.ges_production_daily enable row level security;

create policy "ges_production_daily_user_select"
  on public.ges_production_daily
  for select
  using (
    exists (
      select 1 from public.ges_plants
      where ges_plants.id = ges_production_daily.ges_plant_id
        and ges_plants.user_id = auth.uid()
    )
  );

create policy "ges_production_daily_admin_all"
  on public.ges_production_daily
  for all
  using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);

-- =====================
-- ges_snapshot: join ile kullanıcı kontrolü
-- =====================
alter table public.ges_snapshot enable row level security;

create policy "ges_snapshot_user_select"
  on public.ges_snapshot
  for select
  using (
    exists (
      select 1 from public.ges_plants
      where ges_plants.id = ges_snapshot.ges_plant_id
        and ges_plants.user_id = auth.uid()
    )
  );

create policy "ges_snapshot_admin_all"
  on public.ges_snapshot
  for all
  using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);

-- =====================
-- ges_sync_log: sadece admin
-- =====================
alter table public.ges_sync_log enable row level security;

create policy "ges_sync_log_admin_all"
  on public.ges_sync_log
  for all
  using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
