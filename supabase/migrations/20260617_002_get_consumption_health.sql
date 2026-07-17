-- ============================================================
-- RPC: get_consumption_health
--
-- Her tesis için tek sorguda tüketim veri sağlığı özetini döner.
-- consumption_hourly üzerinde TEK bir GROUP BY (user_id, subscription_serno)
-- yapar — satır-başı subquery YOK. (user_id, subscription_serno, ts DESC)
-- indeksi MAX(ts) için elverişlidir.
--
-- Sağlayıcı eşiği owner_subscriptions.provider üzerinden
-- data_health_providers'a join'lenir. Eşleşme yoksa display_name/eşikler
-- null döner; istemci bunu "Eşleşmemiş" olarak gösterir ve varsayılan
-- eşiklere düşer.
--
-- Konvansiyon: LANGUAGE sql STABLE (SECURITY DEFINER değil). Admin'in
-- consumption_hourly/owner_subscriptions üzerinde "Admin full read" RLS
-- politikası olduğundan çağıran admin tüm satırları görür.
-- Gecikme ve 24s penceresi now() farkı ile mutlak (tz-bağımsız) hesaplanır;
-- görüntü formatlaması istemcide Europe/Istanbul'a göre yapılır.
-- ============================================================

create or replace function public.get_consumption_health()
returns table (
  subscription_serno       bigint,
  user_id                  uuid,
  title                    text,
  provider_key             text,
  display_name             text,
  system_type              text,
  expected_period_hours    numeric,
  healthy_threshold_hours  numeric,
  warning_threshold_hours  numeric,
  last_ts                  timestamptz,
  delay_hours              numeric,
  records_last_24h         bigint
)
language sql
stable
as $function$
  with agg as (
    select
      ch.user_id,
      ch.subscription_serno,
      max(ch.ts) as last_ts,
      count(*) filter (where ch.ts >= now() - interval '24 hours') as records_last_24h
    from public.consumption_hourly ch
    group by ch.user_id, ch.subscription_serno
  )
  select
    os.subscription_serno,
    os.user_id,
    os.title,
    os.provider                          as provider_key,
    dhp.display_name,
    dhp.system_type,
    dhp.expected_period_hours,
    dhp.healthy_threshold_hours,
    dhp.warning_threshold_hours,
    a.last_ts,
    case
      when a.last_ts is null then null
      else round((extract(epoch from (now() - a.last_ts)) / 3600.0)::numeric, 2)
    end                                  as delay_hours,
    coalesce(a.records_last_24h, 0)      as records_last_24h
  from public.owner_subscriptions os
  left join agg a
    on a.user_id = os.user_id
   and a.subscription_serno = os.subscription_serno
  left join public.data_health_providers dhp
    on dhp.provider_key = os.provider
  -- en gecikmeli (en eski son veri) üstte; hiç verisi olmayanlar en tepede
  order by a.last_ts asc nulls first;
$function$;
