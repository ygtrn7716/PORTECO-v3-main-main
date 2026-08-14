-- Metod 5 — İpragaz: Metod 2 (Uedaş, saatlik net) birebir kopyası; TEK FARK BTV matrahı.
--   m2 BTV matrahı = enerji (+ trafo)                       [Uludağ gerçek faturasıyla doğrulandı]
--   m5 BTV matrahı = enerji + YEK bedeli (+ trafo)          [tümü mahsup sonrası NET taban]
-- Motor tarafı: calculateInvoiceNetMethods.ts (method=5 dalı), dispatcher invoiceMethods.ts.
--
-- 'ipragaz' 20260718_002'de method_id=1 ile seed'lenmişti → UPDATE (insert değil).
-- invoice_companies.method_id'de CHECK yok, invoice_methods(id) FK var → önce seed.

insert into public.invoice_methods (id, name, description) values
  (5, 'Metod 5', 'İpragaz: Metod 2 (saatlik net) birebir kopyası; tek fark BTV matrahı = enerji + YEK bedeli + trafo (net taban).')
on conflict (id) do nothing;

update public.invoice_companies set method_id = 5 where key = 'ipragaz';

-- 'yek' override anahtarı: YEK Bedeli (m2/m5) / Tahmini YEKDEM (m3) satırı override edilebilsin.
-- unit_price_override = TL/kWh (doğal birim: tahminiYekdem × KBK), öncelik: is_excluded > amount > unit_price.
-- Motor kuralı: 'yek' YALNIZ Metod 5'te BTV matrahına efektif değeriyle akar;
-- m2/m3'te satırı değiştirir ama BTV'yi ETKİLEMEZ (doğrulanmış m2/m3 çıktıları bit-identik kalır).

alter table public.invoice_line_overrides
  drop constraint invoice_line_overrides_item_key_check;

alter table public.invoice_line_overrides
  add constraint invoice_line_overrides_item_key_check
  check (item_key in ('enerji','dagitim','btv','reaktif','guc','trafo','yekdem_mahsup','mahsuplasma','yek'));
