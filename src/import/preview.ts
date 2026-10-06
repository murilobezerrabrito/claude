// Prévia da planilha antes de enviar ao banco (SPEC, "Importação mensal das posições": prévia antes de confirmar):
// totais por família e moeda, custodiantes, ativos e avisos. O banco faz a sua própria prévia, com o cadastro.

import type { Currency, FlowRow, ImportIssue, PositionRow } from './types.ts'
import { sumMoney } from './values.ts'

export interface PositionsFamilyPreview {
  clientCode: string
  rows: number
  custodians: string[]
  assets: number
  /** Soma de valor_liquido por moeda, antes da conversão para reais. */
  netByCurrency: Partial<Record<Currency, number>>
}

export interface PositionsPreview {
  refDate: string
  families: PositionsFamilyPreview[]
  /** Códigos de ativo do arquivo, em ordem. */
  assetCodes: string[]
}

function byCurrency<T>(items: T[], currency: (item: T) => Currency, value: (item: T) => number): Partial<Record<Currency, number>> {
  const groups = new Map<Currency, number[]>()
  for (const item of items) {
    const list = groups.get(currency(item)) ?? []
    list.push(value(item))
    groups.set(currency(item), list)
  }
  return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([cur, values]) => [cur, sumMoney(values)]))
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const list = groups.get(key(item)) ?? []
    list.push(item)
    groups.set(key(item), list)
  }
  return new Map([...groups].sort(([a], [b]) => a.localeCompare(b)))
}

export function previewPositions(refDate: string, rows: PositionRow[]): PositionsPreview {
  const families = [...groupBy(rows, (r) => r.clientCode)].map(([clientCode, list]) => ({
    clientCode,
    rows: list.length,
    custodians: [...new Set(list.map((r) => r.custodian))].sort(),
    assets: new Set(list.map((r) => r.assetCode)).size,
    netByCurrency: byCurrency(list, (r) => r.currency, (r) => r.netValue),
  }))
  return { refDate, families, assetCodes: [...new Set(rows.map((r) => r.assetCode))].sort() }
}

export interface FlowsFamilyPreview {
  clientCode: string
  rows: number
  contributions: Partial<Record<Currency, number>>
  withdrawals: Partial<Record<Currency, number>>
  /** Movimentos sem data: contados no meio do mês ("datas aproximadas"). */
  approximateDates: number
}

export interface FlowsPreview {
  refDate: string
  families: FlowsFamilyPreview[]
  warnings: ImportIssue[]
}

/**
 * Aporte e resgate do mesmo valor, na mesma data e moeda, na mesma família: parece transferência entre contas, que
 * não é aporte nem resgate (SPEC, "Aportes e resgates"). Só avisa; quem importa confere.
 */
function transferWarnings(list: FlowRow[]): ImportIssue[] {
  const warnings: ImportIssue[] = []
  const dated = list.filter((f) => f.date !== undefined)
  for (const [, same] of groupBy(dated, (f) => `${f.date}|${f.currency}|${f.amount.toFixed(2)}`)) {
    const contribution = same.find((f) => f.kind === 'aporte')
    const withdrawal = same.find((f) => f.kind === 'resgate')
    if (contribution && withdrawal) {
      warnings.push({
        line: contribution.line,
        message: `${contribution.clientCode}: aporte (linha ${contribution.line}) e resgate (linha ${withdrawal.line}) do mesmo valor em ${contribution.date} parecem transferência entre contas da família, que não conta como aporte nem resgate. Confira antes de confirmar.`,
      })
    }
  }
  return warnings
}

export function previewFlows(refDate: string, rows: FlowRow[]): FlowsPreview {
  const warnings: ImportIssue[] = []
  const families = [...groupBy(rows, (r) => r.clientCode)].map(([clientCode, list]) => {
    warnings.push(...transferWarnings(list))
    return {
      clientCode,
      rows: list.length,
      contributions: byCurrency(list.filter((f) => f.kind === 'aporte'), (f) => f.currency, (f) => f.amount),
      withdrawals: byCurrency(list.filter((f) => f.kind === 'resgate'), (f) => f.currency, (f) => f.amount),
      approximateDates: list.filter((f) => f.date === undefined).length,
    }
  })
  return { refDate, families, warnings }
}
