-- Admin, fatura kalem override'larindan (invoice_line_overrides) sonra ilgili
-- donemin snapshot'ini efektif degerlerle yeniden yazabilsin (Asama 2 admin
-- sayfasi: /dashboard/admin/faturalar).
--
-- Mevcut durum: "Admin full read" yalnizca SELECT veriyordu; INSERT/UPDATE
-- politikalari `auth.uid() = user_id` ile sinirliydi ve DELETE politikasi hic
-- yoktu. Bu yuzden admin baska bir kullanicinin snapshot'ina yazamiyordu
-- (TalepBirlestirmeAdmin'in snapshot sifirlama akisi da bu nedenle sessizce
-- 0 satir siliyordu).
--
-- Neden gerekli: upsertInvoiceSnapshot'in tek cagirani InvoiceDetail ve o M-1
-- donemine sabit. Yani M-1'den eski bir doneme konan override hicbir musteri
-- eylemiyle snapshot'a yansimaz; grafikler (monthly_dashboard_series sakli
-- total_with_mahsup okur) ve Aylik Ozet o donem icin kalici olarak dogal
-- rakami gosterirdi.
--
-- Konvansiyon: <table>_admin_all (bkz. invoice_line_overrides_admin_all,
-- gma_admin_all, finance_accounts_admin_all).

create policy "invoice_snapshots_admin_all"
  on public.invoice_snapshots
  for all
  using ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true)
  with check ((((auth.jwt() -> 'app_metadata') ->> 'is_admin'))::boolean = true);
