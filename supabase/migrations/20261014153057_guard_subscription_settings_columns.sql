create or replace function public.guard_subscription_settings_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  claims  jsonb  := auth.jwt();
  allowed text[] := array['nickname', 'title', 'is_hidden', 'alerts_enabled'];
  ident   text[] := array['id', 'user_id', 'subscription_serno', 'created_at', 'updated_at'];
  nj      jsonb  := pg_catalog.to_jsonb(NEW);
  r       record;
  d       jsonb;
begin
  -- Muafiyet: claims yok (MCP / SQL editor / postgres), service_role, admin.
  if claims is null
     or current_user = 'service_role'
     or claims ->> 'role' = 'service_role'
     or coalesce((claims -> 'app_metadata' ->> 'is_admin')::boolean, false) then
    return NEW;
  end if;

  if tg_op = 'UPDATE' then
    -- İzin listesi: izinli kolonlar + updated_at dışında HER kolon (gelecekte eklenenler dahil) kilitli.
    if (nj - allowed - 'updated_at') is distinct from (pg_catalog.to_jsonb(OLD) - allowed - 'updated_at') then
      raise exception using errcode = '42501',
        message = 'subscription_settings: yalnız nickname, title, is_hidden, alerts_enabled değiştirilebilir (diğer kolonlar admin).';
    end if;
    return NEW;
  end if;

  -- INSERT: izinli + kimlik kolonları dışındaki her kolon varsayılan değerinde olmalı.
  for r in
    select a.attname::text as col, pg_catalog.pg_get_expr(x.adbin, x.adrelid) as def
      from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef x on x.adrelid = a.attrelid and x.adnum = a.attnum
     where a.attrelid = tg_relid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       and a.attname::text <> all (allowed || ident)
  loop
    d := 'null'::jsonb;
    if r.def is not null then
      execute pg_catalog.format('select pg_catalog.to_jsonb(%s)', r.def) into d;
      d := coalesce(d, 'null'::jsonb);   -- to_jsonb(NULL) SQL NULL döner
    end if;
    if coalesce(nj -> r.col, 'null'::jsonb) is distinct from d then
      raise exception using errcode = '42501',
        message = pg_catalog.format('subscription_settings: %I kolonu yalnız admin tarafından ayarlanabilir.', r.col);
    end if;
  end loop;
  return NEW;
end
$$;

create trigger trg_subscription_settings_zz_column_guard
  before insert or update on public.subscription_settings
  for each row execute function public.guard_subscription_settings_columns();
