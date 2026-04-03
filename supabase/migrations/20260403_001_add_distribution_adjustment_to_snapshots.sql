-- Add production kWh and distribution adjustment columns to invoice_snapshots
-- for facilities with veriş (energy export/production).
-- DEFAULT 0 ensures backward compatibility with existing rows.

ALTER TABLE invoice_snapshots
  ADD COLUMN IF NOT EXISTS total_production_kwh numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distribution_adjustment numeric DEFAULT 0;
