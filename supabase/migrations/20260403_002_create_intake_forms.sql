create table public.intake_forms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Step 1
  ad_soyad text not null,
  telefon text not null,
  firma_adi text not null,
  osos_kullanici text not null,
  osos_sifre text not null,
  tesis_sayisi int not null,

  -- Step 2: stored as JSONB array of facility objects
  tesisler jsonb not null default '[]',

  -- Status for admin
  status text not null default 'yeni',
  admin_notu text,

  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

-- RLS: anyone can insert (public form), only admins can read/update
alter table public.intake_forms enable row level security;

create policy "Anyone can submit intake form"
  on public.intake_forms for insert
  with check (true);

create policy "Admins can view all intake forms"
  on public.intake_forms for select
  using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);

create policy "Admins can update intake forms"
  on public.intake_forms for update
  using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
