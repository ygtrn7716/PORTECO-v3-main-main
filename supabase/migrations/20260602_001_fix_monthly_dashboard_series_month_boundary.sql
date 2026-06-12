-- Fix: monthly_dashboard_series ay-sonu sınırı (end_ts) timezone bug'ı
--
-- Sorun: `make_timestamptz(p_year, m, 1, 0,0,0, p_tz) + interval '1 month'`
-- ifadesindeki interval aritmetiği DB session timezone'unda yürür. PostgREST
-- bağlantısı UTC session'da olduğundan, TR ay başı (ör. 2026-04-30 21:00 UTC)
-- üzerine 1 ay eklemek 2026-05-30 21:00 UTC = 31 Mayıs 00:00 TR verir ve ayın
-- son gününü (24 saat) tamamen düşürür. Bu, kart (doğru, tam ay) ile grafik
-- (eksik son gün) arasındaki tüketim + tüketim-ağırlıklı PTF sapmasının kök
-- nedeniydi.
--
-- Çözüm: ay eklemeyi hedef timezone'da (p_tz) yap; böylece session tz'den
-- bağımsız olarak doğru bir sonraki ay başı elde edilir.
--
-- Not: bu RPC daha önce yalnızca Supabase Studio'da tanımlıydı; artık versiyon
-- kontrolünde. Tek değişiklik bounds CTE'sindeki end_ts ifadesidir.

CREATE OR REPLACE FUNCTION public.monthly_dashboard_series(
  p_user_id uuid,
  p_subscription_serno bigint,
  p_year integer,
  p_tz text DEFAULT 'Europe/Istanbul'::text
)
RETURNS TABLE(
  month integer,
  consumption_kwh numeric,
  ptf_tl_kwh numeric,
  yekdem_value_tl_kwh numeric,
  yekdem_final_tl_kwh numeric,
  invoice_total_tl numeric,
  yekdem_mahsup_tl numeric,
  ri_ratio_max numeric,
  ri_ratio_end numeric,
  rc_ratio_max numeric,
  rc_ratio_end numeric
)
LANGUAGE sql
STABLE
AS $function$
with months as (
  select generate_series(1,12) as m
),
bounds as (
  select
    m.m as month,
    make_timestamptz(p_year, m.m, 1, 0,0,0, p_tz) as start_ts,
    -- tz-güvenli ay sonu: ay eklemeyi p_tz'de yap (session tz'ye bağımlı değil)
    ((make_timestamptz(p_year, m.m, 1, 0,0,0, p_tz) at time zone p_tz
       + interval '1 month') at time zone p_tz) as end_ts,
    (now() + interval '1 hour') as now_plus_1h
  from months m
),
hourly as (
  -- Geçmiş aylar: full
  -- Bu ay: ay başından now+1h'a kadar (ReactiveSection ile aynı mantık)
  select
    b.month,
    ch.ts,
    coalesce(ch.cn,0)::numeric as cn,
    coalesce(ch.ri,0)::numeric as ri,
    coalesce(ch.rc,0)::numeric as rc
  from bounds b
  join consumption_hourly ch
    on ch.ts >= b.start_ts
   and ch.ts <  least(b.end_ts, b.now_plus_1h)
  where ch.user_id = p_user_id
    and ch.subscription_serno = p_subscription_serno
),
cons_month as (
  select
    month,
    sum(cn) as consumption_kwh,
    sum(ri) as sum_ri,
    sum(rc) as sum_rc
  from hourly
  group by 1
),
ptf_month as (
  -- PtfDetail summary ile aynı:
  -- covered_kwh = ptf bulunan saatlerin kWh'i
  -- total_tl = sum(kWh * ptf_tl_mwh / 1000)
  select
    h.month,
    sum(case when e.ptf_tl_mwh is not null then h.cn else 0 end) as covered_kwh,
    sum(case when e.ptf_tl_mwh is not null then (h.cn * (e.ptf_tl_mwh::numeric/1000)) else 0 end) as total_tl
  from hourly h
  left join epias_ptf_hourly e
    on e.ts = date_trunc('hour', h.ts)
  group by 1
),
yek as (
  select
    period_month as month,
    yekdem_value::numeric as yekdem_value_tl_kwh,
    yekdem_final::numeric as yekdem_final_tl_kwh
  from subscription_yekdem
  where user_id = p_user_id
    and subscription_serno = p_subscription_serno
    and period_year = p_year
),
snap as (
  select
    period_month as month,
    coalesce(total_with_mahsup, total_invoice)::numeric as invoice_total_tl,
    yekdem_mahsup::numeric as yekdem_mahsup_tl
  from invoice_snapshots
  where user_id = p_user_id
    and subscription_serno = p_subscription_serno
    and period_year = p_year
    and invoice_type = 'billed'
),
running as (
  select
    month,
    ts,
    sum(cn) over (partition by month order by ts) as cn_cum,
    sum(ri) over (partition by month order by ts) as ri_cum,
    sum(rc) over (partition by month order by ts) as rc_cum
  from hourly
),
reactive_points as (
  select
    month,
    case when cn_cum > 0 then (ri_cum/cn_cum)*100 else null end as ri_mtd_pct,
    case when cn_cum > 0 then (rc_cum/cn_cum)*100 else null end as rc_mtd_pct,
    last_value(case when cn_cum > 0 then (ri_cum/cn_cum)*100 else null end)
      over (partition by month order by ts
            rows between unbounded preceding and unbounded following) as ri_end,
    last_value(case when cn_cum > 0 then (rc_cum/cn_cum)*100 else null end)
      over (partition by month order by ts
            rows between unbounded preceding and unbounded following) as rc_end
  from running
),
reactive_month as (
  select
    month,
    max(ri_mtd_pct) as ri_ratio_max,
    max(ri_end) as ri_ratio_end,
    max(rc_mtd_pct) as rc_ratio_max,
    max(rc_end) as rc_ratio_end
  from reactive_points
  group by 1
)
select
  b.month,
  cm.consumption_kwh,
  case when pm.covered_kwh > 0 then pm.total_tl / pm.covered_kwh else null end as ptf_tl_kwh,
  y.yekdem_value_tl_kwh,
  y.yekdem_final_tl_kwh,
  s.invoice_total_tl,
  s.yekdem_mahsup_tl,
  rm.ri_ratio_max,
  rm.ri_ratio_end,
  rm.rc_ratio_max,
  rm.rc_ratio_end
from bounds b
left join cons_month cm on cm.month = b.month
left join ptf_month pm on pm.month = b.month
left join yek y on y.month = b.month
left join snap s on s.month = b.month
left join reactive_month rm on rm.month = b.month
order by b.month;
$function$;
