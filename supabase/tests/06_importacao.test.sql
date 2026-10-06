-- Importação das posições e dos aportes e resgates (SPEC, "Importação mensal das posições" e "Aportes e resgates"):
-- só a gestão, com segundo fator; prévia antes de confirmar; tudo ou nada; reimportação substitui só as famílias do
-- arquivo e fica na auditoria; mês fechado não aceita importação. Dados próprios, desfeitos no fim (rollback).
begin;
select plan(48);

\set G1 'a6000000-0000-4000-8000-000000000001'
\set G2 'a6000000-0000-4000-8000-000000000002'
\set C  'a6000000-0000-4000-8000-000000000003'
\set B1 'a6000000-0000-4000-8000-000000000004'
\set R  'a6000000-0000-4000-8000-000000000005'
\set K  'a6000000-0000-4000-8000-000000000006'
\set HA 'b6000000-0000-4000-8000-00000000000a'
\set HB 'b6000000-0000-4000-8000-00000000000b'
\set HE 'b6000000-0000-4000-8000-00000000000e'

create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;

-- Uma linha de posição, como src/import envia (colunas da planilha mais a linha do arquivo).
create function pg_temp.pos(p_line integer, p_code text, p_asset text, p_net numeric, p_currency text default 'BRL',
                            p_custodian text default 'C1', p_ref text default '2026-10-31') returns jsonb language sql as $$
  select jsonb_build_object('linha', p_line, 'data_referencia', p_ref, 'codigo_cliente', p_code, 'custodiante', p_custodian,
           'codigo_ativo', p_asset, 'isin', null, 'cnpj', null, 'nome_ativo', 'Ativo ' || p_asset, 'quantidade', 1,
           'preco_unitario', p_net, 'valor_bruto', p_net, 'valor_liquido', p_net, 'moeda', p_currency)
$$;

create function pg_temp.mov(p_line integer, p_code text, p_kind text, p_amount numeric, p_date text,
                            p_ref text default '2026-10-31') returns jsonb language sql as $$
  select jsonb_build_object('linha', p_line, 'data_referencia', p_ref, 'codigo_cliente', p_code, 'custodiante', 'C1',
           'data_movimento', p_date, 'tipo', p_kind, 'valor', p_amount, 'moeda', 'BRL', 'descricao', null)
$$;

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'G1', :'G2', :'C', :'B1', :'R', :'K']) u;
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, owner_id, banker_id, profile_id, weights_source, fee_rate, seed, status) values
  (:'HA', 'T-A', 'Teste A', 'cadm', null, :'B1', 'teste', 'perfil', 0.008, 1, 'ativa'),
  (:'HB', 'T-B', 'Teste B', 'ai', :'R', null, 'teste', 'carteira_atual', 0.008, 2, 'ativa'),
  (:'HE', 'T-E', 'Teste encerrada', 'cadm', null, null, 'teste', 'perfil', 0.008, 3, 'encerrada');
insert into public.user_roles (user_id, household_id, role) values
  (:'G1', null, 'gestao'), (:'G2', null, 'gestao'), (:'C', null, 'comite'), (:'B1', null, 'banker'),
  (:'R', null, 'responsavel'), (:'K', :'HB', 'cliente_ai');
-- Dólar de venda fictício: 31/10/2026 é sábado; vale o de sexta, 30/10.
insert into public.market_series (series_code, date, value, source) values ('dolar', '2026-10-30', 5.04, 'teste')
on conflict (series_code, date) do update set value = excluded.value;

-- Quem pode importar --------------------------------------------------------------------------------------------

set local role anon;
select throws_ok($$ select public.import_preview('posicoes', 'x.csv', '[]') $$, '42501', null, 'anônimo não importa');
reset role;

set local role authenticated;
select pg_temp.entrar(:'G1', 'aal1');
select throws_ok($$ select public.import_preview('posicoes', 'x.csv', '[]') $$, '42501', null, 'gestão sem segundo fator não importa');
select pg_temp.entrar(:'C');
select throws_ok($$ select public.import_preview('posicoes', 'x.csv', '[]') $$, '42501', null, 'comitê não importa');
select pg_temp.entrar(:'B1');
select throws_ok($$ select public.import_preview('posicoes', 'x.csv', '[]') $$, '42501', null, 'banker não importa');
select pg_temp.entrar(:'K');
select throws_ok($$ select public.import_preview('posicoes', 'x.csv', '[]') $$, '42501', null, 'cliente AI não importa');

-- Tudo ou nada --------------------------------------------------------------------------------------------------

select pg_temp.entrar(:'G1');
select public.import_preview('posicoes', 'erro.csv', jsonb_build_array(
  pg_temp.pos(2, 'T-A', 'T-ATV-1', 100), pg_temp.pos(3, 'T-X', 'T-ATV-2', 100))) as r_desconhecido \gset
select is(:'r_desconhecido'::jsonb, '{"ok": false, "errors": [{"line": 3, "message": "codigo_cliente: T-X não é uma família cadastrada."}]}'::jsonb,
  'código de cliente desconhecido recusa o arquivo, com a linha');

select public.import_preview('posicoes', 'erros.csv', jsonb_build_array(
  pg_temp.pos(2, 'T-A', 'T-ATV-1', 100),
  pg_temp.pos(3, 'T-A', 'T-ATV-1', 50, 'BRL', 'c1'),
  pg_temp.pos(4, 'T-A', 'T-ATV-3', -1),
  pg_temp.pos(5, 'T-A', 'T-ATV-4', 10, 'BRL', 'C1', '2026-10-30'),
  pg_temp.pos(6, 'T-A', 'T-ATV-5', 10, 'EUR'),
  pg_temp.pos(7, 'T-E', 'T-ATV-6', 10))) as r_erros \gset
select is(jsonb_array_length(:'r_erros'::jsonb -> 'errors'), 5, 'valor negativo, fim do mês, moeda, família encerrada e linha duplicada');
select is((select e ->> 'message' from jsonb_array_elements(:'r_erros'::jsonb -> 'errors') e where e ->> 'line' = '3'),
  'O ativo T-ATV-1 aparece de novo para T-A em C1 (linhas 2, 3).', 'duplicata no mesmo custodiante, sem diferenciar maiúsculas');
select is((select e ->> 'message' from jsonb_array_elements(:'r_erros'::jsonb -> 'errors') e where e ->> 'line' = '7'),
  'codigo_cliente: a família T-E está encerrada.', 'família encerrada não recebe importação');
reset role;
select is((select count(*)::integer from public.import_batches where file_name in ('erro.csv', 'erros.csv')), 0, 'arquivo com erro não grava nada');
select is((select count(*)::integer from public.audit_log where action = 'previa_recusada' and actor_id = :'G1'), 2, 'a recusa fica na auditoria');

-- Prévia e confirmação ------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select public.import_preview('posicoes', 'posicoes-out.csv', jsonb_build_array(
  pg_temp.pos(2, 'T-A', 'T-ATV-1', 600000), pg_temp.pos(3, 't-a', 'T-ATV-USD', 1000, 'USD', 'C2'),
  pg_temp.pos(4, 'T-B', 'T-ATV-1', 250000))) as p1 \gset
select :'p1'::jsonb ->> 'batch_id' as lote1 \gset
select is(:'p1'::jsonb ->> 'ok', 'true', 'prévia válida');
select is(:'p1'::jsonb -> 'families' -> 0 -> 'net_by_currency', '{"BRL": 600000, "USD": 1000}'::jsonb, 'prévia soma por família e moeda');
select is(jsonb_array_length(:'p1'::jsonb -> 'new_assets'), 2, 'prévia lista os ativos novos');
select is((:'p1'::jsonb ->> 'total_value')::numeric, 855040.00, 'total em reais com o dólar do último dia útil (30/10)');
reset role;
select is((select count(*)::integer from public.positions where household_id = :'HA'), 0, 'a prévia não grava posições');
select is((select status::text from public.import_batches where id = :'lote1'), 'previa', 'o lote fica em prévia');

set local role authenticated;
select pg_temp.entrar(:'G2');
select is(public.import_confirm(:'lote1') ->> 'rows', '3', 'outra pessoa da gestão confirma');
select throws_ok(format($$ select public.import_confirm(%L) $$, :'lote1'), 'P0001', 'Esta importação já foi confirmada.', 'confirmar duas vezes é recusado');
reset role;
select is((select count(*)::integer from public.positions where household_id = :'HA' and ref_date = '2026-10-31'), 2, 'posições gravadas');
select is((select count(*)::integer from public.assets where asset_code in ('T-ATV-1', 'T-ATV-USD') and class_code is null), 2,
  'ativos novos entram sem classe, na fila do comitê');
select results_eq($$ select household_id::text, status::text from public.household_months where ref_date = '2026-10-31' and household_id in ('b6000000-0000-4000-8000-00000000000a', 'b6000000-0000-4000-8000-00000000000b') order by 1 $$,
  $$ values ('b6000000-0000-4000-8000-00000000000a', 'importado'), ('b6000000-0000-4000-8000-00000000000b', 'importado') $$,
  'o mês das famílias fica importado');
select is((select count(*)::integer from public.month_closings where ref_date = '2026-10-31' and status = 'aberto'), 2, 'o mês abre nos dois canais');
select is((select confirmed_by from public.import_batches where id = :'lote1'), :'G2'::uuid, 'quem confirmou fica no lote');

-- Reimportação --------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select public.import_preview('posicoes', 'posicoes-out-v2.csv', jsonb_build_array(pg_temp.pos(2, 'T-A', 'T-ATV-1', 610000))) as p2 \gset
select is(:'p2'::jsonb -> 'families' -> 0 ->> 'replaces', '2', 'a prévia mostra quantas linhas serão substituídas');
select lives_ok(format($$ select public.import_confirm(%L) $$, :'p2'::jsonb ->> 'batch_id'), 'reimportação de uma família');
reset role;
select is((select array_agg(net_value)::text from public.positions where household_id = :'HA' and ref_date = '2026-10-31'), '{610000.00}', 'a família reimportada foi substituída');
select is((select count(*)::integer from public.positions where household_id = :'HB' and ref_date = '2026-10-31'), 1, 'a outra família continua igual');
select is((select status::text from public.import_batches where id = :'lote1'), 'confirmada', 'o lote antigo continua com a outra família');
select ok((select count(*) from public.audit_log where action = 'delete' and target_table = 'positions' and household_id = :'HA') = 2,
  'as linhas substituídas ficam na auditoria');

set local role authenticated;
select pg_temp.entrar(:'G1');
select public.import_preview('posicoes', 'posicoes-out-b.csv', jsonb_build_array(pg_temp.pos(2, 'T-B', 'T-ATV-1', 260000))) as p3 \gset
select public.import_confirm((:'p3'::jsonb ->> 'batch_id')::uuid) is not null as ok3 \gset
reset role;
select is((select status::text from public.import_batches where id = :'lote1'), 'substituida', 'lote sem nenhuma linha fica substituído');

-- Prévia desatualizada e descarte -------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select public.import_preview('posicoes', 'velha.csv', jsonb_build_array(pg_temp.pos(2, 'T-A', 'T-ATV-1', 1))) ->> 'batch_id' as velha \gset
select public.import_preview('posicoes', 'nova.csv', jsonb_build_array(pg_temp.pos(2, 'T-A', 'T-ATV-1', 2))) ->> 'batch_id' as nova \gset
select lives_ok(format($$ select public.import_confirm(%L) $$, :'nova'), 'a prévia nova é confirmada');
select throws_ok(format($$ select public.import_confirm(%L) $$, :'velha'), 'P0001', 'Há uma importação mais nova para T-A: refaça a prévia.',
  'prévia mais velha que a última importação é recusada');
select lives_ok(format($$ select public.import_discard(%L) $$, :'velha'), 'a gestão descarta a prévia');
select throws_ok(format($$ select public.import_discard(%L) $$, :'velha'), 'P0002', null, 'prévia descartada some');

-- Leitura direta e mapeamento direto ----------------------------------------------------------------------------

select is((select count(*)::integer from public.import_batches), 0, 'a gestão não lê os lotes direto (só pela API)');
select pg_temp.entrar(:'C');
update public.assets set class_code = 'POS' where asset_code = 'T-ATV-1';
reset role;
select is((select class_code from public.assets where asset_code = 'T-ATV-1'), null, 'o comitê não muda a classe direto (só por map_asset)');

-- Moeda do ativo e movimentos -----------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select is(public.import_preview('posicoes', 'moeda.csv', jsonb_build_array(pg_temp.pos(2, 'T-A', 'T-ATV-USD', 10, 'BRL'))) -> 'errors' -> 0 ->> 'message',
  'O ativo T-ATV-USD está cadastrado em USD e veio em BRL.', 'ativo cadastrado em outra moeda é recusado');
select is(public.import_preview('movimentos', 'mov-erro.csv', jsonb_build_array(pg_temp.mov(2, 'T-A', 'resgate', 10, '2026-09-30'))) -> 'errors' -> 0 ->> 'message',
  'data_movimento: 2026-09-30 fora do mês da data de referência.', 'movimento fora do mês é recusado');
select public.import_preview('movimentos', 'mov.csv', jsonb_build_array(
  pg_temp.mov(2, 'T-A', 'resgate', 300000, '2026-10-15'), pg_temp.mov(3, 'T-A', 'aporte', 5000, null))) as m1 \gset
select is(:'m1'::jsonb -> 'families' -> 0 -> 'withdrawals', '{"BRL": 300000}'::jsonb, 'prévia dos movimentos soma os resgates');
select is(public.import_confirm((:'m1'::jsonb ->> 'batch_id')::uuid) ->> 'rows', '2', 'movimentos confirmados');
reset role;
select is((select count(*)::integer from public.flows where household_id = :'HA' and flow_date is null), 1, 'movimento sem data fica sem data');

-- PL oficial ----------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select is(public.set_official_pl('[{"data_referencia": "2026-10-31", "codigo_cliente": "T-A", "pl_oficial": 0}]') -> 'errors' -> 0 ->> 'message',
  'pl_oficial: número maior que zero.', 'PL zero é recusado');
select is(public.set_official_pl('[{"data_referencia": "2026-10-31", "codigo_cliente": "T-A", "pl_oficial": 610000}]') ->> 'changed', '1', 'PL gravado');
reset role;
update public.household_months set status = 'conferido' where household_id = :'HA' and ref_date = '2026-10-31';
set local role authenticated;
select pg_temp.entrar(:'G1');
select public.set_official_pl('[{"data_referencia": "2026-10-31", "codigo_cliente": "T-A", "pl_oficial": 610001}]') is not null as ok_pl \gset
reset role;
select is((select status::text from public.household_months where household_id = :'HA' and ref_date = '2026-10-31'), 'importado',
  'mudar o PL volta o mês para importado');

-- Mês fechado ---------------------------------------------------------------------------------------------------

update public.household_months set status = 'conferido' where household_id = :'HB' and ref_date = '2026-10-31';
update public.household_months set status = 'rodado' where household_id = :'HB' and ref_date = '2026-10-31';
update public.household_months set status = 'fechado' where household_id = :'HB' and ref_date = '2026-10-31';
set local role authenticated;
select pg_temp.entrar(:'G1');
select is(public.import_preview('posicoes', 'fechado.csv', jsonb_build_array(pg_temp.pos(2, 'T-B', 'T-ATV-1', 1))) -> 'errors' -> 0 ->> 'message',
  'O mês de 2026-10-31 já está fechado para T-B: não aceita nova importação.', 'família fechada não aceita importação');
select is(public.set_official_pl('[{"data_referencia": "2026-10-31", "codigo_cliente": "T-B", "pl_oficial": 1}]') -> 'errors' -> 0 ->> 'message',
  'O mês de 2026-10-31 já está fechado para T-B.', 'nem PL novo');
reset role;
select throws_ok(format($$ delete from public.positions where household_id = %L $$, :'HB'), 'P0001', null,
  'posições de mês fechado não mudam, nem para o dono do banco');

select * from finish();
rollback;
