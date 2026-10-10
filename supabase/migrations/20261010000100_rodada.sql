-- AWARE Objective, Fase 2, etapa 3b: rodada oficial do mês (SPEC, "Fluxo do mês", "Termômetro mensal" e "Onde roda a
-- rodada oficial"). A rodada roda na Edge Function `official-run`, uma simulação por chamada; o banco entrega as
-- entradas, guarda as partes e grava o resultado. Regras:
-- - Só a gestão, com segundo fator, pede a rodada (run_permission, com o token de quem pede).
-- - Entradas, partes e gravação são só da função do servidor (service_role): o navegador nunca grava números.
-- - Só família conferida roda; o mês anterior, se existe, precisa estar fechado (a ponte parte do número publicado).
-- - A rodada usa só o IPCA oficial do mês.
-- - Toda rodada gera um registro em simulation_runs (só inserção) e o retrato do mês em monthly_snapshots, que trava
--   quando a família fecha o mês. Se o mês volta para "importado", o retrato sai (o histórico fica em simulation_runs).

-- Partes da rodada já simuladas, à espera da montagem. Só as funções abaixo leem e escrevem: acesso por linha ligado e
-- sem nenhuma política nem privilégio para os papéis da API (como app.import_staging, D-048; teste em 10_rodada).
create table app.run_parts (
  household_id uuid not null references public.households (id),
  ref_date public.month_end not null,
  part text not null check (part in ('principal', 'gasto_flexivel', 'inicio', 'passagem_do_tempo', 'mercado',
                                     'aportes_e_resgates', 'carteira', 'plano')),
  inputs_hash text not null,
  result jsonb not null,
  compute_ms numeric(10, 1) not null check (compute_ms >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (household_id, ref_date, part)
);
alter table app.run_parts enable row level security;
revoke all on app.run_parts from public, anon, authenticated;

-- Registro de rodada é só de inserção. A única mudança aceita é a que o próprio banco faz quando o cliente apaga um
-- cenário (scenario_id vira nulo, on delete set null); nada mais muda.
create function app.deny_run_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.scenario_id is not null and new.scenario_id is null
     and to_jsonb(new) - 'scenario_id' = to_jsonb(old) - 'scenario_id' then
    return new;
  end if;
  raise exception 'O registro de rodada não muda nem é apagado.' using errcode = 'P0001', hint = 'rodada_imutavel';
end
$$;
create trigger rodada_so_insercao
  before update or delete on public.simulation_runs
  for each row execute function app.deny_run_change();

-- Retrato do mês de família fechada não muda.
create function app.guard_snapshot() returns trigger
language plpgsql
set search_path = ''
as $$
declare r record;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if exists (select 1 from public.household_months m
              where m.household_id = r.household_id and m.ref_date = r.ref_date and m.status = 'fechado') then
    raise exception 'O mês desta família está fechado: o retrato do mês não muda.' using errcode = 'P0001', hint = 'mes_fechado';
  end if;
  return r;
end
$$;
create trigger retrato_do_mes_fechado
  before insert or update or delete on public.monthly_snapshots
  for each row execute function app.guard_snapshot();

-- Mês que volta de "rodado" para "importado": o retrato sai (a rodada ficou para trás).
create function app.drop_stale_snapshot() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'rodado' and new.status = 'importado' then
    delete from public.monthly_snapshots where household_id = new.household_id and ref_date = new.ref_date;
  end if;
  return null;
end
$$;
create trigger retrato_desatualizado
  after update on public.household_months
  for each row execute function app.drop_stale_snapshot();

-- Quem pede a rodada -------------------------------------------------------------------------------------------------

-- A função do servidor chama com o token de quem pediu: só a gestão, com segundo fator. Devolve o usuário.
create function public.run_permission()
returns uuid
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.require_role('gestao', 'rodar o mês');
  return auth.uid();
end
$$;

-- Nas funções só do servidor, quem pediu passa a ser o usuário da sessão: a auditoria grava o nome certo.
create function app.act_as(p_actor uuid, p_what text) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_actor is null or not app.user_has_role(p_actor, 'gestao') then
    raise exception 'Só a gestão pede %.', p_what using errcode = '42501', hint = 'sem_acesso';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
end
$$;

-- Entradas -----------------------------------------------------------------------------------------------------------

-- Premissas no formato do motor (src/engine, Cma): classes em ordem de código e a matriz de correlação completa.
create function app.cma_json(p_cma uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  with cls as (
    select class_code, name, benchmark, mu_real, vol, row_number() over (order by class_code collate "C") as i
      from public.cma_classes where cma_version_id = p_cma
  )
  select jsonb_build_object(
    'version', v.label, 'label', v.label, 'nu', v.nu,
    'classes', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('code', class_code, 'name', name, 'benchmark', benchmark,
                                                                       'mu', mu_real, 'vol', vol)) order by i) from cls),
    'correlation', (select jsonb_agg(row_json order by i) from (
       select a.i, jsonb_agg(case when a.class_code = b.class_code then 1::numeric
                                  else coalesce((select c.rho from public.cma_correlations c
                                                  where c.cma_version_id = p_cma
                                                    and c.class_a = least(a.class_code collate "C", b.class_code collate "C")
                                                    and c.class_b = greatest(a.class_code collate "C", b.class_code collate "C")), 0) end
                             order by b.i) as row_json
         from cls a cross join cls b group by a.i) m))
    from public.cma_versions v where v.id = p_cma
$$;

-- Entradas da rodada de uma família no mês, no formato de src/report (RunInputs): o pacote do mês (cadastro, plano em
-- vigor, fechamento em reais por classe, premissas vigentes e perfis), o IPCA oficial e a rodada publicada do mês
-- anterior. Recusa o que não pode rodar. Só a função do servidor chama; a leitura vai para a auditoria.
create function public.run_inputs(p_household uuid, p_ref_date date, p_actor uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  m public.household_months;
  h public.households;
  v_plan public.plan_versions;
  v_cma uuid;
  v_prev public.household_months;
  v_prev_snapshot public.monthly_snapshots;
  v_prev_run public.simulation_runs;
  v_previous jsonb := null;
  v_pkg jsonb;
begin
  perform app.act_as(p_actor, 'a rodada');
  select * into m from public.household_months where household_id = p_household and ref_date = p_ref_date;
  if not found or m.status <> 'conferido' then
    raise exception 'Só família conferida roda (situação: %).', coalesce(m.status::text, 'sem importação')
      using errcode = 'P0001', hint = 'rodada_status';
  end if;
  select * into h from public.households where id = p_household;
  select * into v_plan from public.plan_versions
   where household_id = p_household and base_month <= date_trunc('month', p_ref_date)
   order by base_month desc limit 1;
  if v_plan.id is null then
    raise exception 'A família não tem plano em vigor no mês.' using errcode = 'P0001', hint = 'sem_plano';
  end if;
  select id into v_cma from public.cma_versions where status = 'vigente';
  if v_cma is null then
    raise exception 'Não há premissas vigentes.' using errcode = 'P0001', hint = 'sem_premissas';
  end if;
  if not exists (select 1 from public.market_series where series_code = 'ipca' and date = date_trunc('month', p_ref_date)::date) then
    raise exception 'Falta o IPCA oficial de %: a rodada usa só o IPCA oficial do mês.', to_char(p_ref_date, 'MM/YYYY')
      using errcode = 'P0001', hint = 'sem_ipca';
  end if;

  -- Mês anterior: sem ele, é o primeiro mês acompanhado; com ele, precisa estar fechado (a ponte parte do publicado).
  select * into v_prev from public.household_months
   where household_id = p_household and ref_date = (date_trunc('month', p_ref_date) - interval '1 day')::date;
  if v_prev.household_id is not null then
    if v_prev.status <> 'fechado' then
      raise exception 'O mês anterior (%) ainda não foi fechado: feche-o antes de rodar este mês.', to_char(v_prev.ref_date, 'MM/YYYY')
        using errcode = 'P0001', hint = 'mes_anterior_aberto';
    end if;
    select * into v_prev_snapshot from public.monthly_snapshots where household_id = p_household and ref_date = v_prev.ref_date;
    select * into v_prev_run from public.simulation_runs where id = v_prev_snapshot.run_id;
    if v_prev_run.id is null then
      raise exception 'O mês anterior está fechado sem rodada publicada.' using errcode = 'P0001', hint = 'mes_anterior_sem_rodada';
    end if;
    v_previous := jsonb_build_object('pkg', v_prev_run.inputs -> 'pkg', 'published', v_prev_run.summary);
  end if;

  v_pkg := jsonb_build_object(
    'household', jsonb_strip_nulls(jsonb_build_object(
       'id', h.id, 'name', h.name, 'channel', h.channel, 'bankerId', h.banker_id, 'profileId', h.profile_id,
       'weightsSource', h.weights_source, 'suitability', h.suitability, 'feeRate', h.fee_rate, 'horizonAge', h.horizon_age,
       'seed', h.seed)),
    'planVersion', jsonb_strip_nulls(jsonb_build_object(
       'id', v_plan.id, 'baseMonth', to_char(v_plan.base_month, 'YYYY-MM'), 'createdAt', v_plan.created_at, 'note', v_plan.note))
       || jsonb_build_object('snapshot', v_plan.snapshot),
    'closing', jsonb_build_object(
       'refDate', p_ref_date,
       'positionsByClass', (select coalesce(jsonb_object_agg(class_code, total), '{}'::jsonb) from (
           select a.class_code, sum(p.net_value_brl) as total
             from public.positions p join public.assets a on a.id = p.asset_id
            where p.household_id = p_household and p.ref_date = p_ref_date group by a.class_code) t),
       'officialPl', m.official_pl,
       'flows', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'date', f.flow_date, 'kind', f.kind, 'amount', f.amount_brl, 'description', f.description))
           order by f.flow_date nulls last, f.id)
         from public.flows f where f.household_id = p_household and f.ref_date = p_ref_date), '[]'::jsonb)),
    'cma', app.cma_json(v_cma),
    'profiles', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', id, 'name', name, 'weightsPre', weights_pre,
                                                                        'weightsPost', weights_post)) order by id)
                   from public.profiles));

  perform app.audit('ler_entradas_da_rodada', 'households', p_household::text, p_household, jsonb_build_object('mes', p_ref_date));
  return jsonb_build_object(
    'inputs', jsonb_build_object(
      'pkg', v_pkg,
      'ipca', (select coalesce(jsonb_object_agg(to_char(date, 'YYYY-MM'), value / 100), '{}'::jsonb)
                 from public.market_series where series_code = 'ipca'),
      'previous', v_previous),
    'cma_version_id', v_cma,
    'plan_version_id', v_plan.id);
end
$$;

-- Partes -------------------------------------------------------------------------------------------------------------

create function public.record_run_part(p_household uuid, p_ref_date date, p_part text, p_inputs_hash text, p_result jsonb,
                                       p_compute_ms numeric, p_actor uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.act_as(p_actor, 'a rodada');
  if not exists (select 1 from public.household_months where household_id = p_household and ref_date = p_ref_date and status = 'conferido') then
    raise exception 'Só família conferida roda.' using errcode = 'P0001', hint = 'rodada_status';
  end if;
  insert into app.run_parts (household_id, ref_date, part, inputs_hash, result, compute_ms, created_by)
  values (p_household, p_ref_date, p_part, p_inputs_hash, p_result, round(p_compute_ms, 1), p_actor)
  on conflict (household_id, ref_date, part) do update
    set inputs_hash = excluded.inputs_hash, result = excluded.result, compute_ms = excluded.compute_ms,
        created_by = excluded.created_by, created_at = now();
end
$$;

create function public.run_parts(p_household uuid, p_ref_date date)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(part, jsonb_build_object('inputsHash', inputs_hash, 'result', result, 'computeMs', compute_ms)), '{}'::jsonb)
    from app.run_parts where household_id = p_household and ref_date = p_ref_date
$$;

-- Gravação -----------------------------------------------------------------------------------------------------------

-- Grava a rodada montada pela função do servidor: o registro (só inserção), o retrato do mês e a família rodada.
create function public.record_official_run(p_household uuid, p_ref_date date, p_actor uuid, p_inputs jsonb, p_run jsonb,
                                           p_snapshot jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  m public.household_months;
  v_cma uuid := (p_snapshot ->> 'cma_version_id')::uuid;
  v_plan uuid := (p_snapshot ->> 'plan_version_id')::uuid;
  v_run uuid;
  v_ms numeric;
begin
  perform app.act_as(p_actor, 'a rodada');
  select * into m from public.household_months where household_id = p_household and ref_date = p_ref_date for update;
  if not found or m.status <> 'conferido' then
    raise exception 'Só família conferida roda.' using errcode = 'P0001', hint = 'rodada_status';
  end if;
  if not exists (select 1 from public.cma_versions where id = v_cma and status = 'vigente') then
    raise exception 'A rodada precisa das premissas vigentes.' using errcode = 'P0001', hint = 'sem_premissas';
  end if;
  if not exists (select 1 from public.plan_versions where id = v_plan and household_id = p_household) then
    raise exception 'Versão do plano de outra família.' using errcode = 'P0001', hint = 'sem_plano';
  end if;
  if (p_run ->> 'refDate')::date is distinct from p_ref_date then
    raise exception 'A rodada é de outro mês.' using errcode = 'P0001', hint = 'rodada_mes';
  end if;

  insert into public.simulation_runs (household_id, inputs_hash, inputs, cma_version_id, seed, engine_version, paths, summary, created_by)
  values (p_household, p_run ->> 'inputsHash', p_inputs, v_cma, (p_run ->> 'seed')::bigint, p_run ->> 'engineVersion',
          (p_run ->> 'paths')::integer, p_run, p_actor)
  returning id into v_run;

  insert into public.monthly_snapshots (household_id, ref_date, probability, required_return, slack, wealth, realized_return_real,
                                        cma_version_id, plan_version_id, run_id, attribution)
  values (p_household, p_ref_date, (p_run ->> 'probability')::numeric, (p_run ->> 'requiredReturn')::numeric,
          (p_run ->> 'slack')::numeric, round((p_run ->> 'wealth')::numeric, 2), (p_snapshot ->> 'realized_return_real')::numeric,
          v_cma, v_plan, v_run, p_snapshot -> 'attribution')
  on conflict (household_id, ref_date) do update
    set probability = excluded.probability, required_return = excluded.required_return, slack = excluded.slack,
        wealth = excluded.wealth, realized_return_real = excluded.realized_return_real, cma_version_id = excluded.cma_version_id,
        plan_version_id = excluded.plan_version_id, run_id = excluded.run_id, attribution = excluded.attribution;

  update public.household_months set status = 'rodado' where household_id = p_household and ref_date = p_ref_date;
  select coalesce(sum(compute_ms), 0) into v_ms from app.run_parts where household_id = p_household and ref_date = p_ref_date;
  delete from app.run_parts where household_id = p_household and ref_date = p_ref_date;
  perform app.audit('rodar_mes', 'simulation_runs', v_run::text, p_household,
                    jsonb_build_object('mes', p_ref_date, 'chance', p_run -> 'probability', 'tempo_de_calculo_ms', v_ms));
  return jsonb_build_object('run_id', v_run, 'probability', (p_run ->> 'probability')::numeric, 'compute_ms', v_ms);
end
$$;

-- Leitura: famílias com a chance ---------------------------------------------------------------------------------------

-- Famílias por canal (SPEC, "Console interno"): o retrato mais recente (chance, r*, folga e patrimônio), a chance do
-- retrato anterior (variação no mês), a data das posições e o status do mês. Mesmas regras de month_overview.
create function public.families_overview(p_channel public.channel default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver as famílias.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not (app.is_internal() or app.has_role('banker') or app.has_role('responsavel')) then
    raise exception 'Sem permissão para ver as famílias.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  perform app.audit('listar_familias', 'households', null, null, jsonb_build_object('canal', p_channel, 'com_retrato', true));
  select coalesce(jsonb_agg(jsonb_build_object(
           'household_id', h.id, 'code', h.code, 'name', h.name, 'channel', h.channel, 'status', h.status,
           'profile_id', h.profile_id, 'weights_source', h.weights_source,
           'latest', (select jsonb_build_object('ref_date', s.ref_date, 'probability', s.probability, 'required_return', s.required_return,
                                                'slack', s.slack, 'wealth', s.wealth, 'realized_return_real', s.realized_return_real)
                        from public.monthly_snapshots s where s.household_id = h.id order by s.ref_date desc limit 1),
           -- A do mês imediatamente anterior ao do retrato mais recente; família que pulou um mês fica sem variação.
           'previous_probability', (select p.probability from public.monthly_snapshots p
                                     where p.household_id = h.id
                                       and p.ref_date = (select (date_trunc('month', max(s.ref_date)) - interval '1 day')::date
                                                           from public.monthly_snapshots s where s.household_id = h.id)),
           'month', (select jsonb_build_object('ref_date', m.ref_date, 'status', m.status)
                       from public.household_months m where m.household_id = h.id order by m.ref_date desc limit 1))
         order by h.channel, h.code), '[]'::jsonb)
    into result
    from public.households h
   where (p_channel is null or h.channel = p_channel) and app.can_read_household(h.id);
  return case when app.can_see_amounts() then result else app.mask_amounts(result) end;
end
$$;

-- A visão do mês mostra a chance da rodada de cada família (quando já rodou).
create or replace function public.month_overview(p_ref_date date, p_channel public.channel default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para ver o mês.' using errcode = '42501', hint = 'segundo_fator';
  end if;
  if not (app.is_internal() or app.has_role('banker') or app.has_role('responsavel')) then
    raise exception 'Sem permissão para ver o mês.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  perform app.audit('ver_mes', 'household_months', p_ref_date::text, null, jsonb_build_object('canal', p_channel));
  select jsonb_build_object(
    'ref_date', p_ref_date,
    'families', coalesce((
      select jsonb_agg(jsonb_build_object(
               'household_id', h.id, 'code', h.code, 'name', h.name, 'channel', h.channel,
               'status', coalesce(m.status::text, 'pendente'), 'official_pl', m.official_pl, 'checks', m.checks,
               'return_confirmed_by', m.return_confirmed_by,
               'probability', (select s.probability from public.monthly_snapshots s where s.household_id = h.id and s.ref_date = p_ref_date),
               'positions', (select count(*) from public.positions p where p.household_id = h.id and p.ref_date = p_ref_date),
               'flows', (select count(*) from public.flows f where f.household_id = h.id and f.ref_date = p_ref_date))
             order by h.channel, h.code)
        from public.households h
        left join public.household_months m on m.household_id = h.id and m.ref_date = p_ref_date
       where (p_channel is null or h.channel = p_channel) and app.can_read_household(h.id)
         and (h.status = 'ativa' or m.household_id is not null)), '[]'::jsonb),
    'closings', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.channel) from public.month_closings c
       where c.ref_date = p_ref_date and (p_channel is null or c.channel = p_channel)), '[]'::jsonb),
    'batches', case when app.is_internal() then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'kind', b.kind, 'file_name', b.file_name, 'status', b.status, 'rows', b.row_count,
               'total_value', b.total_value, 'official_total', b.official_total, 'uploaded_by', b.uploaded_by,
               'created_at', b.created_at, 'confirmed_by', b.confirmed_by, 'confirmed_at', b.confirmed_at)
             order by b.created_at)
        from public.import_batches b where b.ref_date = p_ref_date), '[]'::jsonb) else '[]'::jsonb end)
    into result;
  return case when app.can_see_amounts() then result else app.mask_amounts(result) end;
end
$$;

-- Leitura do cliente AI: só o que foi fechado ---------------------------------------------------------------------------

-- "Só família fechada alimenta relatório e app" (SPEC, "Fluxo do mês"): o cliente AI lê o retrato e a rodada oficial
-- do mês só depois que a família fecha o mês. Rodadas que ficaram para trás (mês que voltou para "importado") não
-- aparecem. As rodadas dos cenários do "E se?" ganham a sua regra no app (Fase 3).
create function app.is_closed_month(p_household uuid, p_ref date) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.household_months m
                  where m.household_id = p_household and m.ref_date = p_ref and m.status = 'fechado')
$$;

create function app.is_published_run(p_run uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.monthly_snapshots s
                   join public.household_months m on m.household_id = s.household_id and m.ref_date = s.ref_date
                  where s.run_id = p_run and m.status = 'fechado')
$$;

drop policy cliente_le_a_propria_familia on public.monthly_snapshots;
create policy cliente_le_a_propria_familia on public.monthly_snapshots
  for select to authenticated using (app.is_client_of(household_id) and app.is_closed_month(household_id, ref_date));
drop policy cliente_le_a_propria_familia on public.simulation_runs;
create policy cliente_le_a_propria_familia on public.simulation_runs
  for select to authenticated using (app.is_client_of(household_id) and app.is_published_run(id));

-- O detalhe da família (api_leitura) mostra ao cliente AI o retrato mais recente de mês fechado; à equipe, o mais
-- recente, rodado ou fechado.
create or replace function public.household_detail(p_household uuid)
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
           'snapshot', (select to_jsonb(s) from public.monthly_snapshots s
                         where s.household_id = h.id and (not app.is_client_of(h.id) or app.is_closed_month(h.id, s.ref_date))
                         order by s.ref_date desc limit 1)
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

revoke all on function app.deny_run_change(), app.guard_snapshot(), app.drop_stale_snapshot(), app.act_as(uuid, text),
  app.cma_json(uuid), app.is_closed_month(uuid, date), app.is_published_run(uuid) from public;
grant execute on function app.is_closed_month(uuid, date), app.is_published_run(uuid) to authenticated;
revoke all on function public.run_permission(), public.run_inputs(uuid, date, uuid),
  public.record_run_part(uuid, date, text, text, jsonb, numeric, uuid), public.run_parts(uuid, date),
  public.record_official_run(uuid, date, uuid, jsonb, jsonb, jsonb), public.families_overview(public.channel) from public, anon, authenticated;
grant execute on function public.run_permission(), public.families_overview(public.channel) to authenticated;
grant execute on function public.run_inputs(uuid, date, uuid), public.record_run_part(uuid, date, text, text, jsonb, numeric, uuid),
  public.run_parts(uuid, date), public.record_official_run(uuid, date, uuid, jsonb, jsonb, jsonb) to service_role;
