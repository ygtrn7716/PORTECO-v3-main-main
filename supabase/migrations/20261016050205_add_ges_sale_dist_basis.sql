-- GES Üretim Satışı kartı dağıtım kesintisinin kWh tabanı (tesis bazlı). Yalnız Metot 3 Trepaş
-- 2026-09+ bölünmüş dağıtımda (breakdown.tredasGesDagitim) etkili; ana fatura değişmez.
-- total_veris = toplam veriş (satılan + mahsup) × D/2 (varsayılan).
-- sold_only = yalnız satılan veriş × D/2.

alter table public.subscription_settings
  add column if not exists ges_sale_dist_basis text not null default 'total_veris';

alter table public.subscription_settings
  add constraint subscription_settings_ges_sale_dist_basis_chk
  check (ges_sale_dist_basis in ('total_veris','sold_only'));

comment on column public.subscription_settings.ges_sale_dist_basis is
  'GES Uretim Satisi karti dagitim kesintisi kWh tabani (yalniz m3 Trepas 2026-09+). total_veris = toplam veris (satilan + mahsup) x D/2 (varsayilan). sold_only = yalniz satilan veris x D/2.';

-- Snapshot damgası: dönem dondurulur; ayar sonradan değişirse geçmiş snapshot değişmez.
alter table public.invoice_snapshots
  add column if not exists ges_sale_dist_basis text not null default 'total_veris';

alter table public.invoice_snapshots
  add constraint invoice_snapshots_ges_sale_dist_basis_chk
  check (ges_sale_dist_basis in ('total_veris','sold_only'));

comment on column public.invoice_snapshots.ges_sale_dist_basis is
  'Yazim anindaki subscription_settings.ges_sale_dist_basis damgasi (replay GES satis karti tabani). Mevcut satirlar total_veris.';
