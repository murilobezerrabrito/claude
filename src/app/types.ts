// O que o app do cliente AI recebe de um mês fechado (SPEC, "Canal 2: app dos clientes AI"): os números congelados da
// rodada oficial (o mesmo formato do relatório, no canal AI), as entradas do mês para o "E se?" no aparelho, o
// histórico e os textos legais aprovados. Na etapa 3a vem do exemplo da Família Andrade; na 3b, do banco.

import type { IpcaSeries } from '../report/inflation.ts'
import type { MonthPackage } from '../report/officialRun.ts'
import type { ReportSnapshot } from '../report/snapshot.ts'
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
  legal: { rodape_app: { version: number; body: string }; aviso_completo: { version: number; body: string } }
}
