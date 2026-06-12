-- GES Üretim Satışı — fatura snapshot'ına donmuş dağıtım kesinti oranı
--
-- "GES Üretim Satışı" kartı (fazla üretimin devlete satışından gelen net gelir)
-- faturadan AYRI gösterilir; fatura toplamlarına girmez. Net gelir =
-- brüt gelir − (satış kWh × dağıtım kesinti oranı).
--
-- invoice_snapshots.ges_satis_dagitim_bedeli: fatura kesilirken uygulanan
-- dağıtım kesinti oranı (TL/kWh). lisansli_satis'e göre
-- distribution_tariff_official.dagitim_uretici_1 (lisanslı) / dagitim_uretici_2
-- (lisanslı olmayan) değerinden seçilir; on_yil bu seçimi etkilemez.
--
-- Bu oran snapshot'ta donar; böylece tarife sonradan değişse bile geçmiş fatura
-- kartı o günkü oranla sabit kalır. Diğer girdiler (veris_kwh,
-- total_consumption_kwh, on_yil, usd_kur, perakende_enerji_bedeli, lisansli_satis)
-- zaten snapshot'ta saklı olduğundan net gelir bu oranla yeniden hesaplanabilir.
--
-- null = eski snapshot (kolon eklenmeden önce yazılmış) → gösterim tarafı
-- subscription_settings + distribution_tariff_official ile canlı fallback yapar.

alter table public.invoice_snapshots
  add column if not exists ges_satis_dagitim_bedeli numeric default null;

comment on column public.invoice_snapshots.ges_satis_dagitim_bedeli is
  'GES Üretim Satışı dağıtım kesinti oranı (TL/kWh), fatura kesilirken donmuş. lisansli_satis''e göre dagitim_uretici_1/2''den seçilir. null = eski snapshot, gösterimde canlı fallback.';
