-- PortEco Finans Takip Modülü (dahili gelir-gider takibi)
--
-- Müşteri bazlı aylık ödeme takibi, demo süresi takibi ve gider yönetimi.
-- TAMAMEN DAHİLİ kullanım: fatura kesme, PDF üretme, müşteriye e-posta/SMS/uyarı gönderme YOK.
-- Dört tablo da yalnızca admin erişimine açıktır; müşteriye yönelik select policy bilinçli olarak
-- tanımlanmamıştır (müşteri kendi ücret kaydını asla okuyamamalı).
--
-- Bilinçli sadeleştirmeler (v1): ücret değişiklik geçmişi tutulmaz (geriye dönük görünümler güncel
-- monthly_fee üzerinden hesaplanır); KDV/vergi ayrımı yoktur, tutarlar brüt kabul edilir.

-- 1) Müşteri finans kartları (platform kullanıcısı başına 1 kayıt)
create table if not exists public.finance_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  display_name        text not null,
  status              text not null default 'demo'
                        check (status in ('demo','active','paused','churned')),
  monthly_fee         numeric(12,2) not null default 0 check (monthly_fee >= 0),
  payment_day         smallint check (payment_day between 1 and 31),
  demo_start          date,
  demo_end            date,
  billing_start_month date
                        check (billing_start_month = date_trunc('month', billing_start_month)::date),
  billing_end_month   date
                        check (billing_end_month = date_trunc('month', billing_end_month)::date),
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- status='active' ise faturalama açılış ayı zorunlu. Aksi halde hesap her ay
  -- "kapsam dışı" sayılır ve tüm KPI'lardan sessizce düşerdi.
  -- 'active' dışı statüler bilerek serbest: hiç aktife dönüşmemiş bir demo churned'a çekilebilmeli.
  constraint ck_finance_accounts_active_needs_billing_start
    check (status <> 'active' or billing_start_month is not null)
);

comment on table public.finance_accounts
  is 'Dahili finans takibi: platform kullanıcısı başına 1 finans kartı. Sadece admin erişimi.';
comment on column public.finance_accounts.status
  is 'demo | active | paused | churned. paused = hizmet durdu, ücret işlemez (faturalanmaz).';
comment on column public.finance_accounts.monthly_fee
  is 'Güncel aylık ücret (TL, brüt). Ücret değişiklik geçmişi tutulmaz; geriye dönük görünümler de bu değeri kullanır.';
comment on column public.finance_accounts.payment_day
  is 'Ayın kaçında ödeme beklendiği (1-31). NULL ise ayın son günü vade kabul edilir. Kısa aylarda ayın son gününe clamp edilir (31 -> Şubat''ta 28/29).';
comment on column public.finance_accounts.billing_start_month
  is 'Hesabın faturalandığı İLK ay (ayın 1''i). Demo / hiç faturalanmamış hesapta NULL. status=''active'' ise zorunlu. Bu aydan önceki aylar kapsam dışıdır.';
comment on column public.finance_accounts.billing_end_month
  is 'Hesabın faturalanan SON ayı (ayın 1''i); hâlâ faturalanıyorsa NULL. Churn sonrası geçmiş aylarda sahte beklenen gelir/gecikme oluşmasını engeller.';

-- 2) Tahsilat kayıtları (aynı döneme birden fazla satır = kısmi ödeme)
create table if not exists public.finance_payments (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.finance_accounts(id) on delete cascade,
  period_month date not null
                 check (period_month = date_trunc('month', period_month)::date),
  amount       numeric(12,2) not null check (amount > 0),
  paid_at      date not null default (now() at time zone 'Europe/Istanbul')::date,
  method       text not null default 'havale'
                 check (method in ('havale','nakit','kredi_karti','diger')),
  note         text,
  created_at   timestamptz not null default now()
);

comment on column public.finance_payments.period_month
  is 'Ödemenin ait olduğu dönem (ayın 1''i). Aynı döneme birden fazla satır girilebilir = kısmi ödeme.';
comment on column public.finance_payments.paid_at
  is 'Tahsilatın fiilen yapıldığı tarih (İstanbul günü). period_month''dan farklı olabilir.';

create index if not exists idx_finance_payments_account_period
  on public.finance_payments (account_id, period_month);
create index if not exists idx_finance_payments_period
  on public.finance_payments (period_month);

-- 3) Sabit gider şablonları
create table if not exists public.finance_expense_templates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  category   text not null default 'diger',
  amount     numeric(12,2) not null check (amount >= 0),
  active     boolean not null default true,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.finance_expense_templates
  is 'Her ay tekrarlayan sabit giderlerin şablonu. "Sabit giderleri bu aya uygula" aktif şablonları finance_expenses''a kopyalar.';

-- 4) Gerçekleşen giderler (ay bazlı)
create table if not exists public.finance_expenses (
  id           uuid primary key default gen_random_uuid(),
  period_month date not null
                 check (period_month = date_trunc('month', period_month)::date),
  title        text not null,
  category     text not null default 'diger',
  amount       numeric(12,2) not null check (amount >= 0),
  expense_date date,
  template_id  uuid references public.finance_expense_templates(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);

comment on column public.finance_expenses.template_id
  is 'Bu gider bir sabit gider şablonundan üretildiyse şablonun id''si; manuel giderde NULL. Şablon silinirse NULL''a düşer (gider gerçekten oldu, sadece bağı kopar).';
comment on column public.finance_expenses.expense_date
  is 'Giderin fiili tarihi. period_month''dan farklı olabilir (ör. Ağustos''ta ödenen yıllık domain, Ağustos ayına yazılır).';

create index if not exists idx_finance_expenses_period
  on public.finance_expenses (period_month);

-- Aynı şablon aynı aya ikinci kez uygulanamaz (idempotent "sabit giderleri uygula").
-- DÜZ index, partial DEĞİL: `where template_id is not null` yazılsaydı PostgREST'in upsert'ü
-- ON CONFLICT çıkarımı yapamaz, runtime'da patlardı.
-- Postgres NULL'ları zaten distinct saydığı için manuel giderler (template_id = NULL) bu index'e
-- takılmaz — aynı ayda istediğin kadar manuel gider girilebilir.
create unique index if not exists uq_finance_expenses_template_period
  on public.finance_expenses (template_id, period_month);

-- updated_at otomatik güncelleme (mevcut public.set_updated_at fonksiyonunu kullanır).
-- Yalnızca finance_accounts'ta updated_at var; diğer üç tablo append/replace niteliğinde.
create trigger trg_finance_accounts_updated_at
  before update on public.finance_accounts
  for each row
  execute function public.set_updated_at();

-- RLS: dört tablo da SADECE admin (mevcut PortEco konvansiyonu: app_metadata.is_admin)
alter table public.finance_accounts enable row level security;
alter table public.finance_payments enable row level security;
alter table public.finance_expense_templates enable row level security;
alter table public.finance_expenses enable row level security;

create policy "finance_accounts_admin_all"
  on public.finance_accounts
  for all
  using ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true)
  with check ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true);

create policy "finance_payments_admin_all"
  on public.finance_payments
  for all
  using ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true)
  with check ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true);

create policy "finance_expense_templates_admin_all"
  on public.finance_expense_templates
  for all
  using ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true)
  with check ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true);

create policy "finance_expenses_admin_all"
  on public.finance_expenses
  for all
  using ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true)
  with check ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true);
