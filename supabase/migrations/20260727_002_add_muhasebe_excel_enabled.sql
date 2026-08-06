alter table public.subscription_settings
  add column if not exists muhasebe_excel_enabled boolean not null default false;

comment on column public.subscription_settings.muhasebe_excel_enabled is
  'Fatura Detay > GES Olmasaydı panelinde Muhasebe Excel butonunu gosterir. Tesis bazli opt-in, varsayilan kapali.';
