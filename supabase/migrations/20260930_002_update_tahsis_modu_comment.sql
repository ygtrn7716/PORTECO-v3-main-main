-- ges_plants.tahsis_modu kolon yorumunu GUNCEL kurala gore yeniler.
--
-- 20260927_001 uygulandiginda oransal modlar henuz TEK KAYNAK modelindeydi
-- (havuz = GES kaydinin kaynak sayaci, kap = max(0, cn - own_gn)) ve
-- toplam_oransal'in emme siniri uretim saatleri kapasitesi (S_i) idi.
--
-- Sonra iki gercek faturayla (Meram/Nigde As Beton, Kayseri OSB/AYTEKS;
-- Agustos 2026) kural degisti:
--   * Oransal modlar HAVUZ modeline gecti: src(h) = listedeki TUM sayaclarin
--     gn_i(h) toplami; listedeki her tesisin tuketimi HAM girer (own_gn = 0).
--   * GES kaydinin kaynak sayaci yalnizca listedeyse havuza katilir; listede
--     degilse "source" rolu de almaz.
--   * toplam_oransal'da URETIM SAATI SINIRI KALKTI: emme siniri S_i degil T_i
--     ve saatlik yansitma donemin TUM saatlerine yayilir.
--
-- Bu migration YALNIZCA yorumu gunceller; kolon, CHECK kisiti ve veri
-- DEGISMEZ (idempotent, veri yazmaz).

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
