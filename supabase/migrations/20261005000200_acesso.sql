-- AWARE Objective, Fase 2, etapa 1: quem acessa o quê (SPEC, "Usuários e permissões" e "Segurança").
-- Regras:
-- - Segundo fator obrigatório para todos: sem aal2 no token, nenhuma política libera nada (D-042).
-- - Usuários internos (gestão, comitê, compliance, banker e responsável) não leem as tabelas de família direto:
--   leem só pelas funções da API, que conferem o acesso e gravam cada leitura na auditoria (D-041, opção (a) de Murilo).
-- - O cliente AI lê direto só a própria família, nunca relatórios, auditoria ou famílias CADM.
-- - As tabelas de referência (premissas aprovadas, perfis, textos aprovados, séries de mercado) são de leitura para
--   qualquer usuário com segundo fator; o comitê e a compliance escrevem as suas.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- Funções de acesso ------------------------------------------------------------------------------------------------

-- O token atual tem o segundo fator (aal2).
create function app.mfa_ok() returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' $$;

-- O usuário atual tem o papel (sem família: gestão, comitê, compliance, banker, responsável).
create function app.has_role(r public.app_role) returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = r) $$;

-- Gestão, comitê ou compliance: veem todas as famílias.
create function app.is_internal() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_roles ur
                 where ur.user_id = auth.uid() and ur.role in ('gestao', 'comite', 'compliance'))
$$;

-- O usuário atual é cliente AI desta família (e a família é do canal AI), com segundo fator.
create function app.is_client_of(hid uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.mfa_ok() and exists (
    select 1 from public.user_roles ur join public.households h on h.id = ur.household_id
    where ur.user_id = auth.uid() and ur.role = 'cliente_ai' and ur.household_id = hid and h.channel = 'ai'
  )
$$;

-- Quem pode ler os dados desta família, com segundo fator: gestão, comitê e compliance (todas); banker (as suas
-- famílias CADM); responsável (as suas famílias AI); cliente AI (a própria família).
create function app.can_read_household(hid uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.mfa_ok() and (
    app.is_internal()
    or exists (
      select 1 from public.households h
      where h.id = hid and (
        (h.channel = 'cadm' and h.banker_id = auth.uid() and app.has_role('banker'))
        or (h.channel = 'ai' and h.owner_id = auth.uid() and app.has_role('responsavel'))
      )
    )
    or app.is_client_of(hid)
  )
$$;

-- Quem pode mudar o plano desta família: gestão (todas) e o responsável (as suas famílias AI).
create function app.can_write_plan(hid uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.mfa_ok() and (
    app.has_role('gestao')
    or exists (select 1 from public.households h
               where h.id = hid and h.channel = 'ai' and h.owner_id = auth.uid() and app.has_role('responsavel'))
  )
$$;

revoke all on all functions in schema app from public;
grant execute on function app.mfa_ok(), app.has_role(public.app_role), app.is_internal(), app.is_client_of(uuid),
  app.can_read_household(uuid), app.can_write_plan(uuid) to authenticated, service_role;

-- Privilégios: ninguém anônimo; o resto passa pelas políticas -------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Política por linha em todas as tabelas.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Tabelas de família: o cliente AI lê a própria família ---------------------------------------------------------

create policy cliente_le_a_propria_familia on public.households
  for select to authenticated using (app.is_client_of(id));

do $$
declare t text;
begin
  foreach t in array array['people', 'other_assets', 'cash_flows', 'events', 'goals', 'plan_versions', 'positions',
                           'flows', 'household_months', 'monthly_snapshots', 'simulation_runs'] loop
    execute format(
      'create policy cliente_le_a_propria_familia on public.%I for select to authenticated using (app.is_client_of(household_id))', t);
  end loop;
end $$;

-- Cenários do cliente: pessoais (SPEC, "E se?").
create policy cliente_le_os_seus_cenarios on public.scenarios
  for select to authenticated using (app.is_client_of(household_id) and owner_id = auth.uid());
create policy cliente_cria_os_seus_cenarios on public.scenarios
  for insert to authenticated with check (app.is_client_of(household_id) and owner_id = auth.uid() and not for_meeting);
create policy cliente_muda_os_seus_cenarios on public.scenarios
  for update to authenticated using (app.is_client_of(household_id) and owner_id = auth.uid())
  with check (app.is_client_of(household_id) and owner_id = auth.uid() and not for_meeting);
create policy cliente_apaga_os_seus_cenarios on public.scenarios
  for delete to authenticated using (app.is_client_of(household_id) and owner_id = auth.uid());

-- Sugestões de mudança no plano: o cliente cria e acompanha as suas; o responsável confirma pela API.
create policy cliente_le_as_suas_sugestoes on public.plan_change_requests
  for select to authenticated using (app.is_client_of(household_id) and requested_by = auth.uid());
create policy cliente_sugere on public.plan_change_requests
  for insert to authenticated
  with check (app.is_client_of(household_id) and requested_by = auth.uid() and status = 'pendente'
              and reviewed_by is null and reviewed_at is null);

-- reports, audit_log (exceto a leitura abaixo), user_roles e as demais: nada para o cliente.

-- Trilha de auditoria: leitura só para compliance e comitê; ninguém escreve direto (só as funções do banco).
create policy compliance_e_comite_leem_a_auditoria on public.audit_log
  for select to authenticated using (app.mfa_ok() and (app.has_role('compliance') or app.has_role('comite')));

-- Papéis: cada um vê os seus; o comitê gerencia os usuários.
create policy cada_um_ve_os_seus_papeis on public.user_roles
  for select to authenticated using (app.mfa_ok() and (user_id = auth.uid() or app.has_role('comite')));
create policy comite_gerencia_papeis on public.user_roles
  for insert to authenticated with check (app.mfa_ok() and app.has_role('comite'));
create policy comite_muda_papeis on public.user_roles
  for update to authenticated using (app.mfa_ok() and app.has_role('comite')) with check (app.mfa_ok() and app.has_role('comite'));
create policy comite_remove_papeis on public.user_roles
  for delete to authenticated using (app.mfa_ok() and app.has_role('comite'));

-- Tabelas de referência --------------------------------------------------------------------------------------------

create policy todos_leem_os_perfis on public.profiles
  for select to authenticated using (app.mfa_ok());
create policy comite_escreve_perfis on public.profiles
  for all to authenticated using (app.mfa_ok() and app.has_role('comite')) with check (app.mfa_ok() and app.has_role('comite'));

-- Premissas: rascunhos só para a equipe interna; aprovadas para todos.
create policy le_premissas on public.cma_versions
  for select to authenticated using (app.mfa_ok() and (status <> 'rascunho' or app.is_internal()));
create policy comite_escreve_premissas on public.cma_versions
  for all to authenticated using (app.mfa_ok() and app.has_role('comite')) with check (app.mfa_ok() and app.has_role('comite'));

create policy le_classes on public.cma_classes
  for select to authenticated using (
    app.mfa_ok() and exists (select 1 from public.cma_versions v
                              where v.id = cma_version_id and (v.status <> 'rascunho' or app.is_internal())));
create policy comite_escreve_classes on public.cma_classes
  for all to authenticated using (app.mfa_ok() and app.has_role('comite')) with check (app.mfa_ok() and app.has_role('comite'));

create policy le_correlacoes on public.cma_correlations
  for select to authenticated using (
    app.mfa_ok() and exists (select 1 from public.cma_versions v
                              where v.id = cma_version_id and (v.status <> 'rascunho' or app.is_internal())));
create policy comite_escreve_correlacoes on public.cma_correlations
  for all to authenticated using (app.mfa_ok() and app.has_role('comite')) with check (app.mfa_ok() and app.has_role('comite'));

-- Textos legais: rascunhos só para a equipe interna; a compliance escreve e aprova.
create policy le_textos on public.legal_texts
  for select to authenticated using (app.mfa_ok() and (status = 'aprovado' or app.is_internal()));
create policy compliance_escreve_textos on public.legal_texts
  for all to authenticated using (app.mfa_ok() and app.has_role('compliance')) with check (app.mfa_ok() and app.has_role('compliance'));

-- Séries de mercado: leitura para todos; só as funções do servidor escrevem.
create policy todos_leem_as_series on public.market_series
  for select to authenticated using (app.mfa_ok());

-- Mapeamento de ativos, lotes de importação e fechamento do canal: equipe interna lê; o comitê mapeia ativos.
-- (A importação e o fechamento entram pela API na etapa 2.)
create policy interna_le_ativos on public.assets
  for select to authenticated using (app.mfa_ok() and app.is_internal());
create policy comite_mapeia_ativos on public.assets
  for update to authenticated using (app.mfa_ok() and app.has_role('comite')) with check (app.mfa_ok() and app.has_role('comite'));
create policy interna_le_lotes on public.import_batches
  for select to authenticated using (app.mfa_ok() and app.is_internal());
create policy interna_le_fechamentos on public.month_closings
  for select to authenticated using (app.mfa_ok() and app.is_internal());
