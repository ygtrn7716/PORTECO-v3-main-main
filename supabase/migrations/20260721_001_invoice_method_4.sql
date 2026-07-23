-- Aşama 2F — Metod 4 (GES'siz düz fatura / BKA Enerji).
-- Mahsuplaşma yok, dağıtım = brüt × varsayılan tarife, üretimin tamamı satışa gider.
-- Enerji fiyatı metod 1 formülüyle aynı; motor tarafı metod-1 boru hattını üretim
-- girdileri sıfırlanmış çağırır (kod: src/lib/invoiceMethods.ts dispatcher metod-4 dalı).
--
-- invoice_companies.method_id → invoice_methods(id) FK; 1|2|3 CHECK kısıtı yok → seed yeterli.
-- provider (owner_subscriptions/user_integrations = veri kaynağı) ile invoice_from (tedarikçi)
-- AYRI kavramlar: 367338 provider='sepas' KALIR, metodu invoice_from='bka_enerji'den alır.

insert into public.invoice_methods (id, name, description) values
  (4, 'Metod 4', 'GES''siz düz fatura: mahsup yok, dağıtım = brüt × varsayılan tarife, üretimin tamamı satışa gider. Enerji fiyatı metod 1 formülüyle aynı.')
on conflict (id) do nothing;

insert into public.invoice_companies (key, display_name, method_id) values
  ('bka_enerji', 'BKA Enerji', 4)
on conflict (key) do nothing;

update public.user_integrations
   set invoice_from = 'bka_enerji'
 where user_id = '020253a1-b61d-4625-84b9-68bc542b5924';
