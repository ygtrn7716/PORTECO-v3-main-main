-- ============================================================================
-- GES Tesisi Taşıma — Tek Seferlik Script
-- ----------------------------------------------------------------------------
-- Kullanıcı : muhasebe@as-insaat.com.tr (77a8df85-41f9-4545-a16e-f3f53822be2c)
-- Kaynak    : linked_serno = 10124578  (AS İNŞAAT ENERJİ MAKİNA ...)
-- Hedef     : linked_serno = 10128583
--
-- NE YAPAR:
--   Mevcut GES tesisinin linked_serno / plant_name / nickname / provider_plant_id
--   alanlarını hedef OSOS aboneliğine göre günceller. Üretim verisi
--   (ges_production_hourly / ges_production_daily / ges_snapshot) ges_plant_id
--   (tesis UUID'si) ile bağlı olduğu için OTOMATİK olarak yeni sernoya taşınır;
--   hiçbir veri kopyalanmaz veya silinmez.
--
-- GÜVENLİK KONTROLLERİ (hata varsa işlem tamamen geri alınır):
--   1) Kaynak sernoda tam olarak 1 adet tesis bulunmalı.
--   2) Hedef serno bu kullanıcının owner_subscriptions kaydında olmalı.
--   3) Hedef sernoda zaten AKTİF başka bir tesis olmamalı.
--   4) UNIQUE(credential_id, provider_plant_id) çakışırsa benzersiz ek üretilir.
--
-- KULLANIM: Supabase SQL Editor'de önce ADIM 1 (inceleme) SELECT'lerini çalıştırıp
--           verinin beklediğin gibi olduğunu doğrula, sonra ADIM 2 (DO bloğu) ve
--           son olarak ADIM 3 (doğrulama) SELECT'ini çalıştır.
-- ============================================================================


-- ============================================================================
-- ADIM 1 — İNCELEME (hiçbir şeyi değiştirmez)
-- ============================================================================

-- 1a) Kaynak ve hedef sernodaki tesisler:
select id, linked_serno, provider_plant_id, plant_name, nickname,
       credential_id, is_active, created_at
from public.ges_plants
where user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
  and linked_serno in (10124578, 10128583)
order by linked_serno;

-- 1b) Hedef serno bu kullanıcının aboneliklerinde var mı?
select user_id, subscription_serno, title
from public.owner_subscriptions
where user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
  and subscription_serno = 10128583;

-- 1c) Taşınacak üretim verisi miktarı (sadece bilgi amaçlı):
select 'hourly' as tablo, count(*) as satir
from public.ges_production_hourly h
join public.ges_plants p on p.id = h.ges_plant_id
where p.user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
  and p.linked_serno = 10124578
union all
select 'daily', count(*)
from public.ges_production_daily d
join public.ges_plants p on p.id = d.ges_plant_id
where p.user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
  and p.linked_serno = 10124578;


-- ============================================================================
-- ADIM 2 — TAŞIMA (atomik; herhangi bir kontrol başarısız olursa tümü geri alınır)
-- ============================================================================
do $$
declare
  v_user      uuid   := '77a8df85-41f9-4545-a16e-f3f53822be2c';
  v_src_serno bigint := 10124578;
  v_dst_serno bigint := 10128583;

  v_plant_id  uuid;
  v_cred_id   uuid;
  v_cnt       int;
  v_title     text;
  v_ppid      text;
begin
  -- (1) Kaynak tesisi bul — tam olarak 1 adet olmalı
  select count(*) into v_cnt
  from public.ges_plants
  where user_id = v_user and linked_serno = v_src_serno;

  if v_cnt = 0 then
    raise exception 'Kaynak sernoda (%) tesis bulunamadi. Tasima iptal.', v_src_serno;
  elsif v_cnt > 1 then
    raise exception 'Kaynak sernoda (%) birden fazla tesis var (% adet). Once elle netlestirin.', v_src_serno, v_cnt;
  end if;

  select id, credential_id
    into v_plant_id, v_cred_id
  from public.ges_plants
  where user_id = v_user and linked_serno = v_src_serno;

  -- (2) Hedef serno bu kullanicinin abonelikleri arasinda mi?
  select title into v_title
  from public.owner_subscriptions
  where user_id = v_user and subscription_serno = v_dst_serno;

  if not found then
    raise exception 'Hedef serno (%) bu kullanicinin owner_subscriptions kaydinda yok. Tasima iptal.', v_dst_serno;
  end if;

  v_title := coalesce(nullif(btrim(v_title), ''), 'Tesis ' || v_dst_serno);

  -- (3) Hedef sernoda zaten AKTIF baska bir tesis var mi?
  select count(*) into v_cnt
  from public.ges_plants
  where user_id = v_user
    and linked_serno = v_dst_serno
    and is_active = true
    and id <> v_plant_id;

  if v_cnt > 0 then
    raise exception 'Hedef sernoda (%) zaten aktif bir GES tesisi var. Once onu pasiflestirin veya farkli hedef secin.', v_dst_serno;
  end if;

  -- (4) provider_plant_id cakismasini onle (UNIQUE credential_id + provider_plant_id)
  v_ppid := 'MANUAL_' || v_dst_serno;

  select count(*) into v_cnt
  from public.ges_plants
  where credential_id = v_cred_id
    and provider_plant_id = v_ppid
    and id <> v_plant_id;

  if v_cnt > 0 then
    v_ppid := 'MANUAL_' || v_dst_serno || '_' || left(v_plant_id::text, 8);
  end if;

  -- (5) Guncelle — uretim verisi ges_plant_id ile bagli oldugu icin otomatik takip eder
  update public.ges_plants
  set linked_serno      = v_dst_serno,
      plant_name        = v_title,
      nickname          = v_title,
      provider_plant_id = v_ppid
  where id = v_plant_id;

  raise notice 'TAMAM: tesis % (% -> %) -> ad: "%", provider_plant_id: "%"',
    v_plant_id, v_src_serno, v_dst_serno, v_title, v_ppid;
end $$;


-- ============================================================================
-- ADIM 3 — DOĞRULAMA (taşıma sonrası kontrol)
-- ============================================================================

-- 3a) Tesis artik hedef sernoda gorunmeli, kaynak serno bos olmali:
select id, linked_serno, provider_plant_id, plant_name, nickname, is_active
from public.ges_plants
where user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
  and linked_serno in (10124578, 10128583)
order by linked_serno;

-- 3b) Uretim verisi yeni sernoya bagli mi? (hourly + daily satir sayisi):
select 'hourly' as tablo, count(*) as satir
from public.ges_production_hourly h
join public.ges_plants p on p.id = h.ges_plant_id
where p.user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
  and p.linked_serno = 10128583
union all
select 'daily', count(*)
from public.ges_production_daily d
join public.ges_plants p on p.id = d.ges_plant_id
where p.user_id = '77a8df85-41f9-4545-a16e-f3f53822be2c'
  and p.linked_serno = 10128583;
