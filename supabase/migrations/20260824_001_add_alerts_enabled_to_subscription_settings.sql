-- Reaktif uyarı bildirimlerini tesis bazında kapatabilmek için bayrak.
-- Bugüne kadar alıcılar yalnızca kullanıcı bazındaydı (user_phone_numbers / user_emails),
-- tek bir tesisi susturmanın yolu yoktu.
-- default true = mevcut ve yeni tüm tesisler bildirim açık başlar, davranış değişmez.

alter table public.subscription_settings
  add column if not exists alerts_enabled boolean not null default true;

comment on column public.subscription_settings.alerts_enabled is
  'Reaktif uyari SMS/e-posta gonderimini tesis bazinda kapatir. false ise levelFor hesabi ve reactive_alert_state upsert''i calismaya devam eder, sadece gonderim ve log yazimi atlanir. Fatura/ceza hesabini etkilemez. Varsayilan acik.';
