-- ============================================================
-- invoice_snapshots.usd_kur:
-- Snapshot bütünlüğü için saklanan ay sonu USD/TL kuru.
-- subscription_yekdem.usd_kur değeri snapshot oluşturulurken kopyalanır.
-- ============================================================

ALTER TABLE public.invoice_snapshots
  ADD COLUMN IF NOT EXISTS usd_kur numeric(10,4) DEFAULT NULL;

COMMENT ON COLUMN public.invoice_snapshots.usd_kur IS
  'Bu fatura kesilirken geçerli olan USD/TL kuru. subscription_yekdem.usd_kur kopyası. recomputeSnapshotTotalWithMahsup bu değeri kullanır.';
