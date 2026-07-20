-- Kayseri metod 1'e alınıyor: vhs_kayseri özelleştirmeleri metod 1 motorunun içinde yaşıyor,
-- "metod dışı" kavramı kaldırılıyor.
update public.invoice_companies set method_id = 1 where key = 'kayseri_osb' and method_id is null;

alter table public.invoice_companies drop constraint if exists invoice_companies_method_required;
alter table public.invoice_companies alter column method_id set not null;

-- Kullanıcının kendi entegrasyonlarının fatura bilgisini ŞİFRESİZ okuyabilmesi için RPC.
-- user_integrations RLS'i değişmiyor; bu fonksiyon yalnızca zararsız kolonları döner.
create or replace function public.get_my_billing_integrations()
returns table (integration_id uuid, provider text, invoice_from text, method_id smallint)
language sql
security definer
set search_path = public
stable
as $$
  select ui.id, ui.provider, ui.invoice_from, ic.method_id
  from public.user_integrations ui
  join public.invoice_companies ic on ic.key = ui.invoice_from
  where ui.user_id = auth.uid();
$$;

revoke all on function public.get_my_billing_integrations() from public;
grant execute on function public.get_my_billing_integrations() to authenticated;
