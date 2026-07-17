-- Audit: bu snapshot'a Talep Birleştirme ile tahsis edilen GES kWh.
-- Hesaba GİRMEZ (recompute mevcut alanlardan çalışır); teşhis/izleme içindir.
alter table public.invoice_snapshots
  add column if not exists allocated_ges_kwh numeric;
