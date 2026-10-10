-- Rodada oficial (SPEC, "Fluxo do mês" e "Onde roda a rodada oficial"): só a gestão, com segundo fator, pede; só a
-- função do servidor lê as entradas e grava; só família conferida roda, com o mês anterior fechado; registro só de
-- inserção; retrato do mês travado quando a família fecha; famílias com a chance, com as regras de leitura.
begin;
select plan(30);

\set G  'aa000000-0000-4000-8000-000000000001'
\set C  'aa000000-0000-4000-8000-000000000002'
\set K  'aa000000-0000-4000-8000-000000000003'
\set P  'aa000000-0000-4000-8000-000000000004'
\set H  'ba000000-0000-4000-8000-00000000000a'
\set HK 'ba000000-0000-4000-8000-00000000000b'
\set V  'fa000000-0000-4000-8000-000000000001'

-- Entra como um usuário. Também troca o usuário que as funções do servidor assumem (app.act_as), porque aqui tudo roda
-- numa transação só; no servidor, cada chamada é uma transação.
create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'G', :'C', :'K', :'P']) u;
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 0.5, "ACOES": 0.5}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, owner_id, profile_id, weights_source, fee_rate, seed) values
  (:'H', 'T-RA', 'Teste rodada', 'cadm', null, 'teste', 'perfil', 0.008, 7),
  (:'HK', 'T-RK', 'Teste rodada AI', 'ai', null, 'teste', 'carteira_atual', 0.008, 8);
insert into public.user_roles (user_id, household_id, role, can_see_amounts) values
  (:'G', null, 'gestao', true), (:'C', null, 'comite', true), (:'K', :'HK', 'cliente_ai', true), (:'P', null, 'compliance', false);
insert into public.plan_versions (household_id, version, snapshot, base_month) values (:'H', 1, '{"people": []}', '2026-08-01');

-- Premissas vigentes de teste (a do seed sai de vigor dentro do teste).
update public.cma_versions set status = 'arquivada' where status = 'vigente';
insert into public.cma_versions (id, label, nu, status) values (:'V', 'teste-rodada', 5, 'rascunho');
insert into public.cma_classes (cma_version_id, class_code, name, mu_real, vol) values (:'V', 'POS', 'Pós', 0.04, 0.015), (:'V', 'ACOES', 'Ações', 0.065, 0.24);
insert into public.cma_correlations (cma_version_id, class_a, class_b, rho) values (:'V', 'ACOES', 'POS', 0.1);
update public.cma_versions set status = 'aprovada', approved_by = :'C', approved_at = now() where id = :'V';
update public.cma_versions set status = 'vigente' where id = :'V';

-- Agosto e setembro conferidos, com posições em reais; IPCA de setembro.
insert into public.assets (asset_code, name, class_code, currency) values ('T-RA-POS', 'Pós teste', 'POS', 'BRL'), ('T-RA-ACO', 'Ações teste', 'ACOES', 'BRL');
insert into public.import_batches (id, ref_date, kind, file_name, row_count, status) values ('ca000000-0000-4000-8000-000000000001', '2026-09-30', 'posicoes', 't.csv', 2, 'confirmada');
insert into public.positions (household_id, batch_id, ref_date, custodian, asset_id, quantity, unit_price, gross_value, net_value, currency, fx_rate, net_value_brl)
select :'H', 'ca000000-0000-4000-8000-000000000001', '2026-09-30', 'C1', a.id, 1, v, v, v, 'BRL', 1, v
  from public.assets a join (values ('T-RA-POS', 700000), ('T-RA-ACO', 300000)) x(code, v) on x.code = a.asset_code;
insert into public.household_months (household_id, ref_date, official_pl, status) values (:'H', '2026-08-31', 990000, 'importado'), (:'H', '2026-09-30', 1000000, 'importado');
update public.household_months set status = 'conferido' where household_id = :'H';
insert into public.market_series (series_code, date, value, source) values ('ipca', '2026-09-01', 0.48, 'teste')
on conflict (series_code, date) do update set value = excluded.value;

-- Quem pede ------------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G', 'aal1');
select throws_ok($$ select public.run_permission() $$, '42501', null, 'gestão sem segundo fator não roda');
select pg_temp.entrar(:'C');
select throws_ok($$ select public.run_permission() $$, '42501', null, 'comitê não roda');
select pg_temp.entrar(:'G');
select is(public.run_permission(), :'G'::uuid, 'a gestão, com segundo fator, pode pedir a rodada');
select throws_ok(format($$ select public.run_inputs(%L, '2026-09-30', %L) $$, :'H', :'G'), '42501', null, 'o navegador não lê as entradas da rodada');
select throws_ok(format($$ select public.record_official_run(%L, '2026-09-30', %L, '{}', '{}', '{}') $$, :'H', :'G'), '42501', null,
  'nem grava a rodada');
select throws_ok(format($$ select public.record_run_part(%L, '2026-09-30', 'principal', 'h', '{}', 1, %L) $$, :'H', :'G'), '42501', null,
  'nem grava partes');
reset role;

-- Entradas (só a função do servidor) ------------------------------------------------------------------------------

set local role service_role;
select throws_ok(format($$ select public.run_inputs(%L, '2026-09-30', %L) $$, :'H', :'C'), '42501', null, 'só em nome de alguém da gestão');
select throws_ok(format($$ select public.run_inputs(%L, '2026-09-30', %L) $$, :'H', :'G'), 'P0001',
  'O mês anterior (08/2026) ainda não foi fechado: feche-o antes de rodar este mês.', 'mês anterior aberto impede a rodada');
reset role;
delete from public.household_months where household_id = :'H' and ref_date = '2026-08-31';
set local role service_role;
select public.run_inputs(:'H', '2026-09-30', :'G') as entradas \gset
select is(:'entradas'::jsonb #> '{inputs,pkg,closing,positionsByClass}', '{"POS": 700000.00, "ACOES": 300000.00}'::jsonb, 'patrimônio por classe em reais');
select is(:'entradas'::jsonb #>> '{inputs,pkg,closing,officialPl}', '1000000.00', 'PL oficial do mês');
select is(:'entradas'::jsonb #> '{inputs,pkg,cma,correlation}', '[[1, 0.100000], [0.100000, 1]]'::jsonb, 'matriz de correlação completa, em ordem de código');
select is(:'entradas'::jsonb #> '{inputs,previous}', 'null'::jsonb, 'sem mês anterior: primeiro mês acompanhado');
select is((:'entradas'::jsonb #>> '{inputs,ipca,2026-09}')::numeric, 0.0048, 'IPCA oficial do mês, em fração');
reset role;
select ok(exists (select 1 from public.audit_log where action = 'ler_entradas_da_rodada' and actor_id = :'G' and household_id = :'H'),
  'a leitura das entradas vai para a auditoria em nome de quem pediu');
delete from public.market_series where series_code = 'ipca' and date = '2026-09-01';
set local role service_role;
select throws_ok(format($$ select public.run_inputs(%L, '2026-09-30', %L) $$, :'H', :'G'), 'P0001', null, 'sem o IPCA oficial do mês, não roda');
reset role;
insert into public.market_series (series_code, date, value, source) values ('ipca', '2026-09-01', 0.48, 'teste');

-- Gravação ----------------------------------------------------------------------------------------------------------

set local role service_role;
select lives_ok(format($$ select public.record_run_part(%L, '2026-09-30', 'principal', 'hash', '{"x": 1}', 812.34, %L) $$, :'H', :'G'),
  'a função guarda uma parte');
select is((public.run_parts(:'H', '2026-09-30') -> 'principal' ->> 'computeMs'), '812.3', 'com o tempo de cálculo');
select public.record_official_run(:'H', '2026-09-30', :'G', '{"pkg": {}}',
  jsonb_build_object('refDate', '2026-09-30', 'inputsHash', 'abc', 'seed', 7, 'engineVersion', '0.5.0', 'paths', 10000,
                     'probability', 0.8123, 'requiredReturn', 0.031, 'slack', 0.004, 'wealth', 1000000),
  jsonb_build_object('cma_version_id', :'V', 'plan_version_id', (select id from public.plan_versions where household_id = :'H'),
                     'realized_return_real', null, 'attribution', '{"kind": "primeiro_mes"}'::jsonb)) as gravada \gset
reset role;
select is((select status::text from public.household_months where household_id = :'H' and ref_date = '2026-09-30'), 'rodado', 'a família fica rodada');
select is((select probability from public.monthly_snapshots where household_id = :'H' and ref_date = '2026-09-30'), 0.812300::numeric(10, 6),
  'o retrato do mês tem a chance');
select is((select count(*)::integer from app.run_parts where household_id = :'H'), 0, 'as partes saem depois da gravação');
select ok(exists (select 1 from public.audit_log where action = 'rodar_mes' and actor_id = :'G' and household_id = :'H'), 'a rodada vai para a auditoria');
select throws_ok(format($$ update public.simulation_runs set paths = 1 where id = %L $$, :'gravada'::jsonb ->> 'run_id'), 'P0001', null,
  'registro de rodada não muda');

-- Leitura -----------------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G');
select is((select f -> 'latest' ->> 'probability' from jsonb_array_elements(public.families_overview()) f where f ->> 'code' = 'T-RA'), '0.812300',
  'famílias: a gestão vê a chance');
select is((select f ->> 'probability' from jsonb_array_elements(public.month_overview('2026-09-30') -> 'families') f where f ->> 'code' = 'T-RA'),
  '0.812300', 'mês: a chance de cada família rodada');
select pg_temp.entrar(:'P');
select ok(not ((select f -> 'latest' from jsonb_array_elements(public.families_overview()) f where f ->> 'code' = 'T-RA') ? 'wealth'),
  'sem permissão para valores, o patrimônio some');
select pg_temp.entrar(:'K');
select throws_ok($$ select public.families_overview() $$, '42501', null, 'o cliente AI não vê a lista de famílias');
reset role;

-- Retrato travado no fechamento; fora do fechamento, sai quando o mês volta para importado.
update public.household_months set status = 'fechado' where household_id = :'H' and ref_date = '2026-09-30';
select throws_ok(format($$ update public.monthly_snapshots set probability = 0.5 where household_id = %L $$, :'H'), 'P0001', null,
  'retrato de mês fechado não muda');

-- Outubro: a ponte parte da rodada publicada de setembro; se outubro volta para importado, o retrato sai.
insert into public.household_months (household_id, ref_date, official_pl, status) values (:'H', '2026-10-31', 1010000, 'importado');
update public.household_months set status = 'conferido' where household_id = :'H' and ref_date = '2026-10-31';
insert into public.market_series (series_code, date, value, source) values ('ipca', '2026-10-01', 0.40, 'teste')
on conflict (series_code, date) do update set value = excluded.value;
set local role service_role;
select is(public.run_inputs(:'H', '2026-10-31', :'G') #> '{inputs,previous,published,probability}', '0.8123'::jsonb,
  'outubro parte da rodada publicada de setembro');
reset role;
update public.household_months set status = 'rodado' where household_id = :'H' and ref_date = '2026-10-31';
insert into public.monthly_snapshots (household_id, ref_date, probability, wealth, cma_version_id, plan_version_id, run_id)
select household_id, '2026-10-31', 0.8, 1, cma_version_id, plan_version_id, run_id from public.monthly_snapshots where household_id = :'H' and ref_date = '2026-09-30';
select is((select count(*)::integer from public.monthly_snapshots where household_id = :'H' and ref_date = '2026-10-31'), 1, 'outubro rodado tem retrato');
update public.household_months set status = 'importado' where household_id = :'H' and ref_date = '2026-10-31';
select is((select count(*)::integer from public.monthly_snapshots where household_id = :'H' and ref_date = '2026-10-31'), 0,
  'mês que volta para importado perde o retrato (o registro da rodada fica)');

select * from finish();
rollback;
