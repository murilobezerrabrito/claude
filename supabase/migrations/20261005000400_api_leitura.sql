-- AWARE Objective, Fase 2, etapa 1: leitura dos dados de família pela API (D-041, opção (a) de Murilo).
-- Usuários internos não leem as tabelas de família direto; leem por estas funções, que conferem o acesso, exigem o
-- segundo fator e gravam cada leitura na trilha de auditoria (quem, quando, o quê). As próximas etapas acrescentam as
-- funções de escrita (importação, plano, rodada, relatórios) com as mesmas regras.

-- Famílias que o usuário pode ver, com o canal opcional. Grava uma linha de auditoria por listagem.
create function public.list_households(p_channel public.channel default null)
returns setof public.households
language plpgsql security definer
set search_path = ''
as $$
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver as famílias.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  perform app.audit('listar_familias', 'households', null, null, jsonb_build_object('canal', p_channel));
  return query
    select h.* from public.households h
     where app.can_read_household(h.id) and (p_channel is null or h.channel = p_channel)
     order by h.name;
end
$$;

-- Cadastro, plano em vigor e último mês de uma família. Recusa sem acesso; grava a leitura.
create function public.household_detail(p_household uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not app.can_read_household(p_household) then
    raise exception 'Sem acesso a esta família.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  perform app.audit('ler_familia', 'households', p_household::text, p_household, null);
  select jsonb_build_object(
           'household', to_jsonb(h),
           'people', coalesce((select jsonb_agg(to_jsonb(p) order by p.birth_date) from public.people p where p.household_id = h.id), '[]'::jsonb),
           'other_assets', coalesce((select jsonb_agg(to_jsonb(a) order by a.name) from public.other_assets a where a.household_id = h.id), '[]'::jsonb),
           'cash_flows', coalesce((select jsonb_agg(to_jsonb(c) order by c.kind, c.name) from public.cash_flows c where c.household_id = h.id), '[]'::jsonb),
           'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.year, e.name) from public.events e where e.household_id = h.id), '[]'::jsonb),
           'goals', coalesce((select jsonb_agg(to_jsonb(g)) from public.goals g where g.household_id = h.id), '[]'::jsonb),
           'plan_version', (select to_jsonb(v) from public.plan_versions v where v.household_id = h.id order by v.base_month desc limit 1),
           'month', (select to_jsonb(m) from public.household_months m where m.household_id = h.id order by m.ref_date desc limit 1),
           'snapshot', (select to_jsonb(s) from public.monthly_snapshots s where s.household_id = h.id order by s.ref_date desc limit 1)
         )
    into result
    from public.households h
   where h.id = p_household;
  return result;
end
$$;

revoke all on function public.list_households(public.channel), public.household_detail(uuid) from public, anon;
grant execute on function public.list_households(public.channel), public.household_detail(uuid) to authenticated;
