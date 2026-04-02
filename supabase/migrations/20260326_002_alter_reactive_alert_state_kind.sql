-- reactive_alert_state.kind: 'rio' ve 'rco' değerlerini kabul et
-- kind kolonu text + check constraint

alter table public.reactive_alert_state
  drop constraint if exists reactive_alert_state_kind_check;

alter table public.reactive_alert_state
  add constraint reactive_alert_state_kind_check
    check (kind in ('ri', 'rc', 'rio', 'rco'));
