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

-- Valores em reais que somem para quem não pode vê-los (user_roles.can_see_amounts = false).
create function app.mask_amounts(j jsonb) returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
  hidden constant text[] := array['value', 'annual_income', 'net_sale_value', 'annual_amount_real', 'amount_real', 'amount',
                                  'wealth', 'official_pl', 'snapshot', 'attribution'];
  result jsonb;
begin
  case jsonb_typeof(j)
    when 'object' then
      select coalesce(jsonb_object_agg(e.key, app.mask_amounts(e.value)), '{}'::jsonb) into result
        from jsonb_each(j) e where e.key <> all (hidden);
      return result;
    when 'array' then
      select coalesce(jsonb_agg(app.mask_amounts(e.value) order by e.ord), '[]'::jsonb) into result
        from jsonb_array_elements(j) with ordinality e(value, ord);
      return result;
    else
      return j;
  end case;
end
$$;

-- O usuário atual pode ver valores em reais: nenhum dos seus papéis tem can_see_amounts = false.
create function app.can_see_amounts() returns boolean
language sql stable security definer
set search_path = ''
as $$ select not exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and not ur.can_see_amounts) $$;

revoke all on function app.mask_amounts(jsonb), app.can_see_amounts() from public;

-- Cadastro, plano e último mês de uma família. Recusa sem acesso; grava a leitura.
-- "plan_version" é a versão em vigor hoje (mês-base até o mês corrente, D-033); "latest_plan_version", a mais recente,
-- que pode ter mês-base futuro. Sem permissão para valores em reais, eles saem da resposta.
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
  perform app.audit('ler_familia', 'households', p_household::text, p_household, jsonb_build_object('valores', app.can_see_amounts()));
  select jsonb_build_object(
           'household', to_jsonb(h),
           'people', coalesce((select jsonb_agg(to_jsonb(p) order by p.birth_date) from public.people p where p.household_id = h.id), '[]'::jsonb),
           'other_assets', coalesce((select jsonb_agg(to_jsonb(a) order by a.name) from public.other_assets a where a.household_id = h.id), '[]'::jsonb),
           'cash_flows', coalesce((select jsonb_agg(to_jsonb(c) order by c.kind, c.name) from public.cash_flows c where c.household_id = h.id), '[]'::jsonb),
           'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.year, e.name) from public.events e where e.household_id = h.id), '[]'::jsonb),
           'goals', coalesce((select jsonb_agg(to_jsonb(g)) from public.goals g where g.household_id = h.id), '[]'::jsonb),
           'plan_version', (select to_jsonb(v) from public.plan_versions v
                             where v.household_id = h.id and v.base_month <= date_trunc('month', current_date)::date
                             order by v.base_month desc limit 1),
           'latest_plan_version', (select to_jsonb(v) from public.plan_versions v where v.household_id = h.id order by v.base_month desc limit 1),
           'month', (select to_jsonb(m) from public.household_months m where m.household_id = h.id order by m.ref_date desc limit 1),
           'snapshot', (select to_jsonb(s) from public.monthly_snapshots s where s.household_id = h.id order by s.ref_date desc limit 1)
         )
    into result
    from public.households h
   where h.id = p_household;
  if not app.can_see_amounts() then
    result := app.mask_amounts(result);
  end if;
  return result;
end
$$;

revoke all on function public.list_households(public.channel), public.household_detail(uuid) from public, anon;
grant execute on function public.list_households(public.channel), public.household_detail(uuid) to authenticated;
