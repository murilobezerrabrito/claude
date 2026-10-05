-- Estrutura e privilégios: política por linha em toda tabela, household_id nas tabelas de família, nada para o
-- anônimo, auditoria sem update nem delete, funções sensíveis fora do alcance de quem não deve.
begin;
select plan(25);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'toda tabela pública tem política por linha ligada');

-- Toda tabela com dado de família tem household_id obrigatório.
select col_not_null('public', t, 'household_id', format('%s tem household_id obrigatório', t))
  from unnest(array['people', 'other_assets', 'cash_flows', 'events', 'goals', 'plan_versions', 'plan_change_requests',
                    'positions', 'flows', 'household_months', 'scenarios', 'simulation_runs', 'monthly_snapshots',
                    'reports']) t;

select is(
  (select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
  0, 'o anônimo não tem privilégio em nenhuma tabela');

select ok(not has_table_privilege('authenticated', 'public.audit_log', 'UPDATE'), 'ninguém autenticado altera a auditoria');
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'DELETE'), 'ninguém autenticado apaga a auditoria');
select ok(not has_table_privilege('service_role', 'public.audit_log', 'DELETE'), 'nem o servidor apaga a auditoria');

select ok(not has_function_privilege('anon', 'public.list_households(public.channel)', 'EXECUTE'), 'o anônimo não chama a lista de famílias');
select ok(not has_function_privilege('anon', 'public.household_detail(uuid)', 'EXECUTE'), 'o anônimo não chama o detalhe da família');
select ok(not has_function_privilege('authenticated', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE'),
  'usuário não chama o gancho de senha');
select ok(has_function_privilege('supabase_auth_admin', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE'),
  'o Auth chama o gancho de senha');
select ok(has_function_privilege('supabase_auth_admin', 'public.hook_mfa_verification_attempt(jsonb)', 'EXECUTE'),
  'o Auth chama o gancho do segundo fator');
select ok(not has_table_privilege('authenticated', 'app.login_failures', 'SELECT'), 'usuário não lê as tentativas de login');

select * from finish();
rollback;
