-- Metod 8 — Kayseri OSB.
--
-- AYTEKS Ağustos 2026 OSB bildirimi (105013200 üretim tesisi, 107183100, 107196200) ile
-- kuruşuna çözüldü. Tesis başına (C brüt, M mahsup, N = C − M, G kendi veriş, P OSB fiyatı):
--   Aktif enerji N×P · Endüktif/Kapasitif (ceza varsa) · YEKDEM fiyat farkı (önceki ay N × birim)
--   · İletim C×iletim · OSB dağıtım C×osb (üretim tesisi değilse) · Lisanssız üretim çekiş C×çekiş
--   ve veriş dağıtım max(0,G−C)×dagitim_uretici_1 (yalnız üretim tesisi) · ETV = btv×C×P · KDV.
-- Metod 1–7 DEĞİŞMEZ.
--
-- ⚠️ Kayseri OSB'yi Metod 8'e GEÇİRMEZ: invoice_companies.kayseri_osb → 8 ayrı migration'da,
-- testler + karşılaştırma onaylandıktan ve kod deploy edildikten SONRA.
-- Idempotent; veri yazmaz (yalnız invoice_methods seed satırı).

-- 1) OSB aylık fiyat tablosu
create table if not exists public.osb_aylik_fiyatlar (
  id                        uuid primary key default gen_random_uuid(),
  company_key               text not null references public.invoice_companies(key),
  period_year               integer not null,
  period_month              integer not null check (period_month between 1 and 12),
  enerji_birim_fiyati       numeric(12,6) not null check (enerji_birim_fiyati > 0),
  yekdem_fark_birim_fiyati  numeric(12,6) not null default 0,
  note                      text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint uq_osb_aylik_fiyatlar unique (company_key, period_year, period_month)
);

comment on table public.osb_aylik_fiyatlar is
  'Metod 8 (OSB) aylık fiyatları. Fatura ayının satırı yoksa en yakın önceki ayın enerji fiyatı '
  '"tahmini" kullanılır (YEKDEM farkı 0); hiç satır yoksa fatura görünür hatayla hesaplanmaz.';
comment on column public.osb_aylik_fiyatlar.enerji_birim_fiyati is
  'P — OSB aylık aktif enerji birim fiyatı (TL/kWh). Aktif enerji = net tüketim × P; ETV = btv × brüt × P.';
comment on column public.osb_aylik_fiyatlar.yekdem_fark_birim_fiyati is
  'YEKDEM fiyat farkı birim fiyatı (TL/kWh) — bu ayın faturasında ÖNCEKİ ayın net tüketimiyle çarpılır.';

drop trigger if exists trg_osb_aylik_fiyatlar_updated_at on public.osb_aylik_fiyatlar;
create trigger trg_osb_aylik_fiyatlar_updated_at
  before update on public.osb_aylik_fiyatlar
  for each row
  execute function public.set_updated_at();

alter table public.osb_aylik_fiyatlar enable row level security;

-- Okuma: tüm oturumlar (müşteri faturası tarayıcıda müşteri oturumuyla hesaplanır; fiyat hassas değil).
drop policy if exists "osb_aylik_fiyatlar_select_authenticated" on public.osb_aylik_fiyatlar;
create policy "osb_aylik_fiyatlar_select_authenticated"
  on public.osb_aylik_fiyatlar
  for select
  to authenticated
  using (true);

-- Yazma: yalnız admin (app_metadata.is_admin). auth.jwt() (select …) içinde → satır başına
-- yeniden değerlendirilmez (advisor auth_rls_initplan).
drop policy if exists "osb_aylik_fiyatlar_admin_insert" on public.osb_aylik_fiyatlar;
create policy "osb_aylik_fiyatlar_admin_insert"
  on public.osb_aylik_fiyatlar
  for insert
  to authenticated
  with check (((((select auth.jwt()) -> 'app_metadata') ->> 'is_admin'))::boolean = true);

drop policy if exists "osb_aylik_fiyatlar_admin_update" on public.osb_aylik_fiyatlar;
create policy "osb_aylik_fiyatlar_admin_update"
  on public.osb_aylik_fiyatlar
  for update
  to authenticated
  using (((((select auth.jwt()) -> 'app_metadata') ->> 'is_admin'))::boolean = true)
  with check (((((select auth.jwt()) -> 'app_metadata') ->> 'is_admin'))::boolean = true);

drop policy if exists "osb_aylik_fiyatlar_admin_delete" on public.osb_aylik_fiyatlar;
create policy "osb_aylik_fiyatlar_admin_delete"
  on public.osb_aylik_fiyatlar
  for delete
  to authenticated
  using (((((select auth.jwt()) -> 'app_metadata') ->> 'is_admin'))::boolean = true);

-- 2) Metod 8 kaydı
insert into public.invoice_methods (id, name, description) values
  (8, 'Metod 8 | Kayseri OSB', 'Kayseri OSB: OSB aylık enerji fiyatı (osb_aylik_fiyatlar) × net tüketim; endüktif/kapasitif reaktif (ceza varsa); YEKDEM fiyat farkı (önceki ay net × birim); iletim (brüt); OSB dağıtım (üretim tesisi değilse) / lisanssız üretim çekiş + veriş dağıtım (üretim tesisi); ETV = %1 × brüt × P; trafo/güç yok; sonraki ay YEKDEM mahsubu yok.')
on conflict (id) do nothing;

-- 3) Snapshot replay alanları (yalnız Metod 8 damgalar; diğer metodlarda NULL).
--    Yeniden kullanılan: own_gn_kwh (G), prev_sum_pos (önceki ay N), net_positive_draw_kwh (N),
--    total_consumption_kwh (C), reactive_ri/rc_percent, btv_rate, vat_rate.
alter table public.invoice_snapshots
  add column if not exists osb_enerji_birim_fiyati numeric,
  add column if not exists osb_fiyat_tahmini boolean,
  add column if not exists osb_yekdem_fark_birim numeric,
  add column if not exists osb_iletim_birim numeric,
  add column if not exists osb_dagitim_birim numeric,
  add column if not exists osb_cekis_birim numeric,
  add column if not exists osb_veris_dagitim_birim numeric,
  add column if not exists osb_reaktif_birim numeric;

comment on column public.invoice_snapshots.osb_enerji_birim_fiyati is
  'Metod 8: P (doğal OSB fiyatı; override replay''de ayrıca uygulanır). Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.osb_fiyat_tahmini is
  'Metod 8: P fatura ayından önceki bir aydan alındı (tahmini). Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.osb_yekdem_fark_birim is
  'Metod 8: YEKDEM fiyat farkı birim fiyatı (TL/kWh; prev_sum_pos ile çarpılır). Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.osb_iletim_birim is
  'Metod 8: yazım anındaki kayseri_ek_bedeller.iletim_bedeli_aktif_tuketim. Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.osb_dagitim_birim is
  'Metod 8: yazım anındaki kayseri_ek_bedeller.osb_dagitim_kullanim_bedeli. Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.osb_cekis_birim is
  'Metod 8: yazım anındaki kayseri_ek_bedeller.lisanssiz_uretim_cekis_bedeli. Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.osb_veris_dagitim_birim is
  'Metod 8: yazım anındaki tarife dagitim_uretici_1 (lisanssız üretim veriş dağıtım). Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.osb_reaktif_birim is
  'Metod 8: yazım anındaki tarife reaktif_bedel. Diğer metodlarda NULL.';

-- 4) kayseri_ek_bedeller kolon yorumları Metod 8 formülüne göre
comment on column public.kayseri_ek_bedeller.iletim_bedeli_aktif_tuketim
  is 'İletim Bedeli (Aktif Tüketim Payı) birim fiyatı, TL/kWh — Metod 8: BRÜT aktif tüketim ile çarpılır (tüm tesisler).';
comment on column public.kayseri_ek_bedeller.osb_dagitim_kullanim_bedeli
  is 'OSB Dağıtım Sistemi Kullanım Bedeli birim fiyatı, TL/kWh — Metod 8: brüt tüketim ile çarpılır, YALNIZ üretim tesisi olmayanlarda.';
comment on column public.kayseri_ek_bedeller.lisanssiz_uretim_cekis_bedeli
  is 'Lisanssız Üretim ÇEKİŞ Dağıtım Bedeli (DBÇ×0,5)(Sanayi), TL/kWh — Metod 8: brüt tüketim ile çarpılır, YALNIZ üretim tesisinde.';
