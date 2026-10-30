-- Gerado por `npm run db:market-cases` (scripts/marketCases.ts) a partir de SERIES (src/market/sgs.ts). Não edite à mão.
-- Paridade entre a gravação do banco (record_market_sync) e a leitura do SGS (parseSgs): as mesmas séries, a mesma
-- faixa plausível (exclusiva) e a série mensal no dia 1. Os mesmos casos rodam no Vitest (src/market/__tests__/paridade.test.ts).
begin;
select plan(16);

-- Só a função do servidor grava (com a chave do servidor).
set local role service_role;
select is((select array_agg(k order by k) from jsonb_object_keys(public.market_last_dates()) k), array['cdi', 'dolar', 'ipca']::text[],
  'as mesmas séries de src/market');
select throws_ok($$ select public.record_market_sync('cdi', '2026-09-15', '2026-09-15', '[{"date": "2026-09-15", "value": 0.000000}]', null, null) $$, '22023', null, 'CDI: 0 (limite de baixo) é recusado');
select lives_ok($$ select public.record_market_sync('cdi', '2026-09-15', '2026-09-15', '[{"date": "2026-09-15", "value": 0.000001}]', null, null) $$, 'CDI: logo acima do limite de baixo é aceito');
select throws_ok($$ select public.record_market_sync('cdi', '2026-09-15', '2026-09-15', '[{"date": "2026-09-15", "value": 1.000000}]', null, null) $$, '22023', null, 'CDI: 1 (limite de cima) é recusado');
select lives_ok($$ select public.record_market_sync('cdi', '2026-09-15', '2026-09-15', '[{"date": "2026-09-15", "value": 0.999999}]', null, null) $$, 'CDI: logo abaixo do limite de cima é aceito');
select lives_ok($$ select public.record_market_sync('cdi', '2026-09-16', '2026-09-16', '[{"date": "2026-09-16", "value": 0.500000}]', null, null) $$, 'CDI: qualquer dia é aceito');
select throws_ok($$ select public.record_market_sync('ipca', '2026-09-01', '2026-09-01', '[{"date": "2026-09-01", "value": -5.000000}]', null, null) $$, '22023', null, 'IPCA: -5 (limite de baixo) é recusado');
select lives_ok($$ select public.record_market_sync('ipca', '2026-09-01', '2026-09-01', '[{"date": "2026-09-01", "value": -4.999999}]', null, null) $$, 'IPCA: logo acima do limite de baixo é aceito');
select throws_ok($$ select public.record_market_sync('ipca', '2026-09-01', '2026-09-01', '[{"date": "2026-09-01", "value": 10.000000}]', null, null) $$, '22023', null, 'IPCA: 10 (limite de cima) é recusado');
select lives_ok($$ select public.record_market_sync('ipca', '2026-09-01', '2026-09-01', '[{"date": "2026-09-01", "value": 9.999999}]', null, null) $$, 'IPCA: logo abaixo do limite de cima é aceito');
select throws_ok($$ select public.record_market_sync('ipca', '2026-09-15', '2026-09-15', '[{"date": "2026-09-15", "value": 2.500000}]', null, null) $$, '22023', null, 'IPCA: fora do dia 1 é recusado');
select throws_ok($$ select public.record_market_sync('dolar', '2026-09-15', '2026-09-15', '[{"date": "2026-09-15", "value": 0.500000}]', null, null) $$, '22023', null, 'Dólar de venda: 0.5 (limite de baixo) é recusado');
select lives_ok($$ select public.record_market_sync('dolar', '2026-09-15', '2026-09-15', '[{"date": "2026-09-15", "value": 0.500001}]', null, null) $$, 'Dólar de venda: logo acima do limite de baixo é aceito');
select throws_ok($$ select public.record_market_sync('dolar', '2026-09-15', '2026-09-15', '[{"date": "2026-09-15", "value": 50.000000}]', null, null) $$, '22023', null, 'Dólar de venda: 50 (limite de cima) é recusado');
select lives_ok($$ select public.record_market_sync('dolar', '2026-09-15', '2026-09-15', '[{"date": "2026-09-15", "value": 49.999999}]', null, null) $$, 'Dólar de venda: logo abaixo do limite de cima é aceito');
select lives_ok($$ select public.record_market_sync('dolar', '2026-09-16', '2026-09-16', '[{"date": "2026-09-16", "value": 25.250000}]', null, null) $$, 'Dólar de venda: qualquer dia é aceito');

select * from finish();
rollback;
