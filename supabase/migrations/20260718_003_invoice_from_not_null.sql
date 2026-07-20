-- Aşama 1B: invoice_from zorunlu hale geliyor.
-- Not: meram/kcetas/oedas firma satırları prod'a MCP ile eklendi;
-- sıfırdan kurulum paritesi için seed burada tekrarlanır (idempotent).

insert into public.invoice_companies (key, display_name, method_id) values
  ('meram',  'Meram',  1),
  ('kcetas', 'Kcetaş', 1),
  ('oedas',  'Oedaş',  1)
on conflict (key) do nothing;

alter table public.user_integrations
  alter column invoice_from set not null;
