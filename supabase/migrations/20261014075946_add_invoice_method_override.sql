alter table public.subscription_settings
  add column if not exists invoice_method_override smallint
    references public.invoice_methods(id);

comment on column public.subscription_settings.invoice_method_override is
  'Abonelik bazlı fatura metodu. NULL → şirket metodu (invoice_companies.method_id, user_integrations.invoice_from üzerinden). Dolu → bu abonelik için şirket metodunun yerine geçer. İlk kullanım: Niğde As Beton (10128583, 10126953, 9062757) → 7 (Meram); aynı şirketteki ODTÜ GV Niğde ve 10124578 şirket metodunda kalır.';
