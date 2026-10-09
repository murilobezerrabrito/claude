-- Planilhas originais no Storage privado (D-046): só a gestão, com segundo fator, envia; ninguém lê, troca nem apaga.
begin;
select plan(10);

\set G 'a9000000-0000-4000-8000-000000000001'
\set C 'a9000000-0000-4000-8000-000000000002'

create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid' from unnest(array[:'G', :'C']) u;
insert into public.user_roles (user_id, household_id, role) values (:'G', null, 'gestao'), (:'C', null, 'comite');

select results_eq($$ select public, file_size_limit from storage.buckets where id = 'planilhas' $$, $$ values (false, 10485760::bigint) $$,
  'a pasta é privada, com limite de 10 MB');

set local role anon;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('planilhas', '2099-12-31/teste-09/anonimo.csv') $$, '42501', null,
  'anônimo não envia');
reset role;

set local role authenticated;
select pg_temp.entrar(:'G', 'aal1');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('planilhas', '2099-12-31/teste-09/sem-fator.csv') $$, '42501', null,
  'gestão sem segundo fator não envia');
select pg_temp.entrar(:'C');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('planilhas', '2099-12-31/teste-09/comite.csv') $$, '42501', null,
  'comitê não envia');
select pg_temp.entrar(:'G');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('planilhas', 'sem-data/gestao.csv') $$, '42501', null,
  'a planilha fica na pasta da data de referência');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('planilhas', '2099-12-31/teste-09/posicoes.csv') $$, 'a gestão envia');
select is((select count(*)::integer from storage.objects where bucket_id = 'planilhas'), 0, 'mas não lê a pasta');
update storage.objects set name = '2099-12-31/teste-09/outro.csv' where bucket_id = 'planilhas';
select pg_temp.entrar(:'C');
select is((select count(*)::integer from storage.objects where bucket_id = 'planilhas'), 0, 'nem o comitê');
reset role;
select is((select array_agg(name) from storage.objects where bucket_id = 'planilhas' and name like '2099-12-31/teste-09/%'),
  array['2099-12-31/teste-09/posicoes.csv'], 'nem troca o arquivo');
select is((select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and qual like '%planilhas%'), 0,
  'nenhuma política de leitura, troca ou exclusão na pasta');

select * from finish();
rollback;
