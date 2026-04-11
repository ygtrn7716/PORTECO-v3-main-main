ALTER TABLE invoice_snapshots
  ADD COLUMN on_yil boolean DEFAULT NULL,
  ADD COLUMN veris_satis_bedeli numeric DEFAULT NULL,
  ADD COLUMN perakende_enerji_bedeli numeric DEFAULT NULL;
