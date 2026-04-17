-- ============================================================
-- Migration: Rate limiting for public form submissions
-- contact_messages: max 3 per email per hour
-- intake_forms:     max 2 per telefon per 24 hours
-- ============================================================

-- ── 1) contact_messages rate limit ──────────────────────────

create or replace function public.check_contact_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*)
    into recent_count
    from public.contact_messages
   where email = NEW.email
     and created_at > now() - interval '1 hour';

  if recent_count >= 3 then
    raise exception 'Rate limit: Bu e-posta adresi ile saatte en fazla 3 mesaj gönderilebilir.'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

create trigger trg_contact_messages_rate_limit
  before insert on public.contact_messages
  for each row
  execute function public.check_contact_rate_limit();

-- ── 2) intake_forms rate limit ──────────────────────────────

create or replace function public.check_intake_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*)
    into recent_count
    from public.intake_forms
   where telefon = NEW.telefon
     and created_at > now() - interval '24 hours';

  if recent_count >= 2 then
    raise exception 'Rate limit: Bu telefon numarası ile 24 saat içinde en fazla 2 başvuru yapılabilir.'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

create trigger trg_intake_forms_rate_limit
  before insert on public.intake_forms
  for each row
  execute function public.check_intake_rate_limit();

-- ── 3) Performance indexes for rate limit queries ───────────

create index if not exists idx_contact_messages_email_created
  on public.contact_messages(email, created_at desc);

create index if not exists idx_intake_forms_telefon_created
  on public.intake_forms(telefon, created_at desc);
