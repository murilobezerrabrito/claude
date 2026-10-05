-- Acesso por linha e vazamento entre famílias (SPEC, "Usuários e permissões" e critérios de aceite).
-- Dados de teste próprios, desfeitos no fim (rollback). Cada bloco entra como um papel, com o token simulado.
begin;
select plan(44);

\set G  'a0000000-0000-4000-8000-000000000001'
\set C  'a0000000-0000-4000-8000-000000000002'
\set P  'a0000000-0000-4000-8000-000000000003'
\set B1 'a0000000-0000-4000-8000-000000000004'
\set B2 'a0000000-0000-4000-8000-000000000005'
\set R1 'a0000000-0000-4000-8000-000000000006'
\set R2 'a0000000-0000-4000-8000-000000000007'
\set KA 'a0000000-0000-4000-8000-000000000008'
\set KB 'a0000000-0000-4000-8000-000000000009'
\set HA 'b0000000-0000-4000-8000-00000000000a'
\set HB 'b0000000-0000-4000-8000-00000000000b'
\set HC 'b0000000-0000-4000-8000-00000000000c'
\set HD 'b0000000-0000-4000-8000-00000000000d'
\set FIXTURES 'array[''b0000000-0000-4000-8000-00000000000a'',''b0000000-0000-4000-8000-00000000000b'',''b0000000-0000-4000-8000-00000000000c'',''b0000000-0000-4000-8000-00000000000d'']::uuid[]'

-- Entra como um usuário, com ou sem o segundo fator (aal2 ou aal1).
create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;

-- Dados de teste: A e B do canal AI (responsáveis R1 e R2, clientes KA e KB); C e D da CADM (bankers B1 e B2).
insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'G', :'C', :'P', :'B1', :'B2', :'R1', :'R2', :'KA', :'KB']) u;
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, owner_id, banker_id, profile_id, weights_source, fee_rate, seed) values
  (:'HA', 'T-A', 'Teste A', 'ai', :'R1', null, 'teste', 'carteira_atual', 0.008, 1),
  (:'HB', 'T-B', 'Teste B', 'ai', :'R2', null, 'teste', 'carteira_atual', 0.008, 2),
  (:'HC', 'T-C', 'Teste C', 'cadm', null, :'B1', 'teste', 'perfil', 0.008, 3),
  (:'HD', 'T-D', 'Teste D', 'cadm', null, :'B2', 'teste', 'perfil', 0.008, 4);
insert into public.user_roles (user_id, household_id, role) values
  (:'G', null, 'gestao'), (:'C', null, 'comite'), (:'P', null, 'compliance'), (:'B1', null, 'banker'), (:'B2', null, 'banker'),
  (:'R1', null, 'responsavel'), (:'R2', null, 'responsavel'), (:'KA', :'HA', 'cliente_ai'), (:'KB', :'HB', 'cliente_ai');
insert into public.people (household_id, name, birth_date, sex, role)
select h, 'Pessoa de teste', '1970-01-01', 'F', 'titular' from unnest(:FIXTURES) h;
insert into public.assets (id, asset_code, name, class_code) values ('c0000000-0000-4000-8000-000000000001', 'TESTE-ATIVO', 'Ativo de teste', 'POS');
insert into public.import_batches (id, ref_date, kind, file_name, row_count) values ('c0000000-0000-4000-8000-000000000002', '2026-09-30', 'posicoes', 'teste.csv', 4);
insert into public.positions (household_id, batch_id, ref_date, custodian, asset_id, quantity, unit_price, gross_value, net_value)
select h, 'c0000000-0000-4000-8000-000000000002', '2026-09-30', 'Custodiante', 'c0000000-0000-4000-8000-000000000001', 1, 100, 100, 100
  from unnest(:FIXTURES) h;
insert into public.plan_versions (household_id, version, snapshot, base_month)
select h, 1, '{}'::jsonb, '2026-09-01' from unnest(:FIXTURES) h;
insert into public.reports (household_id, ref_date, prepared_by, snapshot) values (:'HA', '2026-09-30', :'G', '{}'), (:'HC', '2026-09-30', :'G', '{}');

-- Cliente AI da família A, com segundo fator ------------------------------------------------------------------------
select pg_temp.entrar(:'KA');
set local role authenticated;
select is((select array_agg(id) from public.households), array[:'HA']::uuid[], 'cliente A vê só a própria família');
select is((select count(*)::int from public.people where household_id <> :'HA'), 0, 'cliente A não vê pessoas de outra família');
select is((select count(*)::int from public.people where household_id = :'HA'), 1, 'cliente A vê as pessoas da própria família');
select is((select count(*)::int from public.positions where household_id <> :'HA'), 0, 'cliente A não vê posições de outra família');
select is((select count(*)::int from public.positions where household_id = :'HA'), 1, 'cliente A vê as próprias posições');
select is((select count(*)::int from public.plan_versions where household_id <> :'HA'), 0, 'cliente A não vê planos de outra família');
select is((select count(*)::int from public.reports), 0, 'cliente A não lê relatórios, nem os da própria família');
select is((select count(*)::int from public.audit_log), 0, 'cliente A não lê a auditoria');
select is((select count(*)::int from public.households where channel = 'cadm'), 0, 'cliente A não vê famílias CADM');
select is((select count(*)::int from public.user_roles), 1, 'cliente A vê só o próprio papel');
select throws_ok(format($$ insert into public.scenarios (household_id, owner_id, name, params) values (%L, %L, 'x', '{}') $$, :'HB', :'KA'),
  '42501', null, 'cliente A não cria cenário na família B');
select lives_ok(format($$ insert into public.scenarios (household_id, owner_id, name, params) values (%L, %L, 'Aposentar antes', '{}') $$, :'HA', :'KA'),
  'cliente A cria cenário na própria família');
select throws_ok(format('select public.household_detail(%L)', :'HB'), '42501', null, 'cliente A não lê a família B pela API');
select is((select public.household_detail(:'HA') -> 'household' ->> 'id'), :'HA', 'cliente A lê a própria família pela API');
select is((select array_agg(id) from public.list_households() where id = any (:FIXTURES)), array[:'HA']::uuid[], 'a lista do cliente A tem só a família A');

-- Cliente AI sem o segundo fator ------------------------------------------------------------------------------------
reset role;
select pg_temp.entrar(:'KA', 'aal1');
set local role authenticated;
select is((select count(*)::int from public.households), 0, 'sem segundo fator, o cliente não vê nem a própria família');
select throws_ok('select * from public.list_households()', '42501', null, 'sem segundo fator, a API recusa');

-- Gestão: lê tudo, mas só pela API, que registra a leitura ----------------------------------------------------------
reset role;
select pg_temp.entrar(:'G');
set local role authenticated;
select is((select count(*)::int from public.households), 0, 'gestão não lê as tabelas de família direto (opção a)');
select is((select count(*)::int from public.people), 0, 'gestão não lê pessoas direto');
select is((select count(*)::int from public.list_households() where id = any (:FIXTURES)), 4, 'gestão vê as quatro famílias pela API');
select is((select public.household_detail(:'HC') -> 'household' ->> 'code'), 'T-C', 'gestão lê a família C pela API');
select throws_ok($$ insert into public.households (code, name, channel, profile_id, weights_source, fee_rate, seed) values ('X', 'X', 'cadm', 'teste', 'perfil', 0, 1) $$,
  '42501', null, 'gestão não escreve direto nas tabelas de família');
select is((select count(*)::int from public.audit_log), 0, 'gestão não lê a auditoria');
reset role;
select ok(exists (select 1 from public.audit_log where action = 'ler_familia' and household_id = :'HC' and actor_id = :'G'),
  'a leitura da família C pela gestão ficou na auditoria');
select ok(exists (select 1 from public.audit_log where action = 'listar_familias' and actor_id = :'G'), 'a listagem ficou na auditoria');

-- Banker: só as suas famílias CADM ----------------------------------------------------------------------------------
select pg_temp.entrar(:'B1');
set local role authenticated;
select is((select array_agg(id) from public.list_households() where id = any (:FIXTURES)), array[:'HC']::uuid[], 'banker 1 vê só a família C');
select throws_ok(format('select public.household_detail(%L)', :'HD'), '42501', null, 'banker 1 não lê a família D, de outro banker');
select throws_ok(format('select public.household_detail(%L)', :'HA'), '42501', null, 'banker 1 não lê família AI');
select is((select count(*)::int from public.reports), 0, 'banker não lê relatórios direto');

-- Banker sem permissão para valores em reais: a API esconde os valores.
reset role;
update public.user_roles set can_see_amounts = false where user_id = :'B1';
insert into public.other_assets (household_id, kind, name, value) values (:'HC', 'imovel', 'Imóvel de teste', 1000000);
insert into public.plan_versions (household_id, version, snapshot, base_month) values (:'HC', 2, '{}'::jsonb, '2099-01-01');
select pg_temp.entrar(:'B1');
set local role authenticated;
select is((select public.household_detail(:'HC') -> 'other_assets' -> 0 ->> 'name'), 'Imóvel de teste', 'sem valores, o banker ainda vê os bens');
select ok(not (public.household_detail(:'HC')::text ~ '"(value|snapshot)"'), 'sem valores, a resposta não traz valores em reais nem o plano em reais');
select is((select public.household_detail(:'HC') -> 'plan_version' ->> 'version'), '1', 'o plano em vigor é o de mês-base até hoje, e não um futuro');
select is((select public.household_detail(:'HC') -> 'latest_plan_version' ->> 'version'), '2', 'a versão mais recente aparece à parte');
reset role;
update public.user_roles set can_see_amounts = true where user_id = :'B1';

-- Responsável: só as suas famílias AI -------------------------------------------------------------------------------
reset role;
select pg_temp.entrar(:'R1');
set local role authenticated;
select is((select array_agg(id) from public.list_households() where id = any (:FIXTURES)), array[:'HA']::uuid[], 'responsável 1 vê só a família A');
select throws_ok(format('select public.household_detail(%L)', :'HB'), '42501', null, 'responsável 1 não lê a família B');

-- Compliance: lê tudo, só leitura, mais a auditoria -----------------------------------------------------------------
reset role;
select pg_temp.entrar(:'P');
set local role authenticated;
select is((select count(*)::int from public.list_households() where id = any (:FIXTURES)), 4, 'compliance vê as quatro famílias pela API');
select ok((select count(*) from public.audit_log) > 0, 'compliance lê a auditoria');
select throws_ok($$ insert into public.audit_log (action) values ('forjado') $$, '42501', null, 'ninguém escreve na auditoria direto');
select throws_ok(format($$ insert into public.user_roles (user_id, role) values (%L, 'gestao') $$, :'P'), '42501', null, 'compliance não gerencia papéis');

-- Comitê: gerencia papéis e lê a auditoria --------------------------------------------------------------------------
reset role;
select pg_temp.entrar(:'C');
set local role authenticated;
select lives_ok(format($$ insert into public.user_roles (user_id, role) values (%L, 'banker') $$, :'R2'), 'comitê dá papel a um usuário');
select ok((select count(*) from public.audit_log) > 0, 'comitê lê a auditoria');

-- Comitê sem o segundo fator ----------------------------------------------------------------------------------------
reset role;
select pg_temp.entrar(:'C', 'aal1');
set local role authenticated;
select throws_ok(format($$ insert into public.user_roles (user_id, role) values (%L, 'gestao') $$, :'R2'), '42501', null, 'sem segundo fator, o comitê não gerencia papéis');

-- Anônimo -----------------------------------------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok('select count(*) from public.households', '42501', null, 'anônimo não tem acesso às famílias');
select throws_ok('select * from public.list_households()', '42501', null, 'anônimo não chama a API');

reset role;
select * from finish();
rollback;
