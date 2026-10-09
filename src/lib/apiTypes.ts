// Respostas das funções do banco usadas pelo console e por `npm run db:import` (supabase/migrations). Só tipos.
// Campos com valores em reais podem faltar: somem para quem não pode ver valores (D-042).

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

/** Linha de `list_households`. */
export interface HouseholdRow {
  id: string
  code: string
  name: string
  channel: Channel
  intermediary: string | null
  profile_id: string
  weights_source: 'perfil' | 'carteira_atual'
  suitability: string | null
  status: 'ativa' | 'encerrada'
}
