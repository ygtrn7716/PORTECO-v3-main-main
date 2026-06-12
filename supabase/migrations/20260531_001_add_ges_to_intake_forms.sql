-- ============================================================
-- Migration: intake_forms tablosuna GES (uretim tesisi) bilgileri
-- ============================================================
-- OSOS (osos_kullanici/osos_sifre) = tuketim portal bilgisi (SEDAS/ARiL).
-- Buradakiler AYRI: GES saglayici portallari (Growatt, SolarEdge, vb.)

alter table public.intake_forms
  add column if not exists has_ges               boolean not null default false,
  add column if not exists ges_saglayici_sayisi  integer not null default 0,
  add column if not exists ges_tesis_sayisi      integer not null default 0,
  add column if not exists ges_saglayicilar      jsonb   not null default '[]'::jsonb;

-- ges_saglayicilar elemani sekli:
--   { saglayici, saglayici_diger, kullanici, sifre, tesis_sayisi, notlar }
