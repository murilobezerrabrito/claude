-- Bloqueio após 5 tentativas erradas de senha ou de segundo fator, até o comitê desbloquear (SPEC, "Segurança").
-- Os ganchos do Auth chamam estas funções a cada tentativa.
begin;
select plan(15);

\set L 'a4000000-0000-4000-8000-000000000001'
\set M 'a4000000-0000-4000-8000-000000000002'
\set C 'a4000000-0000-4000-8000-000000000003'
\set G 'a4000000-0000-4000-8000-000000000004'
\set N 'a4000000-0000-4000-8000-000000000005'
\set O 'a4000000-0000-4000-8000-000000000006'

insert into auth.users (id, instance_id, aud, role, email)
select u::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid'
  from unnest(array[:'L', :'M', :'C', :'G', :'N', :'O']) u;
insert into public.user_roles (user_id, role) values (:'C', 'comite'), (:'G', 'gestao');

create function pg_temp.senha(p_user uuid, p_valid boolean) returns text language sql as $$
  select public.hook_password_verification_attempt(jsonb_build_object('user_id', p_user, 'valid', p_valid)) ->> 'decision'
$$;
create function pg_temp.segundo_fator(p_user uuid, p_valid boolean) returns text language sql as $$
  select public.hook_mfa_verification_attempt(jsonb_build_object('factor_id', gen_random_uuid(), 'user_id', p_user, 'valid', p_valid)) ->> 'decision'
$$;

select is(pg_temp.senha(:'L', false), 'continue', '1ª senha errada: segue');
select is(pg_temp.senha(:'L', false), 'continue', '2ª senha errada: segue');
select is(pg_temp.senha(:'L', false), 'continue', '3ª senha errada: segue');
select is(pg_temp.senha(:'L', false), 'continue', '4ª senha errada: segue');
select is(pg_temp.senha(:'L', false), 'reject', '5ª senha errada: bloqueia');
select is(pg_temp.senha(:'L', true), 'reject', 'bloqueado, nem a senha certa entra');
select ok(exists (select 1 from public.audit_log where action = 'bloqueio' and actor_id = :'L'), 'o bloqueio ficou na auditoria');

-- Desbloqueio: só o comitê, com segundo fator.
select set_config('request.jwt.claims', json_build_object('sub', :'G', 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select throws_ok(format('select public.unlock_user(%L)', :'L'), '42501', null, 'a gestão não desbloqueia usuários');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'C', 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select lives_ok(format('select public.unlock_user(%L)', :'L'), 'o comitê desbloqueia');
reset role;
select is(pg_temp.senha(:'L', true), 'continue', 'desbloqueado, a senha certa entra');

-- A senha certa zera a contagem da senha.
select pg_temp.senha(:'M', false) from generate_series(1, 4);
select is(pg_temp.senha(:'M', true), 'continue', 'senha certa depois de 4 erros entra');
select is(pg_temp.senha(:'M', false), 'continue', 'e a contagem da senha recomeça do zero');

-- Quem sabe a senha não ganha tentativas ilimitadas do segundo fator entrando de novo a cada 4 erros.
select pg_temp.segundo_fator(:'N', false) from generate_series(1, 4);
select is(pg_temp.senha(:'N', true), 'continue', 'senha certa depois de 4 códigos errados entra');
select is(pg_temp.segundo_fator(:'N', false), 'reject', 'o 5º código errado bloqueia, mesmo com a senha certa no meio');
select is(pg_temp.segundo_fator(:'O', true), 'continue', 'segundo fator certo conclui o login');

select * from finish();
rollback;
