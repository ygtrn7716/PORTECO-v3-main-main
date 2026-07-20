-- Aşama 3: YEKDEM mahsubunun manuel override edilebilmesi.
--
-- Bazı tesislerin M-1 tüketim verisi sisteme düşmediği için mahsup bloğu
-- prevPeriodKwh > 0 koşulunda erken çıkıyor ve mahsup hiç hesaplanamıyor.
-- Admin, mahsup dönemi toplam tüketimini ve YEKDEM farkını elle girip mahsubu
-- oluşturabilsin diye invoice_line_overrides'a yeni bir item_key ekleniyor.
--
-- Yeni tablo/kolon YOK: değerler mevcut payload jsonb alanında yaşar
--   { "total_kwh": number, "diff_yekdem": number }
-- is_excluded = true → o dönem mahsup 0'a zorlanır.
--
-- 'yekdem_mahsup' bir fatura KALEMİ değildir; calculateInvoice bu anahtarı
-- görmezden gelir (applyItem pull modeli). Mahsup calculateInvoice'ın dışında,
-- totalWithMahsup = totalInvoice + yekdemMahsup + digerDegerler ile eklenir.

alter table public.invoice_line_overrides
  drop constraint invoice_line_overrides_item_key_check;

alter table public.invoice_line_overrides
  add constraint invoice_line_overrides_item_key_check
  check (item_key in ('enerji','dagitim','btv','reaktif','guc','trafo','yekdem_mahsup'));
