-- kayseri_ek_bedeller: Kayseri OSB (owner_subscriptions.provider = 'vhs_kayseri')
-- tesisleri için OSB'nin ayrıca tahsil ettiği ek bedel birim fiyatları (TL/kWh).
-- Satırı olmayan tesiste fatura sayfasındaki "Ek Bedeller" kartı gösterilmez.
create table if not exists public.kayseri_ek_bedeller (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid not null references auth.users(id) on delete cascade,
  subscription_serno            bigint not null,
  iletim_bedeli_aktif_tuketim   numeric(12,6),
  osb_dagitim_kullanim_bedeli   numeric(12,6),
  lisanssiz_uretim_cekis_bedeli numeric(12,6),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  constraint uq_kayseri_ek_bedeller_user_serno unique (user_id, subscription_serno)
);

comment on column public.kayseri_ek_bedeller.iletim_bedeli_aktif_tuketim
  is 'İletim Bedeli (Aktif Tüketim Payı) birim fiyatı, TL/kWh — aylık toplam tüketim ile çarpılır';
comment on column public.kayseri_ek_bedeller.osb_dagitim_kullanim_bedeli
  is 'OSB Dağıtım Sistemi Kullanım Bedeli birim fiyatı, TL/kWh — (tüketim − toplam veriş) ile çarpılır';
comment on column public.kayseri_ek_bedeller.lisanssiz_uretim_cekis_bedeli
  is 'Lisanssız Üretim Çekiş Dağıtım Bedeli (Sanayi) birim fiyatı, TL/kWh — toplam veriş ile çarpılır';

create index if not exists idx_kayseri_ek_bedeller_user_id
  on public.kayseri_ek_bedeller(user_id);

-- updated_at otomatik güncelleme (mevcut set_updated_at fonksiyonunu kullanır)
create trigger trg_kayseri_ek_bedeller_updated_at
  before update on public.kayseri_ek_bedeller
  for each row
  execute function public.set_updated_at();

alter table public.kayseri_ek_bedeller enable row level security;

-- Kullanıcı kendi kaydını okuyabilir
create policy "users_select_own_kayseri_ek_bedeller"
  on public.kayseri_ek_bedeller
  for select
  using (auth.uid() = user_id);

-- Admin tam erişim (mevcut konvansiyon: app_metadata.is_admin)
create policy "kayseri_ek_bedeller_admin_all"
  on public.kayseri_ek_bedeller
  for all
  using ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true)
  with check ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true);
