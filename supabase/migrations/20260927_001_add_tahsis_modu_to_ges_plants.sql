-- Talep Birlestirme: GES bazinda tahsis (dagitim) modu.
--
-- 'sirali'          = oncelik selalesi, TEK KAYNAK modeli (VARSAYILAN, DAVRANIS DEGISMEZ)
-- 'saatlik_oransal' = her uretim saatinde kapasite oraninda, HAVUZ modeli (Meram mantigi)
-- 'toplam_oransal'  = donem toplam kapasitesi oraninda, HAVUZ modeli (Kayseri OSB mantigi)
--
-- IKI AYRI MODEL var; mod yalnizca havuzun tesislere nasil bolundugunu degil,
-- HAVUZUN NE OLDUGUNU da belirler:
--
--  A) TEK KAYNAK modeli -- YALNIZ 'sirali'
--     src(h)   = GES kaydinin tek kaynak sayacinin (source_serno ?? linked_serno) gn'i
--     kap_i(h) = max(0, cn_i(h) - own_gn_i(h))  -> alici once KENDI verisiyle netlesir
--     Kaynak sayac listede degilse rolu "source": verisi dagitildigi icin kendi
--     faturasinda gn = 0 sayilir.
--
--  B) HAVUZ modeli -- oransal modlar ('saatlik_oransal', 'toplam_oransal')
--     src(h)   = toplam_{i in liste} gn_i(h)   -> LISTEDEKI TUM sayaclarin verisi
--     kap_i(h) = cn_i(h)                        -> tuketim HAM girer (own_gn = 0),
--                cunku tesisin verisi zaten havuza katilmistir (cift sayim olmaz)
--     GES kaydinin kaynak sayaci YALNIZCA listedeyse havuza katilir; listede
--     degilse havuza girmez ve "source" rolu de ALMAZ (verisi dagitilmadigi icin
--     sifirlanmamali) -> gorunumu null.
--
-- TUM modlarda AYNI kalan: artanin (toplam src - toplam alloc) en yuksek
-- oncelikli (minPriority) tesise aylik lump satis olarak yazilmasi. Oransal
-- modlarda oncelik sirasi DAGITIMI ETKILEMEZ, yalnizca artanin kime yazilacagini
-- belirler.
--
-- Bir tesis yalnizca TEK GES listesinde olabilir (uq_gma_user_serno,
-- 20260930_001): zincirli tahsis defteri kodlanmadigi icin ayni serno iki
-- listede olursa ayni kWh iki kez tahsis edilir; havuz modunda ayrica verisi
-- iki havuza katilir.
--
-- Gercek faturalarla dogrulandi (Agustos 2026, Europe/Istanbul ay penceresi):
-- Meram/Nigde As Beton ve Kayseri OSB/AYTEKS -- bkz. docs/files/porteco-06-admin-paneli.md
--
-- NOT NULL DEFAULT 'sirali': mevcut satirlar otomatik bugunku algoritmayi alir.
-- ges_plants'a yazan tum kod yollari kismi kolon listesi kullandigi icin
-- (GesProductionUploadAdmin insert/update, GesPlantsAdmin/TableManager) bu kolon
-- onlari etkilemez; tabloda .upsert() kullanan bir yol yoktur.

alter table public.ges_plants
  add column if not exists tahsis_modu text not null default 'sirali';

alter table public.ges_plants
  drop constraint if exists ges_plants_tahsis_modu_chk;

alter table public.ges_plants
  add constraint ges_plants_tahsis_modu_chk
  check (tahsis_modu in ('sirali', 'saatlik_oransal', 'toplam_oransal'));

comment on column public.ges_plants.tahsis_modu is
  'Talep Birlestirme tahsis modu; havuzun NE OLDUGUNU ve nasil bolundugunu belirler. '
  'sirali (varsayilan, TEK KAYNAK): src(h) = kaynak sayacin (source_serno ?? linked_serno) gn''i; '
  'kap_i(h) = max(0, cn_i(h) - own_gn_i(h)) yani alici once kendi verisiyle netlesir; '
  'alloc_i(h) = min(kalan, kap_i(h)) oncelik sirasiyla; kaynak listede degilse rolu "source" (kendi faturasinda gn=0). '
  'saatlik_oransal (HAVUZ, Meram): src(h) = listedeki TUM sayaclarin gn_i(h) toplami; kap_i(h) = cn_i(h) HAM (own_gn=0, verisi havuzda); '
  'alloc_i(h) = kap_i(h) * min(1, src(h)/K(h)). '
  'toplam_oransal (HAVUZ, Kayseri OSB): ayni havuz ve ham kapasite; M = toplam_{src(h)>0} min(src(h), K(h)); '
  'pay tabani T_i = toplam_{TUM saatler} kap_i(h); emme siniri da T_i''dir -- URETIM SAATI SINIRI YOKTUR '
  '(OSB dagitimda uygulamiyor); dagitim distributeCapped(M, T, caps = T) ve saatlik yansitma '
  'alloc_i(h) = kap_i(h) * (A_i/T_i) donemin TUM saatlerine yayilir. '
  'Havuz modlarinda GES kaydinin kaynak sayaci yalnizca listedeyse havuza katilir, listede degilse "source" rolu de almaz (gorunum null). '
  'Her modda artan (toplam src - toplam alloc) minPriority tesisine satis olarak yazilir; oransal modlarda oncelik dagitimi ETKILEMEZ. '
  'Ay penceresi Europe/Istanbul olmalidir ve tahsis ile tuketim satirlari AYNI araliktan gelmelidir.';
