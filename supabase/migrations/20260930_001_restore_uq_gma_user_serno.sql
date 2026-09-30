-- Talep Birlestirme: (user_id, subscription_serno) tekilligini GERI KOY.
--
-- GECMIS: kisit 20260705_001'de tanimlandi, sonra canli DB'de ELLE kaldirildi
-- ("bir tesis birden fazla GES'e atanabilir, selale zincirleme isler" gerekcesiyle).
-- Repo migration'i hic guncellenmedigi icin sema drift'i olustu: repo kisiti
-- tanimli gosteriyordu, canli DB'de yoktu.
--
-- NEDEN GERI KONUYOR:
--  1) Zincirli tahsis defteri (ayni tesisin birden fazla GES listesinden sirayla
--     mahsup almasi) HIC KODLANMADI. gesAllocation.ts her GES'i BAGIMSIZ hesaplar;
--     ortak "kalan cekis" defteri yoktur. Bu yuzden ayni serno iki listede olursa
--     her iki GES de AYNI bos kapasiteyi gorur ve ayni kWh iki kez tahsis edilir.
--  2) Oransal (HAVUZ) modlarda hata daha buyuk: tesisin verisi iki havuza katilir
--     (cift sayim) ve tuketimi iki kez mahsup alir.
--  => Dolayisiyla kural HER MODDA aynidir: bir tesis yalnizca TEK listede olabilir.
--
-- UYGULAMA ONCESI DOGRULAMA (2026-09-30, salt SELECT): 15 atama, 15 distinct
-- (user_id, subscription_serno) -> cakisma YOK, kisit sorunsuz eklenir.
--
-- Admin UI'da ayni kural zaten engelleniyor (TalepBirlestirmeAdmin.addAssignment);
-- bu kisit veritabani tarafindaki kalici garantidir.

alter table public.ges_mahsup_assignments
  drop constraint if exists uq_gma_user_serno;

alter table public.ges_mahsup_assignments
  add constraint uq_gma_user_serno unique (user_id, subscription_serno);

comment on constraint uq_gma_user_serno on public.ges_mahsup_assignments is
  'Bir tesis (user_id, subscription_serno) yalnizca TEK GES listesinde olabilir. Zincirli tahsis defteri kodlanmadigi icin ayni serno iki listede olursa ayni kWh iki kez tahsis edilir; oransal (havuz) modlarda ayrica veris cift sayilir.';
