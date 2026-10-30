// Respostas das funções do banco usadas pelo console e por `npm run db:import` (supabase/migrations). Só tipos.
// Campos com valores em reais podem faltar: somem para quem não pode ver valores (D-042).

import type { PlanSnapshot } from '../report/types.ts'

export type Channel = 'cadm' | 'ai'
export type MonthStatus = 'importado' | 'conferido' | 'bloqueado' | 'rodado' | 'fechado'
export type ImportKind = 'posicoes' | 'movimentos'
export type AppRole = 'gestao' | 'comite' | 'compliance' | 'banker' | 'responsavel' | 'cliente_ai'

export interface ApiIssue {
  line?: number
  message: string
}

export interface PreviewFamily {
  household_id: string
  code: string
  name: string
  channel: Channel
  rows: number
  net_by_currency?: Record<string, number> | null
  contributions?: Record<string, number> | null
  withdrawals?: Record<string, number> | null
  approximate_dates?: number
  replaces: number
  status: MonthStatus | null
  official_pl?: number | null
}

export type ImportPreviewResult =
  | { ok: false; errors: ApiIssue[] }
  | {
      ok: true
      batch_id: string
      kind: ImportKind
      file_name: string
      ref_date: string
      rows: number
      families: PreviewFamily[]
      new_assets: { asset_code: string; name: string; isin: string | null; cnpj: string | null; currency: string }[]
      unmapped_assets: string[]
      warnings: ApiIssue[]
      total_value?: number | null
      official_total?: number | null
    }

export interface ImportConfirmResult {
  batch_id: string
  kind: ImportKind
  ref_date: string
  families: number
  rows: number
  replaced: number
  new_assets: number
}

export type OfficialPlResult = { ok: false; errors: ApiIssue[] } | { ok: true; families: number; changed: number }

export interface CheckItem {
  code: string
  level: 'aviso' | 'bloqueio'
  message: string
}

export interface MonthChecks {
  items: CheckItem[]
  positions_total?: number | null
  official_pl?: number | null
  difference?: number | null
  usd_rate: number | null
  usd_rate_date: string | null
  start_value?: number | null
  nominal_return: number | null
  real_return: number | null
  ipca: number | null
  approximate_dates: boolean | null
  checked_at: string
  checked_by: string | null
}

export interface CheckResult {
  household_id: string
  code: string
  name: string
  channel: Channel
  status: MonthStatus
  checks: MonthChecks
}

export interface MappingQueue {
  assets: {
    id: string
    asset_code: string
    name: string
    isin: string | null
    cnpj: string | null
    currency: string
    families_waiting: number
    suggestion: { asset_code: string; class_code: string; by: 'isin' | 'cnpj' } | null
  }[]
  classes: { class_code: string; name: string }[]
}

export interface MonthOverviewFamily {
  household_id: string
  code: string
  name: string
  channel: Channel
  status: MonthStatus | 'pendente'
  official_pl?: number | null
  checks: MonthChecks | null
  return_confirmed_by: string | null
  /** Chance da rodada oficial do mês, quando já rodou. */
  probability: number | null
  positions: number
  flows: number
}

export interface MonthOverview {
  ref_date: string
  families: MonthOverviewFamily[]
  closings: { ref_date: string; channel: Channel; status: 'aberto' | 'fechado'; opened_by: string | null; closed_by: string | null; closed_at: string | null }[]
  batches: {
    id: string
    kind: ImportKind
    file_name: string
    status: 'previa' | 'confirmada' | 'substituida'
    rows: number
    total_value?: number | null
    official_total?: number | null
    uploaded_by: string | null
    created_at: string
    confirmed_by: string | null
    confirmed_at: string | null
  }[]
}

export interface CloseMonthResult {
  ref_date: string
  channel: Channel
  closed: string[]
  left_out: { code: string; status: string }[]
}

/** Linha de `families_overview`: o retrato mais recente de cada família e o status do mês mais recente. */
export interface FamilyOverviewRow {
  household_id: string
  code: string
  name: string
  channel: Channel
  status: 'ativa' | 'encerrada'
  profile_id: string
  weights_source: 'perfil' | 'carteira_atual'
  latest: {
    ref_date: string
    probability: number
    required_return: number | null
    slack: number | null
    wealth?: number | null
    realized_return_real: number | null
  } | null
  previous_probability: number | null
  month: { ref_date: string; status: MonthStatus } | null
}

/** Respostas da função `official-run`, uma por ação. */
export interface OfficialRunParts {
  partes: string[]
}
export interface OfficialRunPart {
  parte: string
  tempo_de_calculo_ms: number
}
export interface OfficialRunDone {
  run_id: string
  probability: number
  compute_ms: number
}

/** Problema de preenchimento devolvido pelo banco, com o caminho do campo ("people.0.name"; vazio para o plano todo). */
export interface FieldIssue {
  path: string
  message: string
}

export type SaveResult<T> = ({ ok: true } & T) | { ok: false; errors: FieldIssue[] }

/** Opções dos formulários de cadastro e plano (`plan_options`). */
export interface PlanOptions {
  profiles: { id: string; name: string }[]
  classes: { class_code: string; name: string }[]
  bankers: { id: string; email: string }[]
  owners: { id: string; email: string }[]
}

/** Linha de `households`, como o editor recebe. */
export interface HouseholdRecordRow {
  id: string
  code: string
  name: string
  channel: Channel
  owner_id: string | null
  intermediary: string | null
  banker_id: string | null
  profile_id: string
  weights_source: 'perfil' | 'carteira_atual'
  suitability: string | null
  fee_rate: number
  horizon_age: number
  seed: number
  status: 'ativa' | 'encerrada'
  banker_email: string | null
  owner_email: string | null
}

/** Resposta de `household_editor`. Sem permissão para valores, a versão vem sem o conteúdo (`snapshot`). */
export interface HouseholdEditorData {
  household: HouseholdRecordRow
  versions: { id: string; version: number; base_month: string; note: string | null; created_at: string; created_by_email: string | null }[]
  latest: { id: string; version: number; base_month: string; snapshot?: PlanSnapshot } | null
  last_closed_month: string | null
  has_runs: boolean
  can_edit_registration: boolean
  can_edit_plan: boolean
}

export interface SavedPlanVersion {
  plan_version_id: string
  version: number
  base_month: string
  months_reset: number
}

/** Linha de `market_status`: o último dado e a última busca de cada série do Banco Central. */
export interface MarketStatusRow {
  code: 'cdi' | 'ipca' | 'dolar'
  last: { date: string; value: number; source: string } | null
  last_sync: {
    at: string
    from: string
    to: string
    received: number
    inserted: number
    updated: number
    error: string | null
    /** Nulo: o agendamento. */
    requested_by_email: string | null
  } | null
  last_success_at: string | null
}
