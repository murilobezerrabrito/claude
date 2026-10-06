// Do banco para o relatório: posições já com classe e em reais, PL oficial e aportes e resgates viram o fechamento
// do mês no formato de src/report (SPEC, "Importação mensal das posições": patrimônio por classe = soma de
// valor_liquido por class_code).

import type { ExternalFlow, MonthClosing } from '../report/types.ts'
import type { FlowKind } from './types.ts'
import { sumMoney } from './values.ts'

/** Posição conferida: classe do ativo e valor líquido em reais (convertido pelo dólar da data de referência). */
export interface ClosingPosition {
  classCode: string
  netValueBrl: number
}

/** Aporte ou resgate em reais. */
export interface ClosingFlow {
  date?: string
  kind: FlowKind
  amountBrl: number
  description?: string
}

export function closingFromRows(refDate: string, officialPl: number, positions: ClosingPosition[], flows: ClosingFlow[]): MonthClosing {
  const byClass = new Map<string, number[]>()
  for (const p of positions) {
    const list = byClass.get(p.classCode) ?? []
    list.push(p.netValueBrl)
    byClass.set(p.classCode, list)
  }
  const positionsByClass = Object.fromEntries(
    [...byClass].sort(([a], [b]) => a.localeCompare(b)).map(([code, values]) => [code, sumMoney(values)]),
  )
  const external: ExternalFlow[] = flows.map((f) => ({
    ...(f.date === undefined ? {} : { date: f.date }),
    kind: f.kind,
    amount: f.amountBrl,
    ...(f.description === undefined ? {} : { description: f.description }),
  }))
  return { refDate, positionsByClass, officialPl, flows: external }
}
