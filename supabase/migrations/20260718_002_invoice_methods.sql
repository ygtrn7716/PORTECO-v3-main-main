-- Fatura hesaplama metodları altyapısı (Aşama 1 — DB)
-- Metod davranışları kod tarafında (TS config) tanımlanır; DB kimlik + firma→metod atamasını tutar.

-- 1) Metod tanımları
create table if not exists public.invoice_methods (
  id          smallint primary key,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 2) Tedarik firmaları + metod ataması
create table if not exists public.invoice_companies (
  key          text primary key,
  display_name text not null,
  method_id    smallint references public.invoice_methods(id),
  created_at   timestamptz not null default now(),
  constraint invoice_companies_method_required
    check (key = 'kayseri_osb' or method_id is not null)
);

-- 3) RLS (ges_providers pattern'i: herkese okuma, admin'e tam yetki)
alter table public.invoice_methods enable row level security;
alter table public.invoice_companies enable row level security;

create policy "invoice_methods_public_read" on public.invoice_methods
  for select using (true);
create policy "invoice_methods_admin_all" on public.invoice_methods
  for all using ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true);

create policy "invoice_companies_public_read" on public.invoice_companies
  for select using (true);
create policy "invoice_companies_admin_all" on public.invoice_companies
  for all using ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true);

-- 4) Seed — metodlar
insert into public.invoice_methods (id, name, description) values
  (1, 'Metod 1', 'Mevcut PortEco hesaplama motoru (standart). Sepaş bu metodu kullanır.'),
  (2, 'Metod 2', 'Uedaş hesaplama metodolojisi — detaylar kod tarafında tanımlanacak.'),
  (3, 'Metod 3', 'Tredaş hesaplama metodolojisi — detaylar kod tarafında tanımlanacak.')
on conflict (id) do nothing;

-- 5) Seed — firmalar
insert into public.invoice_companies (key, display_name, method_id) values
  ('sepas',       'Sepaş Enerji',   1),
  ('uedas',       'Uedaş',          2),
  ('tredas',      'Tredaş',         3),
  ('ipragaz',     'İpragaz Enerji', 1),
  ('kayseri_osb', 'Kayseri OSB',    null)
on conflict (key) do nothing;

-- 6) user_integrations.invoice_from (şimdilik NULLABLE — elle doldurma sonrası ayrı migration ile NOT NULL)
alter table public.user_integrations
  add column if not exists invoice_from text references public.invoice_companies(key);

comment on column public.user_integrations.invoice_from is
  'Faturayı kesen tedarik firması (invoice_companies.key). provider veri kaynağını (OSOS), invoice_from tedarikçiyi belirtir. Elle doldurma tamamlanınca NOT NULL yapılacak.';

-- 7) vhs_kayseri entegrasyonlarını otomatik etiketle (metod sistemine dahil değiller)
update public.user_integrations
   set invoice_from = 'kayseri_osb'
 where provider = 'vhs_kayseri'
   and invoice_from is null;

-- 8) invoice_snapshots'a metod izi (recompute tarihsel doğruluk için bunu kullanacak)
alter table public.invoice_snapshots
  add column if not exists invoice_method smallint,
  add column if not exists invoice_from text;

comment on column public.invoice_snapshots.invoice_method is
  'Snapshot hesaplandığı andaki fatura metodu (invoice_methods.id). NULL = metod 1 (legacy).';
