-- 2026-10-16: Teknik Masura (52503, user 8694362b-8f77-4fdf-b6e4-a7f0b1f2ce31)
-- GES Üretim Satışı kartı kesinti tabanı: sold_only (yalnız satılan veriş × D/2).
--
-- Eylül 2026 beklenen değerler (sold_only):
--   GES Dağıtım kWh: 93.551,40 (satılan veriş)
--   Dağıtım Kesintisi: -55.310,25 TL
--   Net Gelir: 216.895,04 TL
--
-- Ana fatura değişmez.
-- UYGULANDI: 2026-10-16 MCP ile.

update public.subscription_settings
set ges_sale_dist_basis = 'sold_only'
where user_id = '8694362b-8f77-4fdf-b6e4-a7f0b1f2ce31'
  and subscription_serno = 52503;

update public.invoice_snapshots
set ges_sale_dist_basis = 'sold_only'
where user_id = '8694362b-8f77-4fdf-b6e4-a7f0b1f2ce31'
  and subscription_serno = 52503
  and period_year = 2026
  and period_month = 9
  and invoice_type = 'billed';
