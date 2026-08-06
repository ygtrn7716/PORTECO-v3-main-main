-- Backdated snapshot'lara ham aylık YEKDEM ve tüketim-ağırlıklı aylık PTF damgası.
-- Metod 1 satırlarında bugüne dek kbk/yekdem_tahmini NULL kalıyordu; geriye dönük
-- akışta manuel girilen YEKDEM subscription_yekdem'e YAZILMADIĞI için (kullanıcı
-- yazma RLS'i yok, spec gereği de yazılmaz) tek kalıcı iz snapshot'tır.
-- billed yazarları bu kolonlara DOKUNMAZ (upsert payload'ına yalnız parametre
-- verildiğinde eklenir) → mevcut billed satırlar ve akışları etkilenmez.
-- Replay (buildSnapshotBreakdown) bu kolonları OKUMAZ.
alter table public.invoice_snapshots
  add column if not exists monthly_yekdem numeric,
  add column if not exists monthly_ptf numeric;

comment on column public.invoice_snapshots.monthly_yekdem is
  'Dönemin ÇIPLAK aylık YEKDEM''i (TL/kWh) — birim fiyat formülünün girdisi ((PTF+YEKDEM)×KBK+düzeltme). Manuel girilmişse (backdated akışı) tek kalıcı kayıt burasıdır; subscription_yekdem''e asla yazılmaz. NULL = eski/billed satır → gösterim tarafı subscription_yekdem''den canlı okur.';

comment on column public.invoice_snapshots.monthly_ptf is
  'Dönemin tüketim-ağırlıklı aylık PTF''i (TL/kWh, epias_ptf_hourly.ptf_tl_mwh/1000). Audit amaçlı; replay bu kolonu OKUMAZ (w_pos''tan farklı ağırlıklama). NULL = eski/billed satır.';
