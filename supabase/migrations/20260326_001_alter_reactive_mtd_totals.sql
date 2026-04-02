-- reactive_mtd_totals: veriş alanlarını (gn, rio, rco) ekle
-- returns table imzası değiştiği için DROP + CREATE gerekli

drop function if exists public.reactive_mtd_totals(uuid);

create function public.reactive_mtd_totals(p_user_id uuid)
returns table (
  subscription_serno bigint,
  active_kwh         double precision,
  ri_kvarh           double precision,
  rc_kvarh           double precision,
  gn_kwh             double precision,
  rio_kvarh          double precision,
  rco_kvarh          double precision
)
language sql
stable
security definer
as $$
  select
    ch.subscription_serno,
    coalesce(sum(ch.cn),  0) as active_kwh,
    coalesce(sum(ch.ri),  0) as ri_kvarh,
    coalesce(sum(ch.rc),  0) as rc_kvarh,
    coalesce(sum(ch.gn),  0) as gn_kwh,
    coalesce(sum(ch.rio), 0) as rio_kvarh,
    coalesce(sum(ch.rco), 0) as rco_kvarh
  from public.consumption_hourly ch
  where ch.user_id = p_user_id
    and ch.ts >= date_trunc('month', now() at time zone 'Europe/Istanbul')
    and ch.ts <  date_trunc('month', now() at time zone 'Europe/Istanbul') + interval '1 month'
  group by ch.subscription_serno;
$$;
