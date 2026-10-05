-- AWARE Objective, Fase 2, etapa 1: tabelas do SPEC ("Dados e integrações", "Modelo de dados").
-- Toda tabela com dado de família tem household_id. Valores em numeric(18,2); taxas em numeric(10,6).
-- O legado mínimo fica na versão do plano (plan_versions.snapshot), e não em households (D-033).
-- Mais duas tabelas fora do SPEC: textos legais com versão (SPEC, "Compliance") e tentativas de login (migração de bloqueio).

-- Tipos -----------------------------------------------------------------------------------------------------------

create type public.channel as enum ('cadm', 'ai');
create type public.weights_source as enum ('perfil', 'carteira_atual');
create type public.app_role as enum ('gestao', 'comite', 'compliance', 'banker', 'responsavel', 'cliente_ai');
create type public.person_role as enum ('titular', 'conjuge', 'filho');
create type public.other_asset_kind as enum ('imovel', 'empresa', 'previdencia', 'exterior');
create type public.cash_flow_kind as enum ('renda', 'gasto_essencial', 'gasto_estilo', 'aluguel', 'dividendos');
create type public.event_direction as enum ('entrada', 'saida');
create type public.event_recurrence as enum ('unica', 'anual', 'a_cada_n');
create type public.goal_kind as enum ('padrao_de_vida', 'legado');
create type public.flow_kind as enum ('aporte', 'resgate');
create type public.month_status as enum ('importado', 'conferido', 'bloqueado', 'rodado', 'fechado');
create type public.closing_status as enum ('aberto', 'fechado');
create type public.report_status as enum ('rascunho', 'em_revisao', 'aprovado', 'apresentado', 'substituido');
create type public.cma_status as enum ('rascunho', 'aprovada', 'vigente', 'arquivada');
create type public.request_status as enum ('pendente', 'confirmada', 'recusada');
create type public.legal_text_status as enum ('rascunho', 'aprovado', 'arquivado');
create type public.import_status as enum ('previa', 'confirmada', 'substituida');

-- Data de referência: o último dia do mês de competência.
create domain public.month_end as date
  check (value = (date_trunc('month', value) + interval '1 month - 1 day')::date);

-- Mês-base de uma versão do plano: o primeiro dia do mês.
create domain public.month_start as date
  check (value = date_trunc('month', value)::date);

-- Premissas e perfis (comitê) ----------------------------------------------------------------------------------

create table public.profiles (
  id text primary key,
  name text not null,
  weights_pre jsonb not null,
  weights_post jsonb,
  updated_at timestamptz not null default now()
);

create table public.cma_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  effective_date date,
  status public.cma_status not null default 'rascunho',
  nu integer not null check (nu between 3 and 30),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint cma_aprovada_tem_aprovador check (status = 'rascunho' or (approved_by is not null and approved_at is not null))
);

create table public.cma_classes (
  cma_version_id uuid not null references public.cma_versions (id) on delete cascade,
  class_code text not null,
  name text not null,
  benchmark text,
  mu_real numeric(10, 6) not null check (mu_real > -1),
  vol numeric(10, 6) not null check (vol >= 0),
  primary key (cma_version_id, class_code)
);

-- Só o triângulo superior da matriz de correlação.
create table public.cma_correlations (
  cma_version_id uuid not null,
  class_a text not null,
  class_b text not null,
  rho numeric(10, 6) not null check (rho between -1 and 1),
  primary key (cma_version_id, class_a, class_b),
  -- Ordem binária dos códigos (collate "C"), a mesma do gerador do seed, qualquer que seja o collation do banco.
  constraint correlacao_triangulo_superior check ((class_a collate "C") < (class_b collate "C")),
  foreign key (cma_version_id, class_a) references public.cma_classes (cma_version_id, class_code) on delete cascade,
  foreign key (cma_version_id, class_b) references public.cma_classes (cma_version_id, class_code) on delete cascade
);

-- Famílias e plano ----------------------------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  -- Código interno: o cliente é identificado por código, sem CPF (SPEC, "LGPD").
  code text not null unique,
  name text not null,
  channel public.channel not null,
  -- Responsável pelo cliente AI (um por família, D-025).
  owner_id uuid references auth.users (id),
  intermediary text,
  -- Banker da CADM.
  banker_id uuid references auth.users (id),
  profile_id text not null references public.profiles (id),
  weights_source public.weights_source not null,
  suitability text,
  fee_rate numeric(10, 6) not null check (fee_rate >= 0 and fee_rate < 0.1),
  horizon_age integer not null default 95 check (horizon_age between 60 and 110),
  -- Semente da família, a mesma todos os meses (D-030).
  seed bigint not null check (seed between 0 and 4294967295),
  status text not null default 'ativa' check (status in ('ativa', 'encerrada')),
  created_at timestamptz not null default now(),
  -- Na CADM, os pesos-alvo do perfil; na AI, a carteira atual (SPEC, "Motor no ciclo mensal").
  constraint pesos_por_canal check ((channel = 'cadm' and weights_source = 'perfil') or (channel = 'ai' and weights_source = 'carteira_atual')),
  constraint banker_so_na_cadm check (channel = 'cadm' or banker_id is null),
  constraint responsavel_so_na_ai check (channel = 'ai' or owner_id is null)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  name text not null,
  birth_date date not null,
  sex text not null check (sex in ('M', 'F')),
  role public.person_role not null,
  retirement_age integer check (retirement_age between 30 and 100)
);
create index people_household_idx on public.people (household_id);

-- Papéis: gestão, comitê e compliance sem família; banker e responsável ligados às famílias por banker_id e
-- owner_id; cliente AI ligado à própria família aqui.
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  role public.app_role not null,
  can_see_amounts boolean not null default true,
  created_at timestamptz not null default now(),
  constraint familia_so_do_cliente check ((role = 'cliente_ai') = (household_id is not null)),
  -- O cliente AI é o titular e vê os valores; sem valores em reais é para outros papéis (e o familiar convidado, depois do piloto).
  constraint titular_ve_valores check (role <> 'cliente_ai' or can_see_amounts),
  constraint papel_unico unique nulls not distinct (user_id, role, household_id)
);
create index user_roles_user_idx on public.user_roles (user_id);

create table public.other_assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  kind public.other_asset_kind not null,
  name text not null,
  value numeric(18, 2) not null check (value >= 0),
  annual_income numeric(18, 2) check (annual_income >= 0),
  can_be_sold boolean not null default false,
  -- Valor líquido de custos e impostos numa venda, informado pelo banker (D-015).
  net_sale_value numeric(18, 2) check (net_sale_value >= 0),
  class_code text,
  in_simulation boolean not null default false,
  constraint bem_na_simulacao_tem_classe check (not in_simulation or class_code is not null)
);
create index other_assets_household_idx on public.other_assets (household_id);

create table public.cash_flows (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  kind public.cash_flow_kind not null,
  name text not null,
  annual_amount_real numeric(18, 2) not null check (annual_amount_real >= 0),
  start_year integer not null,
  end_year integer not null,
  other_asset_id uuid references public.other_assets (id),
  check (end_year >= start_year)
);
create index cash_flows_household_idx on public.cash_flows (household_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  name text not null,
  direction public.event_direction not null,
  amount_real numeric(18, 2) not null check (amount_real >= 0),
  year integer not null,
  -- Mês do evento único e de cada ocorrência de "a cada N anos"; sem mês, julho (passo de 12 meses).
  month integer check (month between 1 and 12),
  recurrence public.event_recurrence not null,
  every_n integer check (every_n >= 1),
  end_year integer,
  constraint recorrente_tem_fim check (recurrence = 'unica' or (end_year is not null and end_year >= year)),
  constraint a_cada_n_tem_intervalo check (recurrence <> 'a_cada_n' or every_n is not null)
);
create index events_household_idx on public.events (household_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  kind public.goal_kind not null,
  person_id uuid references public.people (id),
  target_age integer check (target_age between 60 and 110),
  amount numeric(18, 2) check (amount >= 0)
);
create index goals_household_idx on public.goals (household_id);

-- Cada mudança no plano gera uma versão; base_month é o mês-base dos valores (correção pelo IPCA).
create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  version integer not null check (version >= 1),
  snapshot jsonb not null,
  base_month public.month_start not null,
  note text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (household_id, version),
  -- Uma versão por mês-base: a versão em vigor no mês é a mais recente com mês-base até ele (D-033).
  unique (household_id, base_month)
);

create table public.plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  requested_by uuid not null references auth.users (id) default auth.uid(),
  payload jsonb not null,
  status public.request_status not null default 'pendente',
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index plan_change_requests_household_idx on public.plan_change_requests (household_id);

-- Importação mensal -------------------------------------------------------------------------------------------------

-- Mapeamento ativo → classe; ativo sem classe fica na fila do comitê e bloqueia a família.
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  isin text,
  cnpj text,
  name text not null,
  class_code text,
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  mapped_by uuid references auth.users (id),
  mapped_at timestamptz
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  ref_date public.month_end not null,
  kind text not null check (kind in ('posicoes', 'movimentos')),
  file_name text not null,
  uploaded_by uuid references auth.users (id) default auth.uid(),
  row_count integer not null check (row_count >= 0),
  total_value numeric(18, 2),
  official_total numeric(18, 2),
  status public.import_status not null default 'previa',
  created_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  batch_id uuid not null references public.import_batches (id),
  ref_date public.month_end not null,
  custodian text not null,
  asset_id uuid not null references public.assets (id),
  quantity numeric(24, 8) not null,
  unit_price numeric(24, 8) not null,
  gross_value numeric(18, 2) not null,
  net_value numeric(18, 2) not null,
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$')
);
create index positions_household_ref_idx on public.positions (household_id, ref_date);

-- Aportes e resgates do mês, sempre com valor positivo.
create table public.flows (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  batch_id uuid not null references public.import_batches (id),
  ref_date public.month_end not null,
  custodian text not null,
  flow_date date,
  kind public.flow_kind not null,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  description text,
  constraint movimento_no_mes check (flow_date is null or date_trunc('month', flow_date) = date_trunc('month', ref_date))
);
create index flows_household_ref_idx on public.flows (household_id, ref_date);

-- Conferência e status por família e mês.
create table public.household_months (
  household_id uuid not null references public.households (id),
  ref_date public.month_end not null,
  official_pl numeric(18, 2),
  status public.month_status not null default 'importado',
  note text,
  primary key (household_id, ref_date)
);

-- Fechamento do canal.
create table public.month_closings (
  ref_date public.month_end not null,
  channel public.channel not null,
  status public.closing_status not null default 'aberto',
  opened_by uuid references auth.users (id) default auth.uid(),
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  primary key (ref_date, channel)
);

-- Simulações, termômetro e relatórios ---------------------------------------------------------------------------

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  owner_id uuid not null references auth.users (id) default auth.uid(),
  name text not null,
  params jsonb not null,
  for_meeting boolean not null default false,
  created_at timestamptz not null default now()
);
create index scenarios_household_idx on public.scenarios (household_id);

-- Garante a reprodutibilidade: semente, versão do motor, premissas e hash das entradas.
create table public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  scenario_id uuid references public.scenarios (id) on delete set null,
  inputs_hash text not null,
  inputs jsonb not null,
  cma_version_id uuid not null references public.cma_versions (id),
  seed bigint not null check (seed between 0 and 4294967295),
  engine_version text not null,
  paths integer not null check (paths >= 1000),
  summary jsonb not null,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index simulation_runs_household_idx on public.simulation_runs (household_id);

create table public.monthly_snapshots (
  household_id uuid not null references public.households (id),
  ref_date public.month_end not null,
  probability numeric(10, 6) not null check (probability between 0 and 1),
  required_return numeric(10, 6),
  slack numeric(10, 6),
  wealth numeric(18, 2) not null,
  realized_return_real numeric(10, 6),
  cma_version_id uuid not null references public.cma_versions (id),
  plan_version_id uuid not null references public.plan_versions (id),
  run_id uuid not null references public.simulation_runs (id),
  attribution jsonb,
  primary key (household_id, ref_date)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  ref_date public.month_end not null,
  version integer not null default 1 check (version >= 1),
  status public.report_status not null default 'rascunho',
  prepared_by uuid not null references auth.users (id),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  presented_at timestamptz,
  presented_how text check (presented_how in ('reuniao', 'pdf')),
  snapshot jsonb not null,
  pdf_path text,
  comment text,
  scenarios jsonb,
  supersedes_id uuid references public.reports (id),
  reason text,
  created_at timestamptz not null default now(),
  unique (household_id, ref_date, version),
  -- Corrigir um relatório = nova versão, com motivo.
  constraint nova_versao_tem_motivo check ((version = 1 and supersedes_id is null) or (version > 1 and supersedes_id is not null and reason is not null))
);

-- Dados de mercado e textos legais --------------------------------------------------------------------------------

create table public.market_series (
  series_code text not null,
  date date not null,
  value numeric(20, 8) not null,
  source text not null,
  primary key (series_code, date)
);

-- Textos legais guardados com versão; mudança de texto exige nova aprovação de compliance (SPEC, "Compliance").
create table public.legal_texts (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  version integer not null check (version >= 1),
  body text not null,
  status public.legal_text_status not null default 'rascunho',
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (key, version),
  constraint texto_aprovado_tem_aprovador check (status = 'rascunho' or (approved_by is not null and approved_at is not null))
);

-- Trilha de auditoria: só inserção (gatilhos na migração de integridade).
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_table text,
  target_id text,
  household_id uuid,
  details jsonb,
  at timestamptz not null default now()
);
create index audit_log_household_idx on public.audit_log (household_id, at);
create index audit_log_actor_idx on public.audit_log (actor_id, at);
