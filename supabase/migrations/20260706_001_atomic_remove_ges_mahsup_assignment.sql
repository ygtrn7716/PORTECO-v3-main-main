-- Silme + yeniden numaralandırma TEK transaction'da: iki ayrı çağrı arasında
-- hata olursa priority=1 satırsız kalınıp havuz fazlasının hiçbir faturaya
-- yazılmaması riskini kaldırır. SECURITY DEFINER DEĞİL: RLS uygulanır;
-- admin olmayanın DELETE'i 0 satır etkiler ve exception atılır.
create or replace function public.remove_ges_mahsup_assignment(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_plant uuid;
begin
  delete from public.ges_mahsup_assignments
   where id = p_id
   returning ges_plant_id into v_plant;

  if v_plant is null then
    raise exception 'atama bulunamadi veya yetki yok';
  end if;

  update public.ges_mahsup_assignments a
     set priority = x.rn
    from (
      select id, row_number() over (order by priority) as rn
        from public.ges_mahsup_assignments
       where ges_plant_id = v_plant
    ) x
   where a.id = x.id
     and a.priority <> x.rn;
end $$;

grant execute on function public.remove_ges_mahsup_assignment(uuid) to authenticated;
