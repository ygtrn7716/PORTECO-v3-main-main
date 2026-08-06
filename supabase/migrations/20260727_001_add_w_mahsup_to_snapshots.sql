-- Aşama 2I — Metod 3 mahsuplaşma fiyatı gerçek formül (EPİAŞ satış makası).
-- mahsuplaşmaBirim = perakende_enerji_bedeli − (wMahsup + tahmini YEKDEM) × KBK.
-- wMahsup = mahsup-ağırlıklı ÇIPLAK PTF; replay determinizmi için dondurulur (w_pos deseni).
-- perakende_enerji_bedeli kolonu ZATEN VAR (20260410_003) ve replay'de kullanılıyor → eklenmez.

alter table public.invoice_snapshots
  add column if not exists w_mahsup numeric;

comment on column public.invoice_snapshots.w_mahsup is
  'Metod 3: mahsup (saat-içi örtüşme) saatleri üzerinden PTF-ağırlıklı ÇIPLAK PTF (TL/kWh). Mahsuplaşma formülünün girdisi. NULL = eski snapshot → sayfa açılışında yeni formülle re-damgalanır (T-0''a düşmez, mahsuplasma_unit_price donmuş efektif fiyatı verir).';
