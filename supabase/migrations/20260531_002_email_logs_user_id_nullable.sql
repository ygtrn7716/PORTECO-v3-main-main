-- ============================================================
-- email_logs.user_id'yi nullable yap.
-- Sebep: intake_forms public formdur; gonderen anonim olabilir.
-- Mevcut RLS:
--   users_select_own_email_logs  (auth.uid() = user_id) — null durumda
--     hicbir kullaniciya match etmez, yani anonim log private kalir.
--   admins_select_all_email_logs (is_admin = true) — adminler her zaman
--     gorebilir.
-- ============================================================

alter table public.email_logs
  alter column user_id drop not null;
