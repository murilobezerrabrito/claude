-- Conferência e mapeamento de ativos (SPEC, "Fluxo do mês", "Importação mensal das posições" e "Dados mensais por
-- canal"): PL com tolerância de 0,01%, ativo sem classe bloqueia até o comitê mapear, dólar da data de referência,
-- plano em vigor, rentabilidade real fora de −10% a +10% confirmada por quem importou, e o mesmo Dietz de src/report.
begin;
select plan(43);

\set G1 'a7000000-0000-4000-8000-000000000001'
\set G2 'a7000000-0000-4000-8000-000000000002'
\set C  'a7000000-0000-4000-8000-000000000003'
\set HA 'b7000000-0000-4000-8000-00000000000a'
\set HB 'b7000000-0000-4000-8000-00000000000b'
\set HN 'b7000000-0000-4000-8000-00000000000c'
\set V  'f7000000-0000-4000-8000-000000000001'

create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;
create function pg_temp.pos(p_line integer, p_code text, p_asset text, p_net numeric, p_currency text, p_ref text) returns jsonb language sql as $$
  select jsonb_build_object('linha', p_line, 'data_referencia', p_ref, 'codigo_cliente', p_code, 'custodiante', 'C1',
           'codigo_ativo', p_asset, 'nome_ativo', 'Ativo ' || p_asset, 'quantidade', 1, 'preco_unitario', p_net,
           'valor_bruto', p_net, 'valor_liquido', p_net, 'moeda', p_currency)
$$;
create function pg_temp.mov(p_line integer, p_code text, p_kind text, p_amount numeric, p_date text, p_ref text) returns jsonb language sql as $$
  select jsonb_build_object('linha', p_line, 'data_referencia', p_ref, 'codigo_cliente', p_code, 'custodiante', 'C1',
           'data_movimento', p_date, 'tipo', p_kind, 'valor', p_amount, 'moeda', 'BRL')
$$;
-- Importa e confirma (como quem estiver logado); devolve o número do lote.
create function pg_temp.importar(p_kind text, p_rows jsonb) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := public.import_preview(p_kind, 'teste.csv', p_rows);
  if not (r ->> 'ok')::boolean then raise exception 'prévia recusada: %', r -> 'errors'; end if;
  perform public.import_confirm((r ->> 'batch_id')::uuid);
  return (r ->> 'batch_id')::uuid;
end $$;
create function pg_temp.pl(p_code text, p_ref text, p_value numeric) returns void language sql as $$
  select null::void from public.set_official_pl(jsonb_build_array(jsonb_build_object('data_referencia', p_ref, 'codigo_cliente', p_code, 'pl_oficial', p_value)))
$$;
-- Situação de uma família no mês (lida como o dono do banco).
create function pg_temp.mes(p_household uuid, p_ref date) returns public.household_months language sql as $$
  select * from public.household_months where household_id = p_household and ref_date = p_ref
$$;
create function pg_temp.tem(p_household uuid, p_ref date, p_code text) returns boolean language sql as $$
  select coalesce((select checks -> 'items' @> jsonb_build_array(jsonb_build_object('code', p_code))
                     from public.household_months where household_id = p_household and ref_date = p_ref), false)
$$;

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'G1', :'G2', :'C']) u;
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, profile_id, weights_source, fee_rate, seed) values
  (:'HA', 'T-CA', 'Teste conferência A', 'cadm', 'teste', 'perfil', 0.008, 1),
  (:'HB', 'T-CB', 'Teste conferência B', 'cadm', 'teste', 'perfil', 0.008, 2),
  (:'HN', 'T-CN', 'Teste sem plano', 'cadm', 'teste', 'perfil', 0.008, 3);
insert into public.user_roles (user_id, household_id, role) values (:'G1', null, 'gestao'), (:'G2', null, 'gestao'), (:'C', null, 'comite');
insert into public.plan_versions (household_id, version, snapshot, base_month, created_at) values
  (:'HA', 1, '{}', '2026-09-01', now()),
  (:'HB', 1, '{}', '2026-09-01', now() - interval '13 months');

-- Premissas vigentes de teste com três classes (a vigente do seed sai de vigor dentro do teste).
update public.cma_versions set status = 'arquivada' where status = 'vigente';
insert into public.cma_versions (id, label, nu, status) values (:'V', 'teste-conferencia', 5, 'rascunho');
insert into public.cma_classes (cma_version_id, class_code, name, mu_real, vol) values
  (:'V', 'POS', 'Pós-fixado', 0.04, 0.015), (:'V', 'ACOES', 'Ações', 0.065, 0.24), (:'V', 'INTL', 'Exterior', 0.05, 0.16);
update public.cma_versions set status = 'aprovada', approved_by = :'C', approved_at = now() where id = :'V';
update public.cma_versions set status = 'vigente' where id = :'V';

-- Mercado fictício: dólar de venda (31/10/2026 é sábado) e IPCA de outubro (0,40%); sem IPCA nem dólar de novembro.
insert into public.market_series (series_code, date, value, source) values
  ('dolar', '2026-09-30', 5.00, 'teste'), ('dolar', '2026-10-30', 5.04, 'teste'), ('ipca', '2026-10-01', 0.40, 'teste')
on conflict (series_code, date) do update set value = excluded.value;
delete from public.market_series where (series_code = 'dolar' and date between '2026-11-20' and '2026-11-30')
                                    or (series_code = 'ipca' and date = '2026-11-01');

-- Setembro: importação e mapeamento ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select pg_temp.importar('posicoes', jsonb_build_array(
  pg_temp.pos(2, 'T-CA', 'T-C-POS', 11040000, 'BRL', '2026-09-30'), pg_temp.pos(3, 'T-CA', 'T-C-USD', 192000, 'USD', '2026-09-30'),
  pg_temp.pos(4, 'T-CB', 'T-C-POS', 1000000, 'BRL', '2026-09-30'), pg_temp.pos(5, 'T-CN', 'T-C-POS', 10, 'BRL', '2026-09-30'))) is not null as ok_set \gset
select pg_temp.pl('T-CA', '2026-09-30', 12000000);
select pg_temp.pl('T-CN', '2026-09-30', 10);

select pg_temp.entrar(:'C');
select throws_ok($$ select public.check_month('2026-09-30') $$, '42501', null, 'o comitê não confere o mês');
select pg_temp.entrar(:'G1');
select is(jsonb_array_length(public.check_month('2026-09-30', 'b7000000-0000-4000-8000-00000000000a')), 1, 'a gestão confere uma família');
reset role;
select is((pg_temp.mes(:'HA', '2026-09-30')).status::text, 'bloqueado', 'ativo sem classe bloqueia a família');
select ok(pg_temp.tem(:'HA', '2026-09-30', 'ativo_sem_classe'), 'o motivo é o ativo sem classe');

-- Fila do comitê, com sugestão pelo ISIN de um ativo já mapeado.
update public.assets set isin = 'BRTESTEPOS01' where asset_code = 'T-C-POS';
insert into public.assets (asset_code, isin, name, currency) values ('T-C-POS-B', 'BRTESTEPOS01', 'Mesmo título, outro código', 'BRL');
set local role authenticated;
select pg_temp.entrar(:'C');
select is((select count(*)::integer from jsonb_array_elements(public.unmapped_assets() -> 'assets') a where a ->> 'asset_code' like 'T-C-%'), 3,
  'a fila lista os ativos sem classe');
select is((select jsonb_agg(c ->> 'class_code' order by c ->> 'class_code') from jsonb_array_elements(public.unmapped_assets() -> 'classes') c),
  '["ACOES", "INTL", "POS"]'::jsonb, 'com as classes das premissas vigentes');
select pg_temp.entrar(:'G1');
select throws_ok($$ select public.map_asset((select id from public.assets where asset_code = 'T-C-POS'), 'POS') $$, '42501', null,
  'a gestão não mapeia ativos');
select pg_temp.entrar(:'C');
select throws_ok($$ select public.map_asset((select id from public.assets where asset_code = 'T-C-POS'), 'XYZ') $$, 'P0001',
  'A classe XYZ não existe nas premissas vigentes.', 'a classe precisa existir nas premissas vigentes');
reset role;
-- (O comitê não lê as posições, mas lê o cadastro de ativos.)
set local role authenticated;
select pg_temp.entrar(:'C');
select is(public.map_asset((select id from public.assets where asset_code = 'T-C-POS'), 'POS') ->> 'months_reset', '1',
  'mapear reabre a conferência das famílias com o ativo');
select is((select a -> 'suggestion' from jsonb_array_elements(public.unmapped_assets() -> 'assets') a where a ->> 'asset_code' = 'T-C-POS-B'),
  '{"by": "isin", "asset_code": "T-C-POS", "class_code": "POS"}'::jsonb, 'sugestão pelo mesmo ISIN, sem aplicar sozinha');
select lives_ok($$ select public.map_asset((select id from public.assets where asset_code = 'T-C-USD'), 'INTL') $$, 'o comitê mapeia o ativo em dólar');
reset role;
select is((pg_temp.mes(:'HA', '2026-09-30')).status::text, 'importado', 'a família volta para importado');

-- Setembro: conferência ---------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select public.check_month('2026-09-30') is not null as ok_conf \gset
reset role;
select is((pg_temp.mes(:'HA', '2026-09-30')).status::text, 'conferido', 'PL bate com a soma em reais: conferido');
select is((select net_value_brl from public.positions p join public.assets a on a.id = p.asset_id where a.asset_code = 'T-C-USD' and p.ref_date = '2026-09-30'),
  960000.00, 'posição em dólar convertida pela cotação da data de referência');
select ok(pg_temp.tem(:'HA', '2026-09-30', 'primeiro_mes') and pg_temp.tem(:'HA', '2026-09-30', 'sem_movimentos'),
  'avisos: primeiro mês (sem rentabilidade) e mês sem movimentos');
select is((pg_temp.mes(:'HB', '2026-09-30')).status::text, 'bloqueado', 'sem PL oficial: bloqueado');
select ok(pg_temp.tem(:'HB', '2026-09-30', 'sem_pl'), 'o motivo é a falta do PL');
select ok((pg_temp.mes(:'HN', '2026-09-30')).status = 'bloqueado' and pg_temp.tem(:'HN', '2026-09-30', 'sem_plano'), 'família sem plano: bloqueada');

set local role authenticated;
select pg_temp.entrar(:'G1');
select pg_temp.pl('T-CB', '2026-09-30', 1000100);
select public.check_month('2026-09-30', 'b7000000-0000-4000-8000-00000000000b') is not null as ok_b1 \gset
reset role;
select is((pg_temp.mes(:'HB', '2026-09-30')).status::text, 'conferido', 'diferença de exatamente 0,01% passa');
select ok(pg_temp.tem(:'HB', '2026-09-30', 'plano_antigo'), 'plano com mais de 12 meses só avisa');
set local role authenticated;
select pg_temp.entrar(:'G1');
select pg_temp.pl('T-CB', '2026-09-30', 1000111);
select public.check_month('2026-09-30') is not null as ok_b2 \gset
reset role;
select is((select i ->> 'message' from jsonb_array_elements((pg_temp.mes(:'HB', '2026-09-30')).checks -> 'items') i where i ->> 'code' = 'pl_nao_confere'),
  'A soma das posições não bate com o PL oficial: diferença de 0,011%, acima da tolerância de 0,01%. A família fica fora do fechamento até a diferença ser resolvida.',
  'diferença de 0,011% bloqueia');
select is((pg_temp.mes(:'HA', '2026-09-30')).status::text, 'conferido', 'só a família com diferença fica bloqueada');
set local role authenticated;
select pg_temp.entrar(:'G1');
select pg_temp.pl('T-CB', '2026-09-30', 1000000);
select public.check_month('2026-09-30') is not null as ok_b3 \gset

-- Outubro: rentabilidade (mesmo Dietz de src/report) ------------------------------------------------------------

select pg_temp.importar('posicoes', jsonb_build_array(
  pg_temp.pos(2, 'T-CA', 'T-C-POS', 10543761.29, 'BRL', '2026-10-31'), pg_temp.pos(3, 'T-CA', 'T-C-USD', 180000, 'USD', '2026-10-31'),
  pg_temp.pos(4, 'T-CB', 'T-C-POS', 1300000, 'BRL', '2026-10-31'))) is not null as ok_out \gset
select pg_temp.importar('movimentos', jsonb_build_array(pg_temp.mov(2, 'T-CA', 'resgate', 300000, '2026-10-15', '2026-10-31'))) is not null as ok_mov \gset
select pg_temp.pl('T-CA', '2026-10-31', 11450961.29);
select pg_temp.pl('T-CB', '2026-10-31', 1300000);
select public.check_month('2026-10-31') is not null as ok_conf_out \gset
reset role;
select is((pg_temp.mes(:'HA', '2026-10-31')).status::text, 'conferido', 'Andrade fictícia de outubro: conferida');
-- Valores de monthReturn (src/report/performance.ts) com os mesmos dados: nominal −0,02102450983115476 e real −0,024924810588799584.
select ok(abs(((pg_temp.mes(:'HA', '2026-10-31')).checks ->> 'nominal_return')::numeric - (-0.02102450983115476)) < 1e-12,
  'retorno nominal igual ao de src/report');
select ok(abs(((pg_temp.mes(:'HA', '2026-10-31')).checks ->> 'real_return')::numeric - (-0.024924810588799584)) < 1e-12,
  'retorno real igual ao de src/report');
select is((pg_temp.mes(:'HB', '2026-10-31')).status::text, 'bloqueado', 'rentabilidade de +30% bloqueia');
select ok(pg_temp.tem(:'HB', '2026-10-31', 'rentabilidade_fora_da_faixa'), 'o motivo é a faixa de −10% a +10%');

set local role authenticated;
select pg_temp.entrar(:'G2');
select throws_ok($$ select public.confirm_return('b7000000-0000-4000-8000-00000000000b', '2026-10-31') $$, '42501',
  'Só quem importou o mês desta família confirma a rentabilidade fora da faixa.', 'outra pessoa da gestão não confirma');
select pg_temp.entrar(:'G1');
select throws_ok($$ select public.confirm_return('b7000000-0000-4000-8000-00000000000a', '2026-10-31') $$, 'P0001', null,
  'nada a confirmar quando a rentabilidade está na faixa');
select is(public.confirm_return('b7000000-0000-4000-8000-00000000000b', '2026-10-31') ->> 'status', 'conferido', 'quem importou confirma');
reset role;
select ok(pg_temp.tem(:'HB', '2026-10-31', 'rentabilidade_confirmada'), 'a confirmação fica registrada na conferência');

-- Novembro: sem dólar, sem IPCA e possível transferência ---------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'G1');
select pg_temp.importar('posicoes', jsonb_build_array(
  pg_temp.pos(2, 'T-CA', 'T-C-USD', 1000, 'USD', '2026-11-30'), pg_temp.pos(3, 'T-CB', 'T-C-POS', 1310500, 'BRL', '2026-11-30'))) is not null as ok_nov \gset
select pg_temp.importar('movimentos', jsonb_build_array(
  pg_temp.mov(2, 'T-CB', 'aporte', 1000, '2026-11-10', '2026-11-30'), pg_temp.mov(3, 'T-CB', 'resgate', 1000, '2026-11-10', '2026-11-30'),
  pg_temp.mov(4, 'T-CB', 'aporte', 500, null, '2026-11-30'))) is not null as ok_nmov \gset
select pg_temp.pl('T-CA', '2026-11-30', 5000);
select pg_temp.pl('T-CB', '2026-11-30', 1310500);
select public.check_month('2026-11-30') is not null as ok_conf_nov \gset
reset role;
select ok((pg_temp.mes(:'HA', '2026-11-30')).status = 'bloqueado' and pg_temp.tem(:'HA', '2026-11-30', 'sem_dolar'), 'sem dólar da data: bloqueado');
select ok((pg_temp.mes(:'HB', '2026-11-30')).status = 'conferido' and pg_temp.tem(:'HB', '2026-11-30', 'sem_ipca')
          and (pg_temp.mes(:'HB', '2026-11-30')).checks ->> 'real_return' is null, 'sem IPCA: faixa no retorno nominal, com aviso');
select ok(pg_temp.tem(:'HB', '2026-11-30', 'possivel_transferencia'), 'aporte e resgate iguais no mesmo dia: aviso de transferência');
select ok(pg_temp.tem(:'HB', '2026-11-30', 'datas_aproximadas'), 'movimento sem data: aviso de datas aproximadas');

-- Dezembro: o mês anterior (novembro) da família A está bloqueado, então a faixa não pode ser conferida.
set local role authenticated;
select pg_temp.entrar(:'G1');
select pg_temp.importar('posicoes', jsonb_build_array(pg_temp.pos(2, 'T-CA', 'T-C-POS', 100, 'BRL', '2026-12-31'))) is not null as ok_dez \gset
select pg_temp.pl('T-CA', '2026-12-31', 100);
select public.check_month('2026-12-31') is not null as ok_conf_dez \gset
reset role;
select ok((pg_temp.mes(:'HA', '2026-12-31')).status = 'bloqueado' and pg_temp.tem(:'HA', '2026-12-31', 'mes_anterior_pendente'),
  'mês anterior não conferido bloqueia: a faixa não pode ser conferida');

-- Status só pelas mudanças permitidas ----------------------------------------------------------------------------

select throws_ok(format($$ update public.household_months set status = 'fechado' where household_id = %L and ref_date = '2026-09-30' $$, :'HA'),
  'P0001', null, 'conferido não pula para fechado');
select throws_ok(format($$ update public.household_months set status = 'rodado' where household_id = %L and ref_date = '2026-09-30' $$, :'HN'),
  'P0001', null, 'bloqueado não roda');
select throws_ok(format($$ insert into public.household_months (household_id, ref_date, status) values (%L, '2027-01-31', 'conferido') $$, :'HA'),
  'P0001', null, 'mês novo começa importado');
update public.household_months set status = 'rodado' where household_id = :'HA' and ref_date = '2026-10-31';
set local role authenticated;
select pg_temp.entrar(:'G1');
select throws_ok($$ select public.check_month('2026-10-31', 'b7000000-0000-4000-8000-00000000000a') $$, 'P0001', null,
  'família rodada não volta para a conferência pela conferência');
select pg_temp.entrar(:'C');
select lives_ok($$ select public.map_asset((select id from public.assets where asset_code = 'T-C-USD'), 'ACOES') $$, 'o comitê corrige a classe');
reset role;
select is((pg_temp.mes(:'HA', '2026-10-31')).status::text, 'importado', 'corrigir a classe tira a família rodada da rodada');

-- Mudar o mês anterior reabre os seguintes: outubro e novembro da família B partiam do PL de setembro.
set local role authenticated;
select pg_temp.entrar(:'G1');
select pg_temp.pl('T-CB', '2026-09-30', 1000000.01);
reset role;
select ok((pg_temp.mes(:'HB', '2026-10-31')).status = 'importado' and (pg_temp.mes(:'HB', '2026-10-31')).return_confirmed_by is null
          and (pg_temp.mes(:'HB', '2026-11-30')).status = 'importado',
  'mudar o PL de setembro reabre outubro e novembro, e a confirmação de outubro cai');

select * from finish();
rollback;
