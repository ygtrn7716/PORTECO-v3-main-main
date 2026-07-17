-- Fatura kalem override tablosu: admin'in tesis+ay bazinda kalem mudahaleleri.
-- Asama 1: sadece altyapi + musteri gorunumu. Admin duzenleme UI'i Asama 2.
-- Kalem anahtarlari: enerji, dagitim, btv, reaktif, guc, trafo.
-- Oncelik sirasi: is_excluded > amount_override > unit_price_override.

create table public.invoice_line_overrides (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  subscription_serno  bigint not null,
  period_year         int not null,
  period_month        int not null check (period_month between 1 and 12),
  item_key            text not null check (item_key in ('enerji','dagitim','btv','reaktif','guc','trafo')),
  is_excluded         boolean not null default false,
  unit_price_override numeric,
  amount_override     numeric,
  payload             jsonb,
  note                text,
  updated_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_invoice_line_overrides unique (user_id, subscription_serno, period_year, period_month, item_key)
);

comment on column public.invoice_line_overrides.unit_price_override is 'Yalniz enerji/dagitim icin anlamli (TL/kWh, mutlak deger)';
comment on column public.invoice_line_overrides.payload is 'Yalniz reaktif icin: {"ri_kwh": number, "rc_kwh": number} - mutlak degistirme';
comment on column public.invoice_line_overrides.is_excluded is 'Oncelik: is_excluded > amount_override > unit_price_override';
comment on column public.invoice_line_overrides.updated_by is 'Duzenleyen admin kullanicisinin auth uid degeri (Asama 2 admin UI doldurur)';

create trigger trg_invoice_line_overrides_updated_at
  before update on public.invoice_line_overrides
  for each row execute function public.set_updated_at();

alter table public.invoice_line_overrides enable row level security;

-- Kullanici kendi satirlarini okuyabilir (musteri dashboard'u override uygulayabilsin)
create policy "users_select_own_invoice_line_overrides"
  on public.invoice_line_overrides
  for select
  using (auth.uid() = user_id);

-- Admin tam erisim (mevcut konvansiyon: app_metadata.is_admin)
create policy "invoice_line_overrides_admin_all"
  on public.invoice_line_overrides
  for all
  using ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true)
  with check ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true);
