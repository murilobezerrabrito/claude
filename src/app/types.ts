// O que o app do cliente AI recebe de um mês fechado (SPEC, "Canal 2: app dos clientes AI"): os números congelados da
// rodada oficial (o mesmo formato do relatório, no canal AI), as entradas do mês para o "E se?" no aparelho, o
// histórico e os textos legais aprovados, mais os cenários salvos e as sugestões do cliente. Vem do banco
// (`client_month`, montado no aparelho por `buildClientView`) ou do exemplo da Família Andrade.

import type { MonthAttribution } from '../report/attribution.ts'
import type { IpcaSeries } from '../report/inflation.ts'
import type { MonthPackage } from '../report/officialRun.ts'
import type { CdiSeries } from '../report/performance.ts'
import type { ReportScenarioParams } from '../report/scenarios.ts'
import type { ReportMonthRun, ReportSnapshot } from '../report/snapshot.ts'
import type { RequiredReturnStatus } from '../engine/types.ts'

/** Um mês fechado no histórico: a chance, o retorno que o plano precisa e o rendimento real realizado no mês. */
export interface ClientHistoryMonth {
  month: string
  probability: number
  requiredReturn: number | null
  requiredReturnStatus: RequiredReturnStatus
  /** Rendimento acima da inflação no mês; null no primeiro mês do acompanhamento. */
  realReturn: number | null
  /** Marcadores: mudança no plano, premissas novas. */
  events: string[]
}

/** Cenário do "E se?" salvo pelo cliente (pessoal; `scenarios`). As hipóteses são conferidas de novo ao abrir. */
export interface SavedScenario {
  id: string
  name: string
  params: ReportScenarioParams
  created_at: string
}

/** Sugestão de mudança no plano e a resposta do responsável (`plan_change_requests`). */
export interface PlanRequest {
  id: string
  text: string
  status: 'pendente' | 'confirmada' | 'recusada'
  created_at: string
  reviewed_at: string | null
  review_note: string | null
}

export interface LegalText {
  version: number
  body: string
}

/** O que `client_month` devolve: o mês fechado mais recente da família de quem entrou (ref_date nulo se não há). */
export interface ClientMonthInputs {
  schema: 1
  household: { id: string; name: string; intermediary: string | null }
  ref_date: string | null
  /** Meses fechados até o mês, em sequência, com o pacote de entradas e a rodada publicada de cada um. */
  months: ReportMonthRun[]
  bridge: MonthAttribution | null
  ipca: IpcaSeries
  cdi: CdiSeries
  legal: Partial<Record<string, LegalText>>
  scenarios: SavedScenario[]
  requests: PlanRequest[]
}

export interface ClientMonthView {
  schema: 1
  /** Dados de exemplo (Família Andrade): o app mostra a marca de exemplo. */
  example: boolean
  snapshot: ReportSnapshot
  /** Entradas do mês da rodada oficial, para o "E se?" rodar no aparelho com os mesmos sorteios. */
  pkg: MonthPackage
  ipca: IpcaSeries
  history: ClientHistoryMonth[]
  /** Intermediário do cadastro (o app é material do assessor, D-071). */
  intermediary: string | null
  legal: { rodape_app: LegalText; aviso_completo: LegalText }
  scenarios: SavedScenario[]
  requests: PlanRequest[]
}
