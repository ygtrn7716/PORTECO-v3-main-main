alter table public.subscription_settings
  add column if not exists dagitim_kendi_veris boolean not null default false;

comment on column public.subscription_settings.dagitim_kendi_veris is
  'true: Metot 1 dağıtım bedeli tesisin KENDİ sayaç verişiyle hesaplanır (MEPAŞ/MEDAŞ usulü). C = ham sayaç çekişi + trafo kaybı, G = tesisin kendi ham verişi (havuz tahsisi/fazla dağıtımı etkilemez). Perakende dağıtım = D × (C − min(G, C)/2). G > C ise ayrı MEDAŞ veriş faturası (Sistem Kullanım Bedeli) = (G − C) × dagitim_uretici_1. Lisanslı tesisler dahil.';

alter table public.invoice_snapshots
  add column if not exists dagitim_kendi_veris boolean,
  add column if not exists medas_veris_kwh numeric,
  add column if not exists medas_veris_birim numeric,
  add column if not exists medas_veris_bedeli numeric;

comment on column public.invoice_snapshots.medas_veris_kwh is 'dagitim_kendi_veris=true iken max(0, G − C) kWh (tesisin kendi verişi − dağıtım çekişi)';
comment on column public.invoice_snapshots.medas_veris_birim is 'MEDAŞ Sistem Kullanım Bedeli birim fiyatı (distribution_tariff_official.dagitim_uretici_1)';
comment on column public.invoice_snapshots.medas_veris_bedeli is 'MEDAŞ veriş faturası tutarı, KDV hariç = medas_veris_kwh × medas_veris_birim. Perakende fatura toplamına dahil DEĞİL (ayrı fatura).';
