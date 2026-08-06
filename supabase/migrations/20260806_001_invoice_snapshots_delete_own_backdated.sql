-- Geriye dönük fatura (backdated) silme yetkisi.
-- Canlı durum (2026-08-06 doğrulandı): invoice_snapshots'ta kullanıcı için
-- select/insert/update_own (auth.uid() = user_id) + invoice_snapshots_admin_all
-- var; kullanıcı DELETE politikası YOK → normal kullanıcının delete'i sessizce
-- 0 satır siler. Kullanıcı yalnız KENDİ 'backdated' snapshot'ını silebilsin;
-- 'billed' satırlar için kullanıcı DELETE hâlâ yok (yalnız admin_all silebilir).
create policy "invoice_snapshots_delete_own_backdated"
  on public.invoice_snapshots
  for delete
  using (auth.uid() = user_id and invoice_type = 'backdated');
