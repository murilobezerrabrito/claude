-- Séries do Banco Central (SPEC, "Dados de mercado"): quem pede a busca (agendamento, gestão ou comitê com segundo
-- fator); só a função do servidor grava, de forma idempotente, conferindo as linhas; cada busca fica registrada; a
-- situação das séries é para a equipe interna.
begin;
select plan(30);

\set G 'ae000000-0000-4000-8000-000000000001'
\set C 'ae000000-0000-4000-8000-000000000002'
\set P 'ae000000-0000-4000-8000-000000000003'
\set B 'ae000000-0000-4000-8000-000000000004'

create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, true);
  select set_config('request.jwt.claim.role', 'authenticated', true);
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;
create function pg_temp.servidor() returns text language sql as $$
  select set_config('request.jwt.claim.sub', '', true);
  select set_config('request.jwt.claim.role', 'service_role', true);
  select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true)
$$;

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'G', :'C', :'P', :'B']) u;
insert into public.user_roles (user_id, household_id, role) values (:'G', null, 'gestao'), (:'C', null, 'comite'), (:'P', null, 'compliance'), (:'B', null, 'banker');
-- Sem séries de antes: o teste começa do zero (o rollback devolve as do seed).
delete from public.market_series where series_code in ('cdi', 'ipca', 'dolar');

-- Quem pede a busca ---------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G');
select is(public.market_sync_permission(), jsonb_build_object('actor', :'G', 'via', 'console'), 'a gestão, com segundo fator, pede a busca');
select pg_temp.entrar(:'C');
select is(public.market_sync_permission() ->> 'via', 'console', 'o comitê também');
select pg_temp.entrar(:'P');
select throws_ok($$ select public.market_sync_permission() $$, '42501', null, 'a compliance não pede a busca');
select pg_temp.entrar(:'G', 'aal1');
select throws_ok($$ select public.market_sync_permission() $$, '42501', null, 'sem segundo fator, nem a gestão');
select pg_temp.entrar(:'G');
select throws_ok($$ select public.record_market_sync('cdi', '2026-10-01', '2026-10-30', '[]', null, null) $$, '42501', null,
  'o navegador não grava séries');
select throws_ok($$ select public.market_last_dates() $$, '42501', null, 'nem lê de onde a busca começa');
reset role;

set local role service_role;
select pg_temp.servidor();
select is(public.market_sync_permission(), '{"actor": null, "via": "agendamento"}'::jsonb, 'com a chave do servidor, é o agendamento');
select is(public.market_last_dates(), '{"cdi": null, "ipca": null, "dolar": null}'::jsonb, 'sem nenhum dado, a busca começa da data inicial');

-- Gravação ---------------------------------------------------------------------------------------------------------

select is(public.record_market_sync('dolar', '2026-10-01', '2026-10-30',
  '[{"date": "2026-10-28", "value": 5.03}, {"date": "2026-10-29", "value": 5.035}, {"date": "2026-10-30", "value": 5.04}]', null, :'G'),
  '{"inserted": 3, "updated": 0, "last_date": "2026-10-30"}'::jsonb, 'grava as linhas novas');
select is(public.record_market_sync('dolar', '2026-10-28', '2026-10-30',
  '[{"date": "2026-10-28", "value": 5.03}, {"date": "2026-10-29", "value": 5.035}, {"date": "2026-10-30", "value": 5.04}]', null, null),
  '{"inserted": 0, "updated": 0, "last_date": "2026-10-30"}'::jsonb, 'a mesma busca de novo não duplica nem muda nada');
select is(public.record_market_sync('dolar', '2026-10-28', '2026-10-30', '[{"date": "2026-10-30", "value": 5.05}]', null, null) ->> 'updated', '1',
  'valor diferente do gravado atualiza e fica contado');
select is((select value from public.market_series where series_code = 'dolar' and date = '2026-10-30'), 5.05::numeric, 'com o valor novo');
select is((select source from public.market_series where series_code = 'dolar' and date = '2026-10-30'), 'bcb_sgs', 'e a origem do Banco Central');
select is(public.record_market_sync('ipca', '2024-01-01', '2026-10-30', '[]', 'O SGS respondeu 503 para IPCA: fora do ar', null) ->> 'inserted', '0',
  'busca com erro só registra');
select is(public.market_last_dates() ->> 'dolar', '2026-10-30', 'o último dado de cada série');

select throws_ok($$ select public.record_market_sync('selic', '2026-10-01', '2026-10-30', '[]', null, null) $$, '22023', null, 'série desconhecida');
select throws_ok($$ select public.record_market_sync('cdi', '2026-10-30', '2026-10-01', '[]', null, null) $$, '22023', null, 'janela invertida');
select throws_ok($$ select public.record_market_sync('cdi', '2026-10-01', '2026-10-30', '[{"date": "2026-10-01", "value": 0.05}]', 'erro', null) $$,
  '22023', null, 'busca com erro não grava linhas');
select throws_ok($$ select public.record_market_sync('cdi', '2026-10-01', '2026-10-30', '[{"date": "2026-11-02", "value": 0.05}]', null, null) $$,
  '22023', null, 'data depois do fim da busca');
select throws_ok($$ select public.record_market_sync('ipca', '2026-01-01', '2026-10-30', '[{"date": "2026-09-15", "value": 0.4}]', null, null) $$,
  '22023', null, 'IPCA fora do dia 1');
select throws_ok($$ select public.record_market_sync('cdi', '2026-10-01', '2026-10-30', '[{"date": "2026-10-01", "value": 5.5}]', null, null) $$,
  '22023', null, 'valor fora da faixa (5,5% ao dia não é CDI)');
select throws_ok($$ select public.record_market_sync('cdi', '2026-10-01', '2026-10-30',
  '[{"date": "2026-10-01", "value": 0.05}, {"date": "2026-10-01", "value": 0.05}]', null, null) $$, '22023', null, 'data repetida');
reset role;
select is((select count(*)::integer from public.market_syncs where series_code in ('dolar', 'ipca')), 4, 'cada busca fica registrada');
select is((select requested_by from public.market_syncs where series_code = 'dolar' order by created_at limit 1), :'G'::uuid,
  'com quem pediu (nulo no agendamento)');

-- Situação das séries ----------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'P');
select is((select string_agg(x ->> 'code', ',') from jsonb_array_elements(public.market_status()) x), 'cdi,ipca,dolar',
  'a compliance vê a situação das três séries, em ordem');
select is((select x #>> '{last,date}' from jsonb_array_elements(public.market_status()) x where x ->> 'code' = 'dolar'), '2026-10-30',
  'com o último dado');
select is((select x #>> '{last_sync,error}' from jsonb_array_elements(public.market_status()) x where x ->> 'code' = 'ipca'),
  'O SGS respondeu 503 para IPCA: fora do ar', 'e o erro da última busca');
select is((select x -> 'last' from jsonb_array_elements(public.market_status()) x where x ->> 'code' = 'cdi'), 'null'::jsonb,
  'série sem dado aparece sem o último dado');
select pg_temp.entrar(:'B');
select throws_ok($$ select public.market_status() $$, '42501', null, 'o banker não vê a situação das séries');
select is((select count(*)::integer from public.market_syncs), 0, 'nem o registro das buscas');
reset role;

select * from finish();
rollback;
