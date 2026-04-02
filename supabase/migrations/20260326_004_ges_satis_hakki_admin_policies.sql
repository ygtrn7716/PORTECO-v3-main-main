-- Admin RLS policy'leri: ges_satis_hakki tablosu

-- Adminler tüm kayıtları görebilir
create policy "admins_select_all_ges_satis_hakki"
  on public.ges_satis_hakki
  for select
  using (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );

-- Adminler yeni kayıt ekleyebilir
create policy "admins_insert_ges_satis_hakki"
  on public.ges_satis_hakki
  for insert
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );

-- Adminler kayıtları güncelleyebilir
create policy "admins_update_ges_satis_hakki"
  on public.ges_satis_hakki
  for update
  using (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );
