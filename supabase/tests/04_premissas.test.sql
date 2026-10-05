-- Premissas: uma versão só vale aprovada, e a versão aprovada não muda (SPEC, "Premissas (comitê)").
begin;
select plan(26);

\set C 'a3000000-0000-4000-8000-000000000001'
\set K 'a3000000-0000-4000-8000-000000000002'
\set V 'f3000000-0000-4000-8000-000000000001'
\set W 'f3000000-0000-4000-8000-000000000002'
\set H 'b3000000-0000-4000-8000-000000000001'
\set P 'a3000000-0000-4000-8000-000000000003'
\set X 'f3000000-0000-4000-8000-000000000003'

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid' from unnest(array[:'C', :'K', :'P']) u;
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, owner_id, profile_id, weights_source, fee_rate, seed)
values (:'H', 'T-PREM', 'Teste premissas', 'ai', null, 'teste', 'carteira_atual', 0.008, 1);
insert into public.user_roles (user_id, household_id, role) values (:'C', null, 'comite'), (:'K', :'H', 'cliente_ai'), (:'P', null, 'compliance');

-- O seed local pode ter uma versão vigente: sai de vigor dentro deste teste (desfeito no fim).
update public.cma_versions set status = 'arquivada' where status = 'vigente';
insert into public.cma_versions (id, label, nu, status) values (:'V', 'teste-v', 5, 'rascunho'), (:'W', 'teste-w', 5, 'rascunho'),
  ('f3000000-0000-4000-8000-000000000004', 'teste-rascunho', 5, 'rascunho');
insert into public.cma_classes (cma_version_id, class_code, name, mu_real, vol) values (:'V', 'ACOES', 'Ações', 0.065, 0.24), (:'V', 'POS', 'Pós', 0.04, 0.015);
select lives_ok(format($$ insert into public.cma_correlations (cma_version_id, class_a, class_b, rho) values (%L, 'ACOES', 'POS', 0.1) $$, :'V'),
  'rascunho aceita correlações');
select throws_ok(format($$ insert into public.cma_correlations (cma_version_id, class_a, class_b, rho) values (%L, 'POS', 'ACOES', 0.1) $$, :'V'),
  '23514', null, 'só o triângulo superior da matriz');

select throws_ok(format($$ insert into public.cma_versions (id, label, nu, status, approved_by, approved_at) values (%L, 'teste-x', 5, 'vigente', %L, now()) $$, :'X', :'C'),
  'P0001', null, 'versão nova começa como rascunho');
select throws_ok(format($$ update public.cma_versions set status = 'vigente', approved_by = %L, approved_at = now() where id = %L $$, :'C', :'V'),
  'P0001', null, 'rascunho não pula a aprovação');
select throws_ok(format($$ update public.cma_versions set status = 'aprovada', approved_by = %L, approved_at = now() where id = %L $$, :'P', :'V'),
  'P0001', null, 'quem aprova premissas é do comitê');
select throws_ok(format($$ update public.cma_versions set status = 'aprovada' where id = %L $$, :'V'), 'P0001', null, 'aprovação exige aprovador');
select lives_ok(format($$ update public.cma_versions set status = 'aprovada', approved_by = %L, approved_at = now() where id = %L $$, :'C', :'V'),
  'o comitê aprova a versão');
select throws_ok(format($$ update public.cma_classes set mu_real = 0.08 where cma_version_id = %L and class_code = 'ACOES' $$, :'V'),
  'P0001', null, 'retorno de versão aprovada não muda');
select throws_ok(format($$ insert into public.cma_classes (cma_version_id, class_code, name, mu_real, vol) values (%L, 'FII', 'FII', 0.05, 0.14) $$, :'V'),
  'P0001', null, 'versão aprovada não ganha classe');
select throws_ok(format($$ delete from public.cma_correlations where cma_version_id = %L $$, :'V'), 'P0001', null, 'correlação de versão aprovada não sai');
select throws_ok(format($$ update public.cma_versions set nu = 7 where id = %L $$, :'V'), 'P0001', null, 'ν de versão aprovada não muda');
select lives_ok(format($$ update public.cma_versions set status = 'vigente' where id = %L $$, :'V'), 'versão aprovada entra em vigor');
select throws_ok(format($$ update public.cma_versions set status = 'rascunho' where id = %L $$, :'V'), 'P0001', null, 'versão vigente não volta a rascunho');
select lives_ok(format($$ update public.cma_versions set status = 'aprovada', approved_by = %L, approved_at = now() where id = %L $$, :'C', :'W'), 'outra versão aprovada');
select throws_ok(format($$ update public.cma_versions set status = 'vigente' where id = %L $$, :'W'), '23505', null, 'só uma versão vigente por vez');
select lives_ok(format($$ update public.cma_versions set status = 'arquivada' where id = %L $$, :'V'), 'a vigente sai de vigor');
select lives_ok(format($$ update public.cma_versions set status = 'vigente' where id = %L $$, :'W'), 'e a nova entra');

-- Textos legais: aprovados pela compliance e imutáveis.
insert into public.legal_texts (id, key, version, body) values ('f3000000-0000-4000-8000-000000000010', 'teste_aviso', 1, 'Texto original.');
select throws_ok($$ update public.legal_texts set status = 'aprovado', approved_by = 'a3000000-0000-4000-8000-000000000001', approved_at = now() where key = 'teste_aviso' $$,
  'P0001', null, 'quem aprova texto legal é da compliance');
select lives_ok($$ update public.legal_texts set status = 'aprovado', approved_by = 'a3000000-0000-4000-8000-000000000003', approved_at = now() where key = 'teste_aviso' $$,
  'a compliance aprova o texto');
select throws_ok($$ update public.legal_texts set body = 'Texto mudado.' where key = 'teste_aviso' $$, 'P0001', null, 'texto aprovado não muda');
select throws_ok($$ delete from public.legal_texts where key = 'teste_aviso' $$, 'P0001', null, 'texto aprovado não é apagado');
select throws_ok($$ insert into public.legal_texts (key, version, body, status, approved_by, approved_at) values ('teste_aviso', 2, 'Novo.', 'aprovado', 'a3000000-0000-4000-8000-000000000003', now()) $$,
  'P0001', null, 'texto novo começa como rascunho');
insert into public.legal_texts (key, version, body) values ('teste_aviso', 2, 'Texto revisto.');
select throws_ok($$ update public.legal_texts set status = 'aprovado', approved_by = 'a3000000-0000-4000-8000-000000000003', approved_at = now() where key = 'teste_aviso' and version = 2 $$,
  '23505', null, 'um só texto aprovado por chave: a versão anterior precisa ser arquivada antes');
select lives_ok($$ update public.legal_texts set status = 'arquivado' where key = 'teste_aviso' and version = 1 $$, 'a versão anterior é arquivada');

-- O cliente vê só versões aprovadas.
select set_config('request.jwt.claims', json_build_object('sub', :'K', 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select ok(exists (select 1 from public.cma_versions where id = :'W'), 'cliente vê a versão vigente');
select ok(not exists (select 1 from public.cma_versions where id = 'f3000000-0000-4000-8000-000000000004'), 'cliente não vê rascunho de premissas');
reset role;

select * from finish();
rollback;
