-- AWARE Objective, Fase 3, etapa 3b: o banco do cliente AI (SPEC, "Canal 2: app dos clientes AI", "Usuários e
-- permissões" e "Segurança"; plano da Fase 3 aprovado em 20/11/2026, D-071; decisões desta etapa na D-073).
-- Regras:
-- - O cliente AI lê só pelas funções abaixo, com segundo fator, só a própria família, só meses fechados, e cada leitura
--   vai para a auditoria. As políticas de leitura direta das tabelas de família saem (a D-054 lia direto).
-- - As funções internas de leitura (lista e detalhe da família) deixam de atender o cliente: mostram o mês aberto, a
--   conferência e campos internos.
-- - Cenários salvos são pessoais; sugestões de mudança no plano entram numa fila que o responsável (ou a gestão)
--   confirma ou recusa. Confirmar não muda o plano: quem confirma edita o plano no console.

-- O cliente não lê as tabelas direto -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['households', 'people', 'other_assets', 'cash_flows', 'events', 'goals', 'plan_versions', 'positions',
                           'flows', 'household_months', 'monthly_snapshots', 'simulation_runs'] loop
    execute format('drop policy cliente_le_a_propria_familia on public.%I', t);
  end loop;
end $$;
drop policy cliente_le_os_seus_cenarios on public.scenarios;
drop policy cliente_cria_os_seus_cenarios on public.scenarios;
drop policy cliente_muda_os_seus_cenarios on public.scenarios;
drop policy cliente_apaga_os_seus_cenarios on public.scenarios;
drop policy cliente_le_as_suas_sugestoes on public.plan_change_requests;
drop policy cliente_sugere on public.plan_change_requests;

-- Leitura interna (lista, detalhe e situação das famílias): gestão, comitê, compliance, banker e responsável.
create or replace function app.can_read_household(hid uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.mfa_ok() and (
    app.is_internal()
    or exists (
      select 1 from public.households h
      where h.id = hid and (
        (h.channel = 'cadm' and h.banker_id = auth.uid() and app.has_role('banker'))
        or (h.channel = 'ai' and h.owner_id = auth.uid() and app.has_role('responsavel'))
      )
    )
  )
$$;

-- A família do cliente que entrou ------------------------------------------------------------------------------------

-- Confere o segundo fator e o papel e devolve a família (uma por conta de cliente; família encerrada não entra).
create function app.client_household(p_what text) returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_status text;
begin
  if not app.mfa_ok() then
    raise exception 'Confirme o segundo fator para %.', p_what using errcode = '42501', hint = 'segundo_fator';
  end if;
  select array_agg(ur.household_id) into v_ids
    from public.user_roles ur join public.households h on h.id = ur.household_id
   where ur.user_id = auth.uid() and ur.role = 'cliente_ai' and h.channel = 'ai';
  if v_ids is null then
    raise exception 'Sem permissão para %.', p_what using errcode = '42501', hint = 'sem_acesso';
  end if;
  if cardinality(v_ids) > 1 then
    raise exception 'Esta conta está ligada a mais de uma família; fale com o seu assessor.' using errcode = 'P0001', hint = 'varias_familias';
  end if;
  select status into v_status from public.households where id = v_ids[1];
  if v_status <> 'ativa' then
    raise exception 'O acompanhamento desta família foi encerrado; fale com o seu assessor.' using errcode = 'P0001', hint = 'familia_encerrada';
  end if;
  return v_ids[1];
end
$$;

-- As entradas do mês que o cliente recebe: sem o banker e sem perfis-modelo (o cliente AI simula só a carteira atual,
-- D-071), o resto como a rodada oficial gravou.
create function app.client_pkg(p_pkg jsonb) returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_set(jsonb_set(p_pkg, '{household}', (p_pkg -> 'household') - 'bankerId'), '{profiles}', '[]'::jsonb)
$$;

-- Textos legais que o app usa: o rodapé do app e os do relatório (o retrato do mês é montado no aparelho com o
-- mesmo código do relatório, que leva o aviso completo, a nota da ponte e o texto do primeiro mês).
create function app.client_legal_keys() returns text[]
language sql immutable
set search_path = ''
as $$ select array['rodape_app', 'rodape_relatorio', 'nota_ponte', 'primeiro_relatorio', 'aviso_completo'] $$;

-- O mês do cliente: o mês fechado mais recente da própria família, com os meses fechados até ele (o pacote de entradas
-- e a rodada publicada de cada um), a ponte do mês, o IPCA, o CDI do período, os textos legais aprovados, os cenários
-- salvos do cliente e as suas sugestões. Sem mês fechado, "ref_date" vem nulo. Grava a leitura na auditoria.
create function public.client_month()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_household uuid := app.client_household('ver os números do mês');
  h public.households;
  v_ref date;
  v_first date;
  v_texts jsonb;
begin
  select * into h from public.households where id = v_household;
  select max(s.ref_date) into v_ref
    from public.monthly_snapshots s
    join public.household_months m on m.household_id = s.household_id and m.ref_date = s.ref_date
   where s.household_id = v_household and m.status = 'fechado';
  select min(s.ref_date) into v_first
    from public.monthly_snapshots s
    join public.household_months m on m.household_id = s.household_id and m.ref_date = s.ref_date
   where s.household_id = v_household and m.status = 'fechado';
  select jsonb_object_agg(t.key, jsonb_build_object('version', t.version, 'body', t.body)) into v_texts
    from public.legal_texts t where t.status = 'aprovado' and t.key = any (app.client_legal_keys());
  perform app.audit('cliente_ver_mes', 'households', v_household::text, v_household, jsonb_build_object('mes', v_ref));
  return jsonb_build_object(
    'schema', 1,
    'household', jsonb_build_object('id', h.id, 'name', h.name, 'intermediary', h.intermediary),
    'ref_date', v_ref,
    'months', case when v_ref is null then '[]'::jsonb else (
      select jsonb_agg(jsonb_build_object('pkg', app.client_pkg(r.inputs -> 'pkg'), 'run', r.summary) order by ms.ref_date)
        from public.monthly_snapshots ms
        join public.household_months m on m.household_id = ms.household_id and m.ref_date = ms.ref_date
        join public.simulation_runs r on r.id = ms.run_id
       where ms.household_id = v_household and ms.ref_date <= v_ref and m.status = 'fechado') end,
    'bridge', (select s.attribution from public.monthly_snapshots s where s.household_id = v_household and s.ref_date = v_ref),
    'ipca', case when v_ref is null then '{}'::jsonb else (
      select coalesce(jsonb_object_agg(to_char(date, 'YYYY-MM'), value / 100), '{}'::jsonb)
        from public.market_series where series_code = 'ipca') end,
    'cdi', case when v_ref is null then '{}'::jsonb else (
      select coalesce(jsonb_object_agg(to_char(date, 'YYYY-MM-DD'), value), '{}'::jsonb)
        from public.market_series
       where series_code = 'cdi' and date >= date_trunc('month', v_first)::date and date <= v_ref) end,
    'legal', coalesce(v_texts, '{}'::jsonb),
    'scenarios', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'params', s.params, 'created_at', s.created_at) order by s.created_at)
        from public.scenarios s where s.household_id = v_household and s.owner_id = auth.uid()), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.payload ->> 'texto', 'status', q.status, 'created_at', q.created_at,
                                          'reviewed_at', q.reviewed_at, 'review_note', q.review_note) order by q.created_at desc)
        from public.plan_change_requests q where q.household_id = v_household and q.requested_by = auth.uid()), '[]'::jsonb));
end
$$;

-- Cenários salvos do cliente (pessoais) -------------------------------------------------------------------------------

-- Até 20 por cliente, nome único (sem diferença de maiúsculas), hipóteses num objeto de até 4 KB. O app confere as
-- hipóteses com as regras do "E se?" ao salvar e de novo ao abrir (um cenário salvo num mês pode não caber no seguinte).
create function public.save_client_scenario(p_name text, p_params jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_household uuid := app.client_household('salvar cenários');
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  s public.scenarios;
begin
  if v_name is null or length(v_name) > 80 then
    raise exception 'Dê ao cenário um nome de até 80 caracteres.' using errcode = '22023', hint = 'nome_invalido';
  end if;
  if p_params is null or jsonb_typeof(p_params) <> 'object' or p_params = '{}'::jsonb or length(p_params::text) > 4000 then
    raise exception 'O cenário precisa de ao menos uma mudança.' using errcode = '22023', hint = 'cenario_invalido';
  end if;
  if exists (select 1 from public.scenarios where household_id = v_household and owner_id = auth.uid() and lower(name) = lower(v_name)) then
    raise exception 'Já existe um cenário com este nome.' using errcode = '23505', hint = 'nome_repetido';
  end if;
  if (select count(*) from public.scenarios where household_id = v_household and owner_id = auth.uid()) >= 20 then
    raise exception 'Você já tem 20 cenários salvos; apague um antes de salvar outro.' using errcode = 'P0001', hint = 'limite_de_cenarios';
  end if;
  insert into public.scenarios (household_id, owner_id, name, params) values (v_household, auth.uid(), v_name, p_params)
  returning * into s;
  return jsonb_build_object('id', s.id, 'name', s.name, 'params', s.params, 'created_at', s.created_at);
end
$$;

create function public.delete_client_scenario(p_scenario uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_household uuid := app.client_household('apagar cenários');
begin
  delete from public.scenarios where id = p_scenario and household_id = v_household and owner_id = auth.uid() and not for_meeting;
  if not found then
    raise exception 'Cenário não encontrado.' using errcode = 'P0002', hint = 'cenario_inexistente';
  end if;
end
$$;

-- Sugestões de mudança no plano ---------------------------------------------------------------------------------------

alter table public.plan_change_requests add column review_note text
  constraint nota_curta check (review_note is null or length(review_note) <= 500);

-- O cliente sugere em texto livre (5 a 1.000 caracteres), com até 10 sugestões pendentes por família. A sugestão
-- guarda a versão do plano em vigor, para quem confirma saber de qual plano o cliente partiu.
create function public.suggest_plan_change(p_text text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_household uuid := app.client_household('sugerir mudanças no plano');
  v_text text := trim(coalesce(p_text, ''));
  q public.plan_change_requests;
begin
  if length(v_text) < 5 or length(v_text) > 1000 then
    raise exception 'Escreva a sugestão em 5 a 1.000 caracteres.' using errcode = '22023', hint = 'texto_invalido';
  end if;
  if (select count(*) from public.plan_change_requests where household_id = v_household and status = 'pendente') >= 10 then
    raise exception 'Já há 10 sugestões esperando o seu assessor; espere a resposta antes de mandar outra.'
      using errcode = 'P0001', hint = 'muitas_sugestoes';
  end if;
  insert into public.plan_change_requests (household_id, requested_by, payload)
  values (v_household, auth.uid(), jsonb_build_object(
    'texto', v_text,
    'plan_version_id', (select v.id from public.plan_versions v
                         where v.household_id = v_household and v.base_month <= date_trunc('month', current_date)::date
                         order by v.base_month desc limit 1)))
  returning * into q;
  return jsonb_build_object('id', q.id, 'text', q.payload ->> 'texto', 'status', q.status, 'created_at', q.created_at,
                            'reviewed_at', null, 'review_note', null);
end
$$;

-- A fila de uma família no console: o responsável (as suas famílias AI) e a gestão confirmam; comitê e compliance
-- leem. Grava a leitura na auditoria.
create function public.plan_change_requests_of(p_household uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not app.can_read_household(p_household) or not (app.is_internal() or app.can_write_plan(p_household)) then
    raise exception 'Sem acesso às sugestões desta família.' using errcode = '42501', hint = 'sem_acesso';
  end if;
  perform app.audit('ver_sugestoes', 'plan_change_requests', null, p_household, null);
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'text', q.payload ->> 'texto', 'plan_version_id', q.payload ->> 'plan_version_id', 'status', q.status,
           'requested_by', (select u.email from auth.users u where u.id = q.requested_by), 'created_at', q.created_at,
           'reviewed_by', (select u.email from auth.users u where u.id = q.reviewed_by), 'reviewed_at', q.reviewed_at,
           'review_note', q.review_note)
         order by (q.status = 'pendente') desc, q.created_at desc), '[]'::jsonb)
    into result
    from public.plan_change_requests q where q.household_id = p_household;
  return jsonb_build_object('can_review', app.can_write_plan(p_household), 'requests', result);
end
$$;

-- Confirmar ou recusar uma sugestão pendente; recusar pede o motivo, que o cliente vê.
create function public.review_plan_change(p_request uuid, p_decision public.request_status, p_note text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  q public.plan_change_requests;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into q from public.plan_change_requests where id = p_request for update;
  if not found or not app.can_write_plan(q.household_id) then
    raise exception 'Sugestão não encontrada.' using errcode = 'P0002', hint = 'sugestao_inexistente';
  end if;
  if q.status <> 'pendente' then
    raise exception 'Esta sugestão já foi respondida.' using errcode = 'P0001', hint = 'sugestao_respondida';
  end if;
  if p_decision is null or p_decision not in ('confirmada', 'recusada') then
    raise exception 'Escolha confirmar ou recusar.' using errcode = '22023', hint = 'decisao_invalida';
  end if;
  if p_decision = 'recusada' and (v_note is null or length(v_note) < 3) then
    raise exception 'Diga ao cliente por que a sugestão foi recusada.' using errcode = '22023', hint = 'sem_motivo';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'A nota vai até 500 caracteres.' using errcode = '22023', hint = 'nota_longa';
  end if;
  update public.plan_change_requests
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
   where id = q.id;
  return jsonb_build_object('id', q.id, 'status', p_decision);
end
$$;

-- Permissões -----------------------------------------------------------------------------------------------------------

revoke all on function app.client_household(text), app.client_pkg(jsonb), app.client_legal_keys() from public;
revoke all on function public.client_month(), public.save_client_scenario(text, jsonb), public.delete_client_scenario(uuid),
  public.suggest_plan_change(text), public.plan_change_requests_of(uuid), public.review_plan_change(uuid, public.request_status, text)
  from public, anon;
grant execute on function public.client_month(), public.save_client_scenario(text, jsonb), public.delete_client_scenario(uuid),
  public.suggest_plan_change(text), public.plan_change_requests_of(uuid), public.review_plan_change(uuid, public.request_status, text)
  to authenticated;
