ALTER TABLE invoice_snapshots
  ADD COLUMN IF NOT EXISTS veris_kwh numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_distribution_unit_price numeric DEFAULT 0;
