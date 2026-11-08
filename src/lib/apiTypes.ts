// Respostas das funções do banco usadas pelo console e por `npm run db:import` (supabase/migrations). Só tipos.
// Campos com valores em reais podem faltar: somem para quem não pode ver valores (D-042).

import type { RequiredReturnStatus } from '../engine/types.ts'
import type { ReportScenarioParams } from '../report/scenarios.ts'
import type { ReportSnapshot } from '../report/snapshot.ts'
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
  /** Gestor responsável (capa do relatório), só na CADM. */
  manager_name: string | null
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

export type ReportStatus = 'rascunho' | 'em_revisao' | 'aprovado' | 'apresentado' | 'substituido' | 'descartado'

/** Resumo de uma versão do relatório (situação, pessoas, datas e motivos), sem os números. */
export interface ReportSummary {
  id: string
  household_id: string
  ref_date: string
  version: number
  status: ReportStatus
  prepared_by: string
  prepared_by_email: string | null
  approved_by_email: string | null
  approved_at: string | null
  presented_at: string | null
  presented_how: 'reuniao' | 'pdf' | null
  has_pdf: boolean
  /** Motivo da nova versão (vazio na primeira). */
  reason: string | null
  discard_reason: string | null
  created_at: string
}

/** Resposta de `report_months`: as famílias CADM do mês, com a última versão que quem pede pode ver. */
export interface ReportMonths {
  ref_date: string
  /** Todos os textos legais do relatório têm versão aprovada (sem eles, não sai rascunho). */
  texts_ready: boolean
  families: {
    household_id: string
    code: string
    name: string
    status: 'ativa' | 'encerrada'
    manager_name: string | null
    month_status: MonthStatus | null
    latest: ReportSummary | null
  }[]
}

/** Cenário da conversa do mês gravado no rascunho (a função `report` roda e grava). */
export interface StoredReportScenario {
  id: string
  name: string
  params: ReportScenarioParams
  probability: number
  requiredReturn: number | null
  requiredReturnStatus: RequiredReturnStatus
  inputsHash: string
  seed: number
  paths: number
  computeMs: number
}

/** Resposta de `report_detail`. Sem permissão para valores, vêm só a situação e as versões. */
export interface ReportDetail extends ReportSummary {
  household: { id: string; code: string; name: string; manager_name: string | null }
  month_status: MonthStatus | null
  amounts_visible: boolean
  comment: string | null
  scenarios: StoredReportScenario[] | null
  /** Observação de quem devolveu para ajuste. */
  review_note: string | null
  snapshot: ReportSnapshot | null
  /** O rascunho usa as versões aprovadas hoje dos textos legais. */
  texts_current: boolean
  /** A rodada do rascunho ainda é a publicada do mês. */
  run_current: boolean
  versions: ReportSummary[]
}

/** Respostas da função `report`, uma por ação. */
export interface ReportDraftResult {
  id: string
  version: number
}
export interface ReportScenarioResult {
  cenario: StoredReportScenario
}
export interface ReportPdfResult {
  caminho: string
  sha256: string
  bytes: number
}
export interface ReportDownload {
  /** Caminho a partir de /storage/v1, com o token do link assinado. */
  caminho: string
  arquivo: string
  validade_s: number
}

/** Linha de `legal_texts_overview`: a versão aprovada e o rascunho de cada texto legal. */
export interface LegalTextRow {
  key: string
  in_report: boolean
  approved: { id: string; version: number; body: string; approved_at: string; approved_by_email: string | null } | null
  draft: { id: string; version: number; body: string; created_at: string; created_by_email: string | null } | null
}

/** Resposta de `audit_trail`. */
export interface AuditTrail {
  rows: {
    id: number
    at: string
    actor_email: string | null
    action: string
    target_table: string | null
    target_id: string | null
    household_code: string | null
    household_name: string | null
    details: Record<string, unknown> | null
  }[]
  /** Ações registradas no período, para o filtro. */
  actions: string[]
}
