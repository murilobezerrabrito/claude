-- Convite do cliente AI (Fase 3, etapa 3c; D-071 e D-074): quem convida (a gestão e o responsável da família AI ativa,
-- com segundo fator), as recusas (e-mail inválido, de usuário interno, de cliente de outra família, família que já tem
-- cliente ativo), a gravação só pela função do servidor, a troca do convite pendente, a situação do acesso no console
-- e tirar o acesso, com a auditoria.
begin;
select plan(31);

\set G  'af000000-0000-4000-8000-000000000001'
\set R1 'af000000-0000-4000-8000-000000000002'
\set R2 'af000000-0000-4000-8000-000000000003'
\set P  'af000000-0000-4000-8000-000000000004'
\set K1 'af000000-0000-4000-8000-000000000005'
\set K2 'af000000-0000-4000-8000-000000000006'
\set KB 'af000000-0000-4000-8000-000000000007'
\set HA 'bf000000-0000-4000-8000-00000000000a'
\set HB 'bf000000-0000-4000-8000-00000000000b'
\set HC 'bf000000-0000-4000-8000-00000000000c'
\set HE 'bf000000-0000-4000-8000-00000000000e'

create function pg_temp.entrar(p_user uuid, p_aal text default 'aal2') returns text language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true)
$$;

insert into auth.users (id, instance_id, aud, role, email)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email
  from (values (:'G', 'conv.gestao@teste.invalid'), (:'R1', 'conv.r1@teste.invalid'), (:'R2', 'conv.r2@teste.invalid'),
               (:'P', 'conv.compliance@teste.invalid'), (:'K1', 'conv.k1@teste.invalid'), (:'K2', 'conv.k2@teste.invalid'),
               (:'KB', 'conv.kb@teste.invalid')) u(id, email);
insert into public.profiles (id, name, weights_pre) values ('teste', 'Perfil de teste', '{"POS": 1}') on conflict (id) do nothing;
insert into public.households (id, code, name, channel, owner_id, profile_id, weights_source, fee_rate, seed, status) values
  (:'HA', 'T-CVA', 'Convite A', 'ai', :'R1', 'teste', 'carteira_atual', 0.008, 21, 'ativa'),
  (:'HB', 'T-CVB', 'Convite B', 'ai', :'R2', 'teste', 'carteira_atual', 0.008, 22, 'ativa'),
  (:'HC', 'T-CVC', 'Convite C', 'cadm', null, 'teste', 'perfil', 0.008, 23, 'ativa'),
  (:'HE', 'T-CVE', 'Convite E', 'ai', :'R1', 'teste', 'carteira_atual', 0.008, 24, 'encerrada');
insert into public.user_roles (user_id, household_id, role) values
  (:'G', null, 'gestao'), (:'R1', null, 'responsavel'), (:'R2', null, 'responsavel'), (:'P', null, 'compliance'), (:'KB', :'HB', 'cliente_ai');

-- Quem convida --------------------------------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar(:'R1', 'aal1');
select throws_ok(format($$ select public.client_invite_check(%L, 'novo@teste.invalid') $$, :'HA'), '42501', null, 'sem segundo fator, não convida');
select pg_temp.entrar(:'R2');
select throws_ok(format($$ select public.client_invite_check(%L, 'novo@teste.invalid') $$, :'HA'), '42501', null, 'o responsável de outra família não convida');
select pg_temp.entrar(:'P');
select throws_ok(format($$ select public.client_invite_check(%L, 'novo@teste.invalid') $$, :'HA'), '42501', null, 'a compliance não convida');
select pg_temp.entrar(:'G');
select throws_ok(format($$ select public.client_invite_check(%L, 'novo@teste.invalid') $$, :'HC'), '42501', null, 'família CADM não tem cliente no app');
select throws_ok(format($$ select public.client_invite_check(%L, 'novo@teste.invalid') $$, :'HE'), '42501', null, 'família encerrada não convida');
select pg_temp.entrar(:'KB');
select throws_ok(format($$ select public.client_invite_check(%L, 'novo@teste.invalid') $$, :'HB'), '42501', null, 'o cliente não convida');

-- Recusas do e-mail ---------------------------------------------------------------------------------------------------

select pg_temp.entrar(:'R1');
select throws_ok(format($$ select public.client_invite_check(%L, 'sem-arroba') $$, :'HA'), '22023', null, 'e-mail inválido');
select throws_ok(format($$ select public.client_invite_check(%L, 'Conv.R2@teste.invalid') $$, :'HA'), 'P0001', null, 'e-mail de usuário interno');
select throws_ok(format($$ select public.client_invite_check(%L, 'conv.kb@teste.invalid') $$, :'HA'), 'P0001', null, 'e-mail de cliente de outra família');
select is(public.client_invite_check(:'HA', '  Novo.Cliente@Teste.invalid ') ->> 'email', 'novo.cliente@teste.invalid', 'o e-mail sai normalizado');
select is(public.client_invite_check(:'HA', 'novo.cliente@teste.invalid') ->> 'state', 'novo', 'e-mail sem conta: convite novo');
select is(public.client_invite_check(:'HA', 'conv.k1@teste.invalid') ->> 'state', 'reenvio', 'conta já criada pelo Auth: reenvio');
select is((public.client_invite_check(:'HA', 'conv.k1@teste.invalid') ->> 'confirmed')::boolean, false, 'convite ainda não aberto');

-- Gravação: só a função do servidor -----------------------------------------------------------------------------------

select throws_ok(format($$ select public.record_client_invite(%L, %L, %L, 'conv.k1@teste.invalid') $$, :'R1', :'HA', :'K1'), '42501', null,
  'o navegador não grava o convite');
reset role;
set local role service_role;
select throws_ok(format($$ select public.record_client_invite(%L, %L, %L, 'conv.k1@teste.invalid') $$, :'R2', :'HA', :'K1'), '42501', null,
  'a função confere de novo quem convidou');
select throws_ok(format($$ select public.record_client_invite(%L, %L, %L, 'outro@teste.invalid') $$, :'R1', :'HA', :'K1'), '22023', null,
  'o convite precisa ser do e-mail da conta');
select is(public.record_client_invite(:'R1', :'HA', :'K1', 'conv.k1@teste.invalid') ->> 'state', 'pendente', 'convite gravado, pendente');
select lives_ok(format($$ select public.record_client_invite(%L, %L, %L, 'conv.k1@teste.invalid') $$, :'R1', :'HA', :'K1'), 'reenviar não duplica o papel');
reset role;
select is((select count(*)::int from public.user_roles where household_id = :'HA' and role = 'cliente_ai'), 1, 'um papel de cliente na família');
-- Troca do convite pendente para outro e-mail.
set local role service_role;
select lives_ok(format($$ select public.record_client_invite(%L, %L, %L, 'conv.k2@teste.invalid') $$, :'G', :'HA', :'K2'), 'a gestão troca o convite pendente');
reset role;
select is((select array_agg(user_id) from public.user_roles where household_id = :'HA' and role = 'cliente_ai'), array[:'K2']::uuid[],
  'o convite pendente anterior sai: um cliente por família');
select ok(exists (select 1 from public.audit_log where action = 'convidar_cliente' and household_id = :'HA' and actor_id = :'G'
                   and details -> 'convite_trocado' ? 'conv.k1@teste.invalid'), 'a troca vai para a auditoria');

-- Cliente ativo (cadastrou o autenticador): a família não recebe outro convite -----------------------------------------

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), :'K2', 'teste', 'totp', 'verified', now(), now());
set local role authenticated;
select pg_temp.entrar(:'R1');
select throws_ok(format($$ select public.client_invite_check(%L, 'conv.k2@teste.invalid') $$, :'HA'), 'P0001', null, 'cliente ativo não precisa de convite');
select throws_ok(format($$ select public.client_invite_check(%L, 'conv.k1@teste.invalid') $$, :'HA'), 'P0001', null, 'família com cliente ativo não convida outro');
select is(public.client_access_of(:'HA') #>> '{clients,0,state}', 'ativo', 'o console vê o cliente ativo');
select is((public.client_access_of(:'HA') ->> 'can_manage')::boolean, true, 'e o responsável pode cuidar do acesso');
select pg_temp.entrar(:'P');
select is((public.client_access_of(:'HA') ->> 'can_manage')::boolean, false, 'a compliance só lê');
select pg_temp.entrar(:'R2');
select throws_ok(format('select public.client_access_of(%L)', :'HA'), '42501', null, 'o responsável de outra família não vê');
select throws_ok(format('select public.revoke_client_access(%L, %L)', :'HA', :'K2'), '42501', null, 'nem tira o acesso');

-- Tirar o acesso ----------------------------------------------------------------------------------------------------------

select pg_temp.entrar(:'R1');
select lives_ok(format('select public.revoke_client_access(%L, %L)', :'HA', :'K2'), 'o responsável tira o acesso do cliente');
reset role;
select ok(not exists (select 1 from public.user_roles where user_id = :'K2') and
          exists (select 1 from public.audit_log where action = 'tirar_acesso_cliente' and household_id = :'HA'),
  'o papel sai e a auditoria registra');

select * from finish();
rollback;
