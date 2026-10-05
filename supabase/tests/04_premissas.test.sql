-- Premissas: uma versão só vale aprovada, e a versão aprovada não muda (SPEC, "Premissas (comitê)").
begin;
select plan(12);

\set C 'a3000000-0000-4000-8000-000000000001'
\set K 'a3000000-0000-4000-8000-000000000002'
\set V 'f3000000-0000-4000-8000-000000000001'
\set W 'f3000000-0000-4000-8000-000000000002'
\set H 'b3000000-0000-4000-8000-000000000001'

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid' from unnest(array[:'C', :'K']) u;
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, owner_id, profile_id, weights_source, fee_rate, seed)
values (:'H', 'T-PREM', 'Teste premissas', 'ai', null, 'teste', 'carteira_atual', 0.008, 1);
insert into public.user_roles (user_id, household_id, role) values (:'C', null, 'comite'), (:'K', :'H', 'cliente_ai');

insert into public.cma_versions (id, label, nu, status) values (:'V', 'teste-v', 5, 'rascunho'), (:'W', 'teste-w', 5, 'rascunho');
insert into public.cma_classes (cma_version_id, class_code, name, mu_real, vol) values (:'V', 'ACOES', 'Ações', 0.065, 0.24), (:'V', 'POS', 'Pós', 0.04, 0.015);
select lives_ok(format($$ insert into public.cma_correlations (cma_version_id, class_a, class_b, rho) values (%L, 'ACOES', 'POS', 0.1) $$, :'V'),
  'rascunho aceita correlações');
select throws_ok(format($$ insert into public.cma_correlations (cma_version_id, class_a, class_b, rho) values (%L, 'POS', 'ACOES', 0.1) $$, :'V'),
  '23514', null, 'só o triângulo superior da matriz');

select throws_ok(format($$ update public.cma_versions set status = 'aprovada' where id = %L $$, :'V'), '23514', null, 'aprovação exige aprovador');
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

-- O cliente vê só versões aprovadas.
select set_config('request.jwt.claims', json_build_object('sub', :'K', 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select ok(exists (select 1 from public.cma_versions where id = :'V'), 'cliente vê a versão vigente');
select ok(not exists (select 1 from public.cma_versions where id = :'W'), 'cliente não vê rascunho de premissas');
reset role;

select * from finish();
rollback;
