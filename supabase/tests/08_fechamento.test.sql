-- Fechamento do mês e situação do mês (SPEC, "Dados mensais por canal"): o canal fecha as famílias rodadas, as outras
-- ficam de fora com aviso e podem fechar depois; fechado não reabre; a situação do mês respeita quem vê o quê.
begin;
select plan(24);

\set G1 'a8000000-0000-4000-8000-000000000001'
\set P  'a8000000-0000-4000-8000-000000000002'
\set P2 'a8000000-0000-4000-8000-000000000003'
\set B1 'a8000000-0000-4000-8000-000000000004'
\set B2 'a8000000-0000-4000-8000-000000000005'
\set R  'a8000000-0000-4000-8000-000000000006'
\set K  'a8000000-0000-4000-8000-000000000007'
\set HA 'b8000000-0000-4000-8000-00000000000a'
\set HB 'b8000000-0000-4000-8000-00000000000b'
\set HC 'b8000000-0000-4000-8000-00000000000c'
\set HD 'b8000000-0000-4000-8000-00000000000d'

create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;
-- Famílias de teste na situação do mês (o seed tem outras famílias).
create function pg_temp.familias(p jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_agg(f order by f ->> 'code'), '[]'::jsonb) from jsonb_array_elements(p -> 'families') f where f ->> 'code' like 'T-F%'
$$;

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'G1', :'P', :'P2', :'B1', :'B2', :'R', :'K']) u;
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, owner_id, banker_id, profile_id, weights_source, fee_rate, seed) values
  (:'HA', 'T-FA', 'Teste fechamento A', 'cadm', null, :'B1', 'teste', 'perfil', 0.008, 1),
  (:'HB', 'T-FB', 'Teste fechamento B', 'ai', :'R', null, 'teste', 'carteira_atual', 0.008, 2),
  (:'HC', 'T-FC', 'Teste fechamento C', 'cadm', null, :'B2', 'teste', 'perfil', 0.008, 3),
  (:'HD', 'T-FD', 'Teste fechamento D', 'cadm', null, null, 'teste', 'perfil', 0.008, 4);
insert into public.user_roles (user_id, household_id, role, can_see_amounts) values
  (:'G1', null, 'gestao', true), (:'P', null, 'compliance', false), (:'P2', null, 'compliance', true),
  (:'B1', null, 'banker', true), (:'B2', null, 'banker', true), (:'R', null, 'responsavel', true), (:'K', :'HB', 'cliente_ai', true);

-- Situação de partida: A conferida, B (AI) e C importadas, D sem nada; o mês aberto nos dois canais.
insert into public.household_months (household_id, ref_date, official_pl, status) values
  (:'HA', '2030-01-31', 1000000, 'importado'), (:'HB', '2030-01-31', 500000, 'importado'), (:'HC', '2030-01-31', 2000000, 'importado');
update public.household_months set status = 'conferido', checks = '{"items": [], "official_pl": 1000000, "positions_total": 1000000}'
 where household_id = :'HA' and ref_date = '2030-01-31';
insert into public.month_closings (ref_date, channel, status, opened_by) values ('2030-01-31', 'cadm', 'aberto', :'G1'), ('2030-01-31', 'ai', 'aberto', :'G1');

-- Fechamento do canal -------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'P2');
select throws_ok($$ select public.close_month('2030-01-31', 'cadm') $$, '42501', null, 'a compliance não fecha o mês');
select pg_temp.entrar(:'G1');
select throws_ok($$ select public.close_month('2029-12-31', 'cadm') $$, 'P0002', null, 'mês sem importação não fecha');
select throws_ok($$ select public.close_month('2030-01-31', 'cadm') $$, 'P0001', 'Nenhuma família rodada para fechar no canal.',
  'sem família rodada não há o que fechar');
reset role;
update public.household_months set status = 'rodado' where household_id = :'HA' and ref_date = '2030-01-31';
set local role authenticated;
select pg_temp.entrar(:'G1');
select public.close_month('2030-01-31', 'cadm') as fechamento \gset
select is(:'fechamento'::jsonb -> 'closed', '["T-FA"]'::jsonb, 'fecha as famílias rodadas');
select is((select jsonb_agg(f order by f ->> 'code') from jsonb_array_elements(:'fechamento'::jsonb -> 'left_out') f where f ->> 'code' like 'T-F%'),
  '[{"code": "T-FC", "status": "importado"}, {"code": "T-FD", "status": "pendente"}]'::jsonb, 'e lista as que ficaram de fora');
select throws_ok($$ select public.close_month('2030-01-31', 'cadm') $$, 'P0001', 'O mês já está fechado para o canal.', 'não fecha duas vezes');
reset role;
select is((select status::text || '/' || closed_by::text from public.month_closings where ref_date = '2030-01-31' and channel = 'cadm'),
  'fechado/' || :'G1', 'o canal fica fechado, com quem fechou');
select is((select status::text from public.household_months where household_id = :'HA' and ref_date = '2030-01-31'), 'fechado', 'a família rodada fica fechada');
select is((select status::text from public.month_closings where ref_date = '2030-01-31' and channel = 'ai'), 'aberto', 'o outro canal continua aberto');
select throws_ok($$ update public.month_closings set status = 'aberto', closed_by = null, closed_at = null where ref_date = '2030-01-31' and channel = 'cadm' $$,
  'P0001', null, 'mês fechado não reabre');
select throws_ok($$ delete from public.month_closings where ref_date = '2030-01-31' and channel = 'cadm' $$, 'P0001', null, 'nem é apagado');
select throws_ok(format($$ delete from public.household_months where household_id = %L and ref_date = '2030-01-31' $$, :'HA'),
  'P0001', null, 'mês fechado da família não é apagado');
select throws_ok(format($$ update public.household_months set note = 'x' where household_id = %L and ref_date = '2030-01-31' $$, :'HA'),
  'P0001', null, 'nem muda');

-- Família atrasada -------------------------------------------------------------------------------------------------

update public.household_months set status = 'conferido' where household_id = :'HC' and ref_date = '2030-01-31';
update public.household_months set status = 'rodado' where household_id = :'HC' and ref_date = '2030-01-31';
set local role authenticated;
select pg_temp.entrar(:'G1');
select is(public.close_household_month(:'HC', '2030-01-31') ->> 'status', 'fechado', 'família atrasada fecha depois do canal');
select throws_ok(format($$ select public.close_household_month(%L, '2030-01-31') $$, :'HB'), 'P0001',
  'Só família rodada no mês pode ser fechada.', 'família não rodada não fecha');

-- Situação do mês ----------------------------------------------------------------------------------------------

select is((select jsonb_agg(f ->> 'code' || ':' || (f ->> 'status')) from jsonb_array_elements(pg_temp.familias(public.month_overview('2030-01-31'))) f),
  '["T-FA:fechado", "T-FB:importado", "T-FC:fechado", "T-FD:pendente"]'::jsonb, 'a gestão vê todas, inclusive as que não chegaram');
select is(jsonb_array_length(public.month_overview('2030-01-31', 'cadm') -> 'closings'), 1, 'o filtro de canal vale também para o fechamento');
select pg_temp.entrar(:'B1');
select is((select jsonb_agg(f ->> 'code') from jsonb_array_elements(pg_temp.familias(public.month_overview('2030-01-31'))) f), '["T-FA"]'::jsonb,
  'o banker vê só as suas famílias');
select is(public.month_overview('2030-01-31') -> 'batches', '[]'::jsonb, 'e não vê os lotes');
select pg_temp.entrar(:'R');
select is((select jsonb_agg(f ->> 'code') from jsonb_array_elements(pg_temp.familias(public.month_overview('2030-01-31', 'ai'))) f), '["T-FB"]'::jsonb,
  'o responsável vê só as suas famílias AI');
select pg_temp.entrar(:'K');
select throws_ok($$ select public.month_overview('2030-01-31') $$, '42501', null, 'o cliente AI não vê a situação do mês');
select pg_temp.entrar(:'P');
select ok(not (pg_temp.familias(public.month_overview('2030-01-31')) -> 0 ? 'official_pl')
          and not (pg_temp.familias(public.month_overview('2030-01-31')) -> 0 -> 'checks' ? 'positions_total'),
  'sem permissão para valores, o PL e os totais somem');
select pg_temp.entrar(:'P2');
select is((pg_temp.familias(public.month_overview('2030-01-31')) -> 0 ->> 'official_pl')::numeric, 1000000.00, 'com permissão, aparecem');
reset role;
select ok((select count(*) from public.audit_log where action = 'ver_mes' and actor_id = :'B1') >= 2
          and (select count(*) from public.audit_log where action = 'fechar_mes' and actor_id = :'G1') = 1,
  'leituras e fechamento ficam na auditoria');

select * from finish();
rollback;
