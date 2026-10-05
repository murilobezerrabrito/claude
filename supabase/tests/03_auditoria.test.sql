-- Trilha de auditoria: só inserção, e toda escrita fica registrada com quem fez (SPEC, "Segurança").
begin;
select plan(7);

\set U 'a2000000-0000-4000-8000-000000000001'
\set H 'b2000000-0000-4000-8000-000000000001'
\set PESSOA 'e2000000-0000-4000-8000-000000000001'

insert into auth.users (id, instance_id, aud, role, email)
values (:'U', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auditoria@teste.invalid');
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, profile_id, weights_source, fee_rate, seed)
values (:'H', 'T-AUD', 'Teste auditoria', 'cadm', 'teste', 'perfil', 0.008, 1);

-- Escrita como o usuário U.
select set_config('request.jwt.claims', json_build_object('sub', :'U', 'role', 'authenticated', 'aal', 'aal2')::text, true);
insert into public.people (id, household_id, name, birth_date, sex, role) values (:'PESSOA', :'H', 'Nome antigo', '1970-01-01', 'F', 'titular');
update public.people set name = 'Nome novo' where id = :'PESSOA';

select ok(exists (select 1 from public.audit_log where action = 'insert' and target_table = 'people' and target_id = :'PESSOA'
                  and household_id = :'H' and actor_id = :'U'), 'a inclusão ficou registrada com quem fez');
select is((select details from public.audit_log where action = 'update' and target_table = 'people' and target_id = :'PESSOA'),
  '{"name": {"antes": "Nome antigo", "depois": "Nome novo"}}'::jsonb, 'a alteração guarda só o que mudou, antes e depois');

select throws_ok('update public.audit_log set action = ''x''', 'P0001', 'A trilha de auditoria é só de inserção.', 'nem o dono do banco altera a auditoria');
select throws_ok('delete from public.audit_log', 'P0001', null, 'nem o dono do banco apaga a auditoria');
select throws_ok('truncate public.audit_log', 'P0001', null, 'nem o dono do banco esvazia a auditoria');

delete from public.people where id = :'PESSOA';
select ok(exists (select 1 from public.audit_log where action = 'delete' and target_table = 'people' and target_id = :'PESSOA'),
  'a exclusão ficou registrada');
select ok(exists (select 1 from public.audit_log where action = 'insert' and target_table = 'households' and household_id = :'H'),
  'a criação da família ficou registrada');

select * from finish();
rollback;
