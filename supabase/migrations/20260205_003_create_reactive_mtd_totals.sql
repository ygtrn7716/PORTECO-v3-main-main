-- ============================================================
-- Migration: reactive_mtd_totals RPC fonksiyonu
-- Bir kullanicinin tum tesisleri icin ay-to-date reaktif toplamlari dondurur
-- consumption_hourly tablosundaki cn (aktif), ri (induktif), rc (kapasitif) sutunlarini toplar
-- ============================================================

create or replace function public.reactive_mtd_totals(p_user_id uuid)
returns table (
  subscription_serno bigint,
  active_kwh double precision,
  ri_kvarh double precision,
  rc_kvarh double precision
)
language sql
stable
security definer
as $$
  select
    ch.subscription_serno,
    coalesce(sum(ch.cn), 0)  as active_kwh,
    coalesce(sum(ch.ri), 0)  as ri_kvarh,
    coalesce(sum(ch.rc), 0)  as rc_kvarh
  from public.consumption_hourly ch
  where ch.user_id = p_user_id
    and ch.ts >= date_trunc('month', now() at time zone 'Europe/Istanbul')
    and ch.ts <  date_trunc('month', now() at time zone 'Europe/Istanbul') + interval '1 month'
  group by ch.subscription_serno;
$$;
