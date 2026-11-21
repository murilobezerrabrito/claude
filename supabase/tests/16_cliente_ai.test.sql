-- O banco do cliente AI (Fase 3, etapa 3b; SPEC, "Usuários e permissões" e "Segurança"; D-073): o cliente lê só pela
-- função própria, com segundo fator, só a própria família e só meses fechados, com a leitura na auditoria; nunca lê
-- relatórios, a auditoria, famílias CADM nem outra família (teste de vazamento do portão da Fase 3); cenários salvos
-- pessoais; sugestões de mudança no plano numa fila que o responsável ou a gestão respondem.
begin;
select plan(68);

\set G  'ae000000-0000-4000-8000-000000000001'
\set P  'ae000000-0000-4000-8000-000000000002'
\set R1 'ae000000-0000-4000-8000-000000000003'
\set R2 'ae000000-0000-4000-8000-000000000004'
\set B1 'ae000000-0000-4000-8000-000000000005'
\set KA 'ae000000-0000-4000-8000-000000000006'
\set KB 'ae000000-0000-4000-8000-000000000007'
\set KE 'ae000000-0000-4000-8000-000000000008'
\set K2 'ae000000-0000-4000-8000-000000000009'
\set KN 'ae000000-0000-4000-8000-00000000000a'
\set HA 'be000000-0000-4000-8000-00000000000a'
\set HB 'be000000-0000-4000-8000-00000000000b'
\set HC 'be000000-0000-4000-8000-00000000000c'
\set HE 'be000000-0000-4000-8000-00000000000e'
\set HN 'be000000-0000-4000-8000-00000000000f'

create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;

-- Dados de teste: A e B (AI, responsáveis R1 e R2, clientes KA e KB), C (CADM, banker B1), E (AI encerrada, cliente KE)
-- e N (AI sem mês fechado, cliente KN); K2 é cliente de A e de B (conta mal ligada).
insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'G', :'P', :'R1', :'R2', :'B1', :'KA', :'KB', :'KE', :'K2', :'KN']) u;
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, owner_id, banker_id, intermediary, profile_id, weights_source, fee_rate, seed, status) values
  (:'HA', 'T-KA', 'Teste cliente A', 'ai', :'R1', null, 'Corretora de teste', 'teste', 'carteira_atual', 0.008, 11, 'ativa'),
  (:'HB', 'T-KB', 'Teste cliente B', 'ai', :'R2', null, null, 'teste', 'carteira_atual', 0.008, 12, 'ativa'),
  (:'HC', 'T-KC', 'Teste CADM C', 'cadm', null, :'B1', null, 'teste', 'perfil', 0.008, 13, 'ativa'),
  (:'HE', 'T-KE', 'Teste encerrada', 'ai', :'R1', null, null, 'teste', 'carteira_atual', 0.008, 14, 'encerrada'),
  (:'HN', 'T-KN', 'Teste sem mês', 'ai', :'R1', null, null, 'teste', 'carteira_atual', 0.008, 15, 'ativa');
insert into public.user_roles (user_id, household_id, role, can_see_amounts) values
  (:'G', null, 'gestao', true), (:'P', null, 'compliance', true), (:'R1', null, 'responsavel', true), (:'R2', null, 'responsavel', true),
  (:'B1', null, 'banker', true), (:'KA', :'HA', 'cliente_ai', true), (:'KB', :'HB', 'cliente_ai', true), (:'KE', :'HE', 'cliente_ai', true),
  (:'K2', :'HA', 'cliente_ai', true), (:'K2', :'HB', 'cliente_ai', true), (:'KN', :'HN', 'cliente_ai', true);
insert into public.plan_versions (household_id, version, snapshot, base_month)
select h, 1, '{"people": []}', '2026-08-01' from unnest(array[:'HA', :'HB', :'HC', :'HN']::uuid[]) h;
select id as cma from public.cma_versions where status = 'vigente' \gset

-- Rodadas: agosto e setembro de A (setembro só rodado no começo), setembro de B e de C, fechados.
create function pg_temp.mes(p_h uuid, p_ref date, p_status public.month_status, p_prob numeric, p_cma uuid) returns void language plpgsql as $$
declare v_run uuid := gen_random_uuid();
begin
  insert into public.simulation_runs (id, household_id, inputs_hash, inputs, cma_version_id, seed, engine_version, paths, summary)
  values (v_run, p_h, 'h-' || p_ref, jsonb_build_object('pkg', jsonb_build_object(
            'household', jsonb_build_object('id', p_h, 'bankerId', 'banker-interno', 'seed', 1),
            'closing', jsonb_build_object('refDate', p_ref), 'profiles', jsonb_build_array(jsonb_build_object('id', 'modelo')))),
          p_cma, 1, 'x', 10000, jsonb_build_object('refMonth', to_char(p_ref, 'YYYY-MM'), 'probability', p_prob));
  insert into public.household_months (household_id, ref_date, official_pl, status) values (p_h, p_ref, 1000000, 'importado');
  update public.household_months set status = 'conferido' where household_id = p_h and ref_date = p_ref;
  update public.household_months set status = 'rodado' where household_id = p_h and ref_date = p_ref;
  insert into public.monthly_snapshots (household_id, ref_date, probability, wealth, cma_version_id, plan_version_id, run_id, attribution)
  select p_h, p_ref, p_prob, 1000000, p_cma, v.id, v_run, jsonb_build_object('kind', 'teste', 'mes', p_ref)
    from public.plan_versions v where v.household_id = p_h;
  if p_status = 'fechado' then
    update public.household_months set status = 'fechado' where household_id = p_h and ref_date = p_ref;
  end if;
end $$;
select pg_temp.mes(:'HA', '2026-08-31', 'fechado', 0.81, :'cma');
select pg_temp.mes(:'HA', '2026-09-30', 'rodado', 0.79, :'cma');
select pg_temp.mes(:'HB', '2026-09-30', 'fechado', 0.42, :'cma');
select pg_temp.mes(:'HC', '2026-09-30', 'fechado', 0.66, :'cma');
insert into public.reports (household_id, ref_date, prepared_by, snapshot) values (:'HC', '2026-09-30', :'G', '{}');
insert into public.scenarios (household_id, owner_id, name, params) values (:'HB', :'KB', 'Cenário de B', '{"retirementAge": 60}');
insert into public.plan_change_requests (household_id, requested_by, payload) values (:'HB', :'KB', '{"texto": "Sugestão de B"}');
insert into public.market_series (series_code, date, value, source) values ('ipca', '2026-08-01', 0.2, 'teste'), ('cdi', '2026-09-15', 0.05, 'teste')
on conflict (series_code, date) do update set value = excluded.value;
update public.legal_texts set status = 'aprovado', approved_by = :'P', approved_at = now()
 where key in ('rodape_app', 'aviso_completo') and status = 'rascunho'
   and not exists (select 1 from public.legal_texts a where a.key = legal_texts.key and a.status = 'aprovado');
-- Um rascunho novo do rodapé do app, que o cliente não pode receber.
insert into public.legal_texts (key, version, body) values ('rodape_app', 99, 'Rascunho do teste, ainda não aprovado.');

-- Cliente A, com segundo fator: o mês fechado da própria família -------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'KA');
select public.client_month() as ma \gset
select is((:'ma'::jsonb) #>> '{household,id}', :'HA', 'cliente A recebe a própria família');
select is((:'ma'::jsonb) #>> '{household,intermediary}', 'Corretora de teste', 'com o intermediário do cadastro');
select is((:'ma'::jsonb) ->> 'ref_date', '2026-08-31', 'o mês é o último fechado (setembro só rodou)');
select is(jsonb_array_length((:'ma'::jsonb) -> 'months'), 1, 'só os meses fechados');
select is((:'ma'::jsonb) #>> '{months,0,run,probability}', '0.81', 'com a rodada publicada do mês fechado');
select is((:'ma'::jsonb) #>> '{bridge,mes}', '2026-08-31', 'e a ponte do mês fechado, não a do mês rodado');
select ok(not ((:'ma'::jsonb) #> '{months,0,pkg,household}' ? 'bankerId'), 'as entradas vão sem o banker');
select is((:'ma'::jsonb) #> '{months,0,pkg,profiles}', '[]'::jsonb, 'e sem os perfis-modelo');
select ok((:'ma'::jsonb) -> 'legal' ? 'rodape_app' and (:'ma'::jsonb) -> 'legal' ? 'aviso_completo', 'com os textos legais aprovados');
select ok((:'ma'::jsonb) #>> '{legal,rodape_app,version}' <> '99'
          and not exists (select 1 from jsonb_each((:'ma'::jsonb) -> 'legal') e
                           where not exists (select 1 from public.legal_texts t where t.key = e.key and t.status = 'aprovado'
                                               and t.version = (e.value ->> 'version')::int)),
  'e nenhum rascunho de texto legal');
select is((:'ma'::jsonb) -> 'cdi', '{}'::jsonb, 'CDI só do período acompanhado (até o mês fechado)');
select is((:'ma'::jsonb) -> 'scenarios', '[]'::jsonb, 'sem os cenários de outra família');
select is((:'ma'::jsonb) -> 'requests', '[]'::jsonb, 'nem as sugestões de outra família');
select ok((:'ma'::jsonb)::text not like '%T-KB%' and (:'ma'::jsonb)::text not like '%0.42%' and (:'ma'::jsonb)::text not like '%T-KC%',
  'nada da família B nem da CADM na resposta');

-- Vazamento: nada direto, nada interno ---------------------------------------------------------------------------------

select is((select count(*)::int from public.households), 0, 'cliente A não lê famílias direto');
select is((select count(*)::int from public.monthly_snapshots), 0, 'nem retratos');
select is((select count(*)::int from public.simulation_runs), 0, 'nem rodadas');
select is((select count(*)::int from public.household_months), 0, 'nem a situação dos meses');
select is((select count(*)::int from public.scenarios), 0, 'nem cenários');
select is((select count(*)::int from public.plan_change_requests), 0, 'nem sugestões');
select is((select count(*)::int from public.reports), 0, 'nem relatórios');
select is((select count(*)::int from public.audit_log), 0, 'nem a auditoria');
select throws_ok($$ select public.report_months('2026-09-30') $$, '42501', null, 'relatórios pela API: recusa');
select throws_ok($$ select public.audit_trail('2026-01-01', '2026-12-31') $$, '42501', null, 'auditoria pela API: recusa');
select throws_ok($$ select public.families_overview() $$, '42501', null, 'lista de famílias com a chance: recusa');
select throws_ok(format('select public.household_detail(%L)', :'HC'), '42501', null, 'detalhe da família CADM: recusa');
select throws_ok(format('select public.plan_change_requests_of(%L)', :'HA'), '42501', null, 'a fila de sugestões é do responsável, não do cliente');
select throws_ok(format($$ insert into public.plan_change_requests (household_id, requested_by, payload) values (%L, %L, '{"texto": "direto"}') $$, :'HA', :'KA'),
  '42501', null, 'cliente A não grava sugestão direto');

-- Cenários salvos -------------------------------------------------------------------------------------------------------

select public.save_client_scenario('  Aposentar antes  ', '{"retirementAge": 59}') ->> 'name' as nome \gset
select is(:'nome'::text, 'Aposentar antes', 'cliente A salva um cenário (nome sem espaços nas pontas)');
select throws_ok($$ select public.save_client_scenario('aposentar ANTES', '{"retirementAge": 58}') $$, '23505', null, 'nome repetido não passa');
select throws_ok($$ select public.save_client_scenario('Vazio', '{}') $$, '22023', null, 'cenário sem mudança não passa');
select throws_ok($$ select public.save_client_scenario('Lista', '[1]') $$, '22023', null, 'hipóteses fora de um objeto não passam');
select throws_ok($$ select public.save_client_scenario('', '{"retirementAge": 58}') $$, '22023', null, 'sem nome não passa');
select throws_ok(format($$ select public.save_client_scenario('Grande', jsonb_build_object('x', %L::text)) $$, repeat('a', 4100)), '22023', null,
  'hipóteses grandes demais não passam');
select is(jsonb_array_length(public.client_month() -> 'scenarios'), 1, 'o cenário salvo volta no mês do cliente');
select throws_ok($$ select public.delete_client_scenario('ffffffff-0000-4000-8000-000000000000') $$, 'P0002', null, 'apagar cenário inexistente recusa');
reset role;
select id as cenario_b from public.scenarios where household_id = :'HB' \gset
select id as cenario_a from public.scenarios where household_id = :'HA' \gset
set local role authenticated;
select pg_temp.entrar(:'KA');
select throws_ok(format('select public.delete_client_scenario(%L)', :'cenario_b'), 'P0002', null, 'cliente A não apaga o cenário de B');
select lives_ok(format('select public.delete_client_scenario(%L)', :'cenario_a'), 'cliente A apaga o próprio cenário');
reset role;
select is((select count(*)::int from public.scenarios where household_id = :'HB'), 1, 'o cenário de B continua lá');
-- Limite de 20 cenários por cliente.
insert into public.scenarios (household_id, owner_id, name, params)
select :'HA', :'KA', 'Cenário ' || i, '{"retirementAge": 60}' from generate_series(1, 20) i;
set local role authenticated;
select pg_temp.entrar(:'KA');
select throws_ok($$ select public.save_client_scenario('O 21º', '{"retirementAge": 61}') $$, 'P0001', null, 'mais de 20 cenários não passa');

-- Sugestões de mudança no plano ------------------------------------------------------------------------------------------

select public.suggest_plan_change('A faculdade da filha começa um ano antes.') ->> 'id' as sugestao \gset
select ok(:'sugestao' is not null, 'cliente A sugere uma mudança no plano');
select throws_ok($$ select public.suggest_plan_change('oi') $$, '22023', null, 'sugestão curta demais não passa');
select is(public.client_month() #>> '{requests,0,status}', 'pendente', 'a sugestão volta no mês do cliente, pendente');
reset role;
select is((select payload ->> 'plan_version_id' from public.plan_change_requests where id = :'sugestao'),
          (select id::text from public.plan_versions where household_id = :'HA'), 'a sugestão guarda a versão do plano em vigor');
insert into public.plan_change_requests (household_id, requested_by, payload)
select :'HA', :'KA', jsonb_build_object('texto', 'Sugestão ' || i) from generate_series(1, 9) i;
set local role authenticated;
select pg_temp.entrar(:'KA');
select throws_ok($$ select public.suggest_plan_change('A décima primeira sugestão.') $$, 'P0001', null, 'mais de 10 pendentes não passa');

-- O responsável responde -----------------------------------------------------------------------------------------------

select pg_temp.entrar(:'R2');
select throws_ok(format('select public.plan_change_requests_of(%L)', :'HA'), '42501', null, 'o responsável de B não vê a fila de A');
select throws_ok(format($$ select public.review_plan_change(%L, 'confirmada', null) $$, :'sugestao'), 'P0002', null, 'nem responde');
select pg_temp.entrar(:'B1');
select throws_ok(format('select public.plan_change_requests_of(%L)', :'HA'), '42501', null, 'o banker não vê a fila da AI');
select pg_temp.entrar(:'R1', 'aal1');
select throws_ok(format('select public.plan_change_requests_of(%L)', :'HA'), '42501', null, 'sem segundo fator, o responsável não vê a fila');
select pg_temp.entrar(:'R1');
select is(jsonb_array_length(public.plan_change_requests_of(:'HA') -> 'requests'), 10, 'o responsável de A vê a fila da família');
select is((public.plan_change_requests_of(:'HA') ->> 'can_review')::boolean, true, 'e pode responder');
select throws_ok(format($$ select public.review_plan_change(%L, 'recusada', '') $$, :'sugestao'), '22023', null, 'recusar pede o motivo');
select throws_ok(format($$ select public.review_plan_change(%L, 'pendente', null) $$, :'sugestao'), '22023', null, 'a resposta é confirmar ou recusar');
select is(public.review_plan_change(:'sugestao', 'confirmada', 'Vou ajustar o plano esta semana.') ->> 'status', 'confirmada', 'o responsável confirma');
select throws_ok(format($$ select public.review_plan_change(%L, 'recusada', 'Mudei de ideia') $$, :'sugestao'), 'P0001', null,
  'sugestão respondida não muda mais');
select pg_temp.entrar(:'P');
select is((public.plan_change_requests_of(:'HA') ->> 'can_review')::boolean, false, 'a compliance lê a fila, sem responder');
select throws_ok(format($$ select public.review_plan_change(%L, 'confirmada', null) $$, :'sugestao'), 'P0002', null, 'e não responde');
select pg_temp.entrar(:'KA');
select is((select r ->> 'review_note' from jsonb_array_elements(public.client_month() -> 'requests') r where r ->> 'id' = :'sugestao'),
          'Vou ajustar o plano esta semana.', 'o cliente vê a resposta e a nota');
reset role;
select is((select count(*)::int from public.plan_versions where household_id = :'HA'), 1, 'confirmar não muda o plano sozinho');

-- Auditoria ---------------------------------------------------------------------------------------------------------------

select ok((select count(*) from public.audit_log where actor_id = :'KA' and action = 'cliente_ver_mes' and household_id = :'HA') >= 3,
  'cada leitura do cliente vai para a auditoria');
select ok(exists (select 1 from public.audit_log where actor_id = :'R1' and action = 'ver_sugestoes' and household_id = :'HA'),
  'a leitura da fila também');
select ok(exists (select 1 from public.audit_log where actor_id = :'R1' and target_table = 'plan_change_requests' and action = 'update'),
  'e a resposta');

-- Outras contas -----------------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'KA', 'aal1');
select throws_ok($$ select public.client_month() $$, '42501', null, 'sem segundo fator, nada');
select throws_ok($$ select public.save_client_scenario('x', '{"a": 1}') $$, '42501', null, 'nem salvar cenário');
select pg_temp.entrar(:'KE');
select throws_ok($$ select public.client_month() $$, 'P0001', null, 'família encerrada: o app não abre');
select pg_temp.entrar(:'K2');
select throws_ok($$ select public.client_month() $$, 'P0001', null, 'conta ligada a duas famílias: recusa em vez de escolher');
select pg_temp.entrar(:'KN');
select is(public.client_month() ->> 'ref_date', null, 'família sem mês fechado: o app abre sem números');
select pg_temp.entrar(:'G');
select throws_ok($$ select public.client_month() $$, '42501', null, 'a gestão não usa a função do cliente');

select * from finish();
rollback;
