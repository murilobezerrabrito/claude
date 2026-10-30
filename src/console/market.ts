// Séries do Banco Central no console: valor formatado como o Banco Central publica, a origem e o atraso de cada série
// (o mesmo cálculo de src/market, com "hoje" no horário de Brasília). Funções puras, testadas em __tests__/market.test.ts.

import type { MarketStatusRow } from '../lib/apiTypes.ts'
import { monthName } from '../lib/format.ts'
import { SERIES, seriesLag, type SeriesLag } from '../market/index.ts'

const number = (v: number, min: number, max: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })

/** "0,055131% ao dia", "0,48% (setembro de 2026)", "R$ 5,0400". */
export function seriesValueText(code: MarketStatusRow['code'], value: number, date: string): string {
  if (code === 'cdi') return `${number(value, 2, 6)}% ao dia`
  if (code === 'ipca') return `${number(value, 2, 2)}% (${monthName(date.slice(0, 7))} de ${date.slice(0, 4)})`
  return `R$ ${number(value, 4, 4)}`
}

export const SOURCE_LABELS: Record<string, string> = {
  bcb_sgs: 'Banco Central',
  ficticio: 'Fictício (exemplo)',
  teste: 'Teste',
}

export interface SeriesView {
  row: MarketStatusRow
  name: string
  lag: SeriesLag
}

export function seriesViews(rows: readonly MarketStatusRow[], today: string): SeriesView[] {
  return rows.map((row) => ({ row, name: SERIES[row.code].name, lag: seriesLag(row.code, row.last?.date ?? null, today) }))
}

/** As séries atrasadas, para o aviso do console. */
export const staleSeries = (rows: readonly MarketStatusRow[], today: string) => seriesViews(rows, today).filter((v) => v.lag.stale)
