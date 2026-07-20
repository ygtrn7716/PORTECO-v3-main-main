-- Aşama 2B: Metod 2 (Uedaş) ve Metod 3 (Tredaş) motorları.
--
-- Snapshot replay'i için gereken alanlar:
-- sumCn / sumPos / sumMahsup / sumExcess MEVCUT kolonlardan türetilebilir
--   sumCn      = total_consumption_kwh
--   sumPos     = net_positive_draw_kwh
--   sumMahsup  = total_consumption_kwh - net_positive_draw_kwh   (min(cn,gn) = cn - max(0,cn-gn))
--   sumExcess  = net_excess_feed_kwh
-- Aşağıdakiler türetilemez, bu yüzden saklanır:
--   w_pos  : pos-ağırlıklı ÇIPLAK PTF. unit_price_energy = (PTF+YEKDEM)*KBK+adj biçiminde
--            füzyonlanmış olduğu için geri ayrıştırılamaz; ayrıca saklı ortalama cn-ağırlıklıdır,
--            metod 2/3 ise pos-ağırlıklı ortalama kullanır (farklı sayı).
--   kbk    : şu ana kadar invoice_snapshots'a hiç yazılmıyordu.
--   yekdem_tahmini + önceki dönem alanları : YEK Bedeli / YEK Farkı kalemleri için.
--   mahsuplasma_unit_price : metod 3 muhtelif-2 kredisinde kullanılan efektif birim fiyat.
-- Hepsi nullable: metod 1 snapshot'ları bu alanları doldurmaz (davranış değişmez).
alter table public.invoice_snapshots
  add column if not exists w_pos numeric,
  add column if not exists kbk numeric,
  add column if not exists yekdem_tahmini numeric,
  add column if not exists prev_sum_pos numeric,
  add column if not exists prev_yekdem_tahmini numeric,
  add column if not exists prev_yekdem_gerceklesen numeric,
  add column if not exists mahsuplasma_unit_price numeric;

comment on column public.invoice_snapshots.w_pos is
  'Metod 2/3: pozitif çekiş saatleri üzerinden PTF-ağırlıklı ÇIPLAK PTF (TL/kWh). NULL = metod 1.';
comment on column public.invoice_snapshots.kbk is
  'Faturayı keserken kullanılan subscription_settings.kbk. NULL = eski snapshot.';
comment on column public.invoice_snapshots.yekdem_tahmini is
  'Metod 2/3: dönemin ÇIPLAK tahmini YEKDEM değeri (subscription_yekdem.yekdem_value).';
comment on column public.invoice_snapshots.prev_sum_pos is
  'Metod 2/3: önceki dönemin net pozitif çekişi (YEK Farkı kaleminin tabanı). NULL = veri yok → kalem 0.';
comment on column public.invoice_snapshots.mahsuplasma_unit_price is
  'Metod 3: muhtelif-2 mahsup kredisinde uygulanan birim fiyat (override yoksa T-0 fiyatı).';

-- Metod 3 mahsuplaşma birim fiyat override anahtarı.
-- 20260718_001_add_yekdem_mahsup_override_key.sql ile aynı desen (drop + re-add).
alter table public.invoice_line_overrides
  drop constraint invoice_line_overrides_item_key_check;
alter table public.invoice_line_overrides
  add constraint invoice_line_overrides_item_key_check
  check (item_key in ('enerji','dagitim','btv','reaktif','guc','trafo','yekdem_mahsup','mahsuplasma'));

-- Aşama 2A'dan devreden temizlik: 20260719_001 yalnızca PUBLIC'ten revoke etmişti,
-- Supabase'in default grant'leri anon rolünde de EXECUTE bırakıyordu. Zararsızdı
-- (anon'da auth.uid() null → boş küme) ama yüzey gereksiz.
revoke execute on function public.get_my_billing_integrations() from anon;
