-- ============================================================
-- invoice_snapshots: saatlik net mahsup alanları
--
-- Net üretici (verişi > tüketimi olan) tesislerde dağıtım bedeli artık AYLIK
-- net yerine SAATLİK net üzerinden hesaplanıyor:
--   net_positive_draw_kwh = Σ max(0, cn − gn)  → yeni dağıtım bedeli bazı
--   net_excess_feed_kwh   = Σ max(0, gn − cn)  → yeni GES üretim satışı kWh'ı
--
-- recompute (recomputeSnapshotTotalWithMahsup / InvoiceSnapshotDetail) saatlik
-- consumption_hourly verisini yeniden çekmediği için bu iki toplam snapshot'a
-- yazılır. NULL = eski snapshot → calculateInvoice aylık davranışa fallback.
-- ============================================================

ALTER TABLE public.invoice_snapshots
  ADD COLUMN IF NOT EXISTS net_positive_draw_kwh numeric,
  ADD COLUMN IF NOT EXISTS net_excess_feed_kwh   numeric;

-- ── Backfill (tek seferlik) ──────────────────────────────────
-- Mevcut snapshot'lar için consumption_hourly'den Europe/Istanbul ay sınırıyla
-- saatlik net'leri hesaplayıp yaz. Tüm satırlara yazılır; calculateInvoice
-- gate'i bunları yalnızca net üretici tesislerde kullanır.
UPDATE public.invoice_snapshots s
SET net_positive_draw_kwh = agg.npd,
    net_excess_feed_kwh   = agg.nef
FROM (
  SELECT subscription_serno,
         (EXTRACT(year  FROM ts AT TIME ZONE 'Europe/Istanbul'))::int AS py,
         (EXTRACT(month FROM ts AT TIME ZONE 'Europe/Istanbul'))::int AS pm,
         SUM(GREATEST(0, cn - gn)) AS npd,
         SUM(GREATEST(0, gn - cn)) AS nef
  FROM public.consumption_hourly
  GROUP BY subscription_serno, py, pm
) agg
WHERE s.subscription_serno = agg.subscription_serno
  AND s.period_year  = agg.py
  AND s.period_month = agg.pm;
