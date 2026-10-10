-- Cadastro da família e versões do plano (SPEC, "Console interno": "Cadastro e plano"): só a gestão cadastra; a
-- gestão, ou o responsável nas suas famílias AI, muda o plano, sempre vendo os valores; cada gravação é uma versão,
-- com mês-base depois do último mês fechado e nunca antes da versão mais recente; o banco confere a versão, espelha o
-- plano nas tabelas e volta para "importado" os meses afetados.
begin;
select plan(48);

\set G  'ac000000-0000-4000-8000-000000000001'
\set G2 'ac000000-0000-4000-8000-000000000002'
\set B  'ac000000-0000-4000-8000-000000000003'
\set R  'ac000000-0000-4000-8000-000000000004'
\set R2 'ac000000-0000-4000-8000-000000000005'
\set C  'ac000000-0000-4000-8000-000000000006'
\set K  'ac000000-0000-4000-8000-000000000007'
\set S '{"legacyMin": 500000, "people": [{"id": "ana", "name": "Ana Teste", "birthDate": "1970-05-01", "sex": "F", "role": "titular", "retirementAge": 65}, {"id": "beto", "name": "Beto Teste", "birthDate": "1972-01-15", "sex": "M", "role": "conjuge"}], "otherAssets": [{"id": "vgbl", "kind": "previdencia", "name": "VGBL", "value": 100000, "classCode": "POS", "inSimulation": true}, {"id": "sala", "kind": "imovel", "name": "Sala", "value": 300000, "canBeSold": true, "netSaleValue": 280000, "annualIncome": 24000}], "cashFlows": [{"kind": "gasto_essencial", "name": "Gasto essencial", "annualAmountReal": 120000, "startYear": 2026, "endYear": 2070}, {"kind": "aluguel", "name": "Aluguel da sala", "annualAmountReal": 24000, "startYear": 2026, "endYear": 2070, "otherAssetId": "sala"}], "events": [{"name": "Carro", "direction": "saida", "amountReal": 100000, "year": 2028, "month": 3, "recurrence": "a_cada_n", "everyN": 5, "endYear": 2048}], "goals": [{"kind": "padrao_de_vida", "personId": "beto", "targetAge": 95}, {"kind": "legado", "amount": 500000}], "rules": {"enabled": true, "mode": "trajetoria_referencia", "lower": 0.8, "upper": 1.2, "cut": 0.1, "raise": 0.1, "floor": 0.5, "cap": 1.3, "noCutLastYears": 15}}'

create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;
-- Campos com erro numa resposta {ok: false, errors}.
create function pg_temp.campos(r jsonb) returns text[] language sql as $$
  select array_agg(e ->> 'path' order by e ->> 'path') from jsonb_array_elements(r -> 'errors') e
$$;

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'G', :'G2', :'B', :'R', :'R2', :'C', :'K']) u;
insert into public.user_roles (user_id, household_id, role, can_see_amounts) values
  (:'G', null, 'gestao', true), (:'G2', null, 'gestao', false), (:'B', null, 'banker', true), (:'R', null, 'responsavel', true),
  (:'R2', null, 'responsavel', true), (:'C', null, 'comite', true);

-- As versões do plano do seed (Andrade, Barbosa e Costa) passam na conferência do banco, como passam no esquema do
-- console (src/lib/__tests__/planSchema.test.ts).
select is((select jsonb_agg(e) from public.plan_versions v
             cross join lateral jsonb_array_elements(app.plan_snapshot_errors(v.snapshot,
               (select array_agg(c.class_code) from public.cma_classes c join public.cma_versions cv on cv.id = c.cma_version_id where cv.status = 'vigente'))) e),
  null, 'as versões do plano do seed passam na conferência do banco');

-- Opções dos formulários -----------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G');
select ok(public.plan_options() -> 'bankers' @> jsonb_build_array(jsonb_build_object('id', :'B', 'email', :'B' || '@teste.invalid')),
  'a gestão vê os bankers para escolher');
select ok(jsonb_array_length(public.plan_options() -> 'classes') > 0 and jsonb_array_length(public.plan_options() -> 'profiles') > 0,
  'perfis e classes das premissas vigentes');
select pg_temp.entrar(:'B');
select is(public.plan_options() -> 'bankers', '[]'::jsonb, 'o banker não vê a lista de bankers');

-- Cadastro ---------------------------------------------------------------------------------------------------------

select pg_temp.entrar(:'C');
select throws_ok($$ select public.save_household(null, '{"code": "T-X1", "name": "X", "channel": "cadm", "profile_id": "moderado", "fee_rate": 0.008, "horizon_age": 95}') $$,
  '42501', null, 'o comitê não cadastra famílias');
select pg_temp.entrar(:'G', 'aal1');
select throws_ok($$ select public.save_household(null, '{"code": "T-X1", "name": "X", "channel": "cadm", "profile_id": "moderado", "fee_rate": 0.008, "horizon_age": 95}') $$,
  '42501', null, 'sem segundo fator, nem a gestão');
select pg_temp.entrar(:'G');
select public.save_household(null, jsonb_build_object('code', 't-cad1', 'name', 'Família Cadastro (teste)', 'channel', 'cadm', 'banker_id', :'B',
  'profile_id', 'moderado', 'suitability', 'moderado', 'fee_rate', 0.008, 'horizon_age', 95)) as cadm \gset
select is(:'cadm'::jsonb ->> 'code', 'T-CAD1', 'a gestão cadastra uma família CADM (código em maiúsculas)');
select public.save_household(null, jsonb_build_object('code', 'T-AI1', 'name', 'Família AI (teste)', 'channel', 'ai', 'owner_id', :'R',
  'profile_id', 'moderado', 'fee_rate', 0.008, 'horizon_age', 95, 'seed', 12345)) as ai \gset
reset role;
select (:'cadm'::jsonb ->> 'household_id') as h1, (:'ai'::jsonb ->> 'household_id') as h2 \gset
select is((select weights_source::text || '/' || channel::text from public.households where id = :'h1'), 'perfil/cadm', 'CADM: pesos do perfil');
select is((select weights_source::text || '/' || seed::text from public.households where id = :'h2'), 'carteira_atual/12345', 'AI: carteira atual e a semente dada');
select ok((select seed between 0 and 4294967295 from public.households where id = :'h1'), 'sem semente dada, uma semente sorteada');
insert into public.user_roles (user_id, household_id, role) values (:'K', :'h2', 'cliente_ai');

set local role authenticated;
select pg_temp.entrar(:'G');
select is(pg_temp.campos(public.save_household(null, jsonb_build_object('code', 'T-CAD1', 'name', '', 'channel', 'ai', 'banker_id', :'B',
  'owner_id', :'B', 'profile_id', 'xyz', 'fee_rate', 0.15, 'horizon_age', 50))),
  array['banker_id', 'code', 'fee_rate', 'horizon_age', 'name', 'owner_id', 'profile_id'], 'erros de preenchimento voltam por campo');
select is(pg_temp.campos(public.save_household(null, '{"code": "T X", "name": "X", "channel": "outro", "profile_id": "moderado", "fee_rate": 0.008, "horizon_age": 95}')),
  array['channel', 'code'], 'código com espaço e canal desconhecido');
select is(pg_temp.campos(public.save_household(:'h1', jsonb_build_object('code', 'T-CAD1', 'name', 'Família Cadastro (teste)', 'channel', 'ai',
  'profile_id', 'moderado', 'fee_rate', 0.008, 'horizon_age', 95))), array['channel'], 'o canal não muda depois do cadastro');
select is(public.save_household(:'h1', jsonb_build_object('code', 'T-CAD1', 'name', 'Família Cadastro (teste)', 'banker_id', :'B',
  'intermediary', 'Escritório Teste', 'profile_id', 'conservador', 'fee_rate', 0.01, 'horizon_age', 100)) ->> 'ok', 'true',
  'a gestão atualiza o cadastro');
reset role;
select is((select profile_id || '/' || fee_rate::text || '/' || horizon_age || '/' || intermediary from public.households where id = :'h1'),
  'conservador/0.010000/100/Escritório Teste', 'cadastro atualizado');
insert into public.simulation_runs (household_id, inputs_hash, inputs, cma_version_id, seed, engine_version, paths, summary)
select :'h2', 'h', '{}', id, 12345, 'x', 10000, '{}' from public.cma_versions where status = 'vigente';
set local role authenticated;
select pg_temp.entrar(:'G');
select is(pg_temp.campos(public.save_household(:'h2', jsonb_build_object('code', 'T-AI1', 'name', 'Família AI (teste)', 'owner_id', :'R',
  'profile_id', 'moderado', 'fee_rate', 0.008, 'horizon_age', 95, 'seed', 999))), array['seed'], 'a semente não muda depois da primeira rodada');
select is(public.save_household(:'h2', jsonb_build_object('code', 'T-AI1', 'name', 'Família AI (teste)', 'owner_id', :'R',
  'profile_id', 'moderado', 'fee_rate', 0.008, 'horizon_age', 95)) ->> 'ok', 'true', 'sem a semente no pedido, a semente fica');

-- Leitura para o editor ------------------------------------------------------------------------------------------

select is((select public.household_editor(:'h1') ->> 'can_edit_plan'), 'true', 'a gestão muda o plano');
select is((select public.household_editor(:'h1') -> 'versions'), '[]'::jsonb, 'família nova sem versões do plano');
select pg_temp.entrar(:'B');
select is((select (e ->> 'can_edit_plan') || '/' || (e ->> 'can_edit_registration') from public.household_editor(:'h1') e), 'false/false',
  'o banker da família só lê');
select pg_temp.entrar(:'R');
select is((select public.household_editor(:'h2') ->> 'can_edit_plan'), 'true', 'o responsável muda o plano da sua família AI');
select throws_ok(format('select public.household_editor(%L)', :'h1'), '42501', null, 'o responsável não lê família CADM');
select pg_temp.entrar(:'K');
select throws_ok(format('select public.household_editor(%L)', :'h2'), '42501', null, 'o cliente AI não usa o editor do console');

-- Versões do plano -----------------------------------------------------------------------------------------------

select pg_temp.entrar(:'B');
select throws_ok(format($$ select public.save_plan_version(%L, '2026-07-01', %L, 'x') $$, :'h1', :'S'), '42501', null, 'o banker não muda o plano');
select pg_temp.entrar(:'R2');
select throws_ok(format($$ select public.save_plan_version(%L, '2026-07-01', %L, 'x') $$, :'h2', :'S'), '42501', null,
  'o responsável não muda o plano de família de outro responsável');
select pg_temp.entrar(:'G2');
select throws_ok(format($$ select public.save_plan_version(%L, '2026-07-01', %L, 'x') $$, :'h1', :'S'), '42501', null,
  'quem não vê valores em reais não muda o plano');
select pg_temp.entrar(:'G');
select throws_ok(format($$ select public.save_plan_version(%L, %L, %L, 'x') $$, :'h1', (date_trunc('month', current_date) + interval '1 month')::date, :'S'),
  'P0001', 'O mês-base não pode estar no futuro: os valores do plano são em reais do mês-base.', 'mês-base no futuro');
select throws_ok(format($$ select public.save_plan_version(%L, '2026-07-15', %L, 'x') $$, :'h1', :'S'), '22023', null, 'mês-base no primeiro dia do mês');
select is(pg_temp.campos(public.save_plan_version(:'h1', '2026-07-01',
  jsonb_set(jsonb_set(jsonb_set(:'S'::jsonb, '{people,0,role}', '"filho"'), '{events,0,month}', '13'), '{otherAssets,0,classCode}', '"XYZ"') || '{"cpf": "1"}', '')),
  array['', 'events.0.month', 'note', 'otherAssets.0.classCode', 'people'], 'versão inválida: os problemas voltam por campo, e nada é gravado');
select is(pg_temp.campos(public.save_plan_version(:'h1', '2026-07-01', jsonb_set(:'S'::jsonb, '{goals,0,personId}', '"ninguem"'), 'x')),
  array['goals.0.personId'], 'meta com pessoa que não está no plano');
select is(public.save_plan_version(:'h1', '2026-07-01', :'S', 'Plano inicial.') ->> 'version', '1', 'a gestão grava a primeira versão');
reset role;
select is((select count(*)::integer from public.people where household_id = :'h1'), 2, 'as pessoas vão para as tabelas da família');
select is((select p.name from public.goals g join public.people p on p.id = g.person_id where g.household_id = :'h1'), 'Beto Teste',
  'a meta aponta para a pessoa certa');
select is((select a.name from public.cash_flows c join public.other_assets a on a.id = c.other_asset_id where c.household_id = :'h1'), 'Sala',
  'o aluguel aponta para o bem certo');
select ok(exists (select 1 from public.audit_log where action = 'salvar_plano' and actor_id = :'G' and household_id = :'h1'), 'a gravação vai para a auditoria');

set local role authenticated;
select pg_temp.entrar(:'G');
select is(public.save_plan_version(:'h1', '2026-07-01', jsonb_set(:'S'::jsonb, '{people,0,name}', '"Ana Corrigida"'), 'Nome corrigido.') ->> 'version', '2',
  'no mesmo mês-base, a versão nova substitui a anterior');
reset role;
select is((select count(*)::integer || '/' || max(version) from public.plan_versions where household_id = :'h1'), '1/2', 'uma versão por mês-base, com o número novo');
select is((select name from public.people where household_id = :'h1' and role = 'titular'), 'Ana Corrigida', 'as tabelas seguem a versão nova');

-- Meses: agosto fechado e setembro rodado. O mês-base não volta para antes do fechamento; a partir de setembro, o mês
-- rodado volta para importado e perde o retrato.
insert into public.household_months (household_id, ref_date, official_pl, status) values (:'h1', '2026-08-31', 1000000, 'importado'), (:'h1', '2026-09-30', 1000000, 'importado');
update public.household_months set status = 'conferido' where household_id = :'h1';
update public.household_months set status = 'rodado' where household_id = :'h1';
insert into public.simulation_runs (id, household_id, inputs_hash, inputs, cma_version_id, seed, engine_version, paths, summary)
select 'dc000000-0000-4000-8000-000000000001', :'h1', 'h', '{}', id, 1, 'x', 10000, '{}' from public.cma_versions where status = 'vigente';
insert into public.monthly_snapshots (household_id, ref_date, probability, wealth, cma_version_id, plan_version_id, run_id)
select :'h1', m, 0.9, 1000000, (select id from public.cma_versions where status = 'vigente'), (select id from public.plan_versions where household_id = :'h1'),
       'dc000000-0000-4000-8000-000000000001'
  from unnest(array['2026-08-31', '2026-09-30']::date[]) m;
update public.household_months set status = 'fechado' where household_id = :'h1' and ref_date = '2026-08-31';
set local role authenticated;
select pg_temp.entrar(:'G');
select throws_ok(format($$ select public.save_plan_version(%L, '2026-08-01', %L, 'x') $$, :'h1', :'S'), 'P0001',
  'O mês de 08/2026 já está fechado para esta família: o mês-base precisa ser depois dele.', 'mês-base até o último mês fechado é recusado');
select is(public.save_plan_version(:'h1', '2026-09-01', :'S', 'Mudança de setembro.') ->> 'months_reset', '1', 'setembro volta para importado');
reset role;
select is((select string_agg(status::text, '/' order by ref_date) from public.household_months where household_id = :'h1'), 'fechado/importado',
  'agosto continua fechado; setembro volta para importado');
select is((select string_agg(ref_date::text, '/') from public.monthly_snapshots where household_id = :'h1'), '2026-08-31',
  'o retrato de setembro sai; o de agosto, fechado, fica');

-- Família AI: o responsável grava; a versão nova não fica antes da mais recente.
set local role authenticated;
select pg_temp.entrar(:'R');
select is(public.save_plan_version(:'h2', '2026-09-01', :'S', 'Plano inicial.') ->> 'ok', 'true', 'o responsável grava o plano da sua família AI');
select throws_ok(format($$ select public.save_plan_version(%L, '2026-08-01', %L, 'x') $$, :'h2', :'S'), 'P0001',
  'A versão 1 tem mês-base 09/2026: a nova versão precisa ter mês-base igual ou depois dele.', 'nem antes da versão mais recente');

-- Leitura sem valores: o plano não aparece.
select pg_temp.entrar(:'G2');
select ok(not (public.household_editor(:'h1') -> 'latest' ? 'snapshot'), 'sem permissão para valores, o editor não recebe o plano');
select is(public.household_editor(:'h1') ->> 'can_edit_plan', 'false', 'nem pode mudá-lo');
select pg_temp.entrar(:'G');
select is(jsonb_array_length(public.household_editor(:'h1') -> 'versions'), 2, 'o editor lista as versões (julho e setembro)');
select is(public.household_editor(:'h1') ->> 'last_closed_month', '2026-08-31', 'e o último mês fechado');
reset role;

select * from finish();
rollback;
