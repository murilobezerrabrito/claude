// Formatação e rótulos do console (SPEC, "Formatação de números": valores exatos em tabelas detalhadas).

import type { MonthStatus } from '../lib/apiTypes.ts'
import { formatMoneyExact } from '../lib/format.ts'
import { lastDayOfMonth } from '../report/inflation.ts'

/** Valor em reais, ou "—" quando não há (ou quando o banco escondeu o valor). */
export const money = (v: number | null | undefined) => (typeof v === 'number' ? formatMoneyExact(v) : '—')

/** Valores por moeda: reais exatos e dólares com o código. */
export function byCurrency(m: Record<string, number> | null | undefined): string {
  if (!m || Object.keys(m).length === 0) return '—'
  return Object.entries(m)
    .map(([cur, v]) => (cur === 'BRL' ? money(v) : `${cur} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`))
    .join(' + ')
}

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`

/** Data de referência (último dia do mês) a partir de "AAAA-MM". */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(lastDayOfMonth(y, m)).padStart(2, '0')}`
}

/** Mês anterior ao de hoje (o mês que a gestão costuma fechar), em "AAAA-MM". */
export function previousMonth(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const STATUS_LABELS: Record<MonthStatus | 'pendente', string> = {
  pendente: 'Sem importação',
  importado: 'Importado',
  conferido: 'Conferido',
  bloqueado: 'Bloqueado',
  rodado: 'Rodado',
  fechado: 'Fechado',
}

export const STATUS_TONES: Record<MonthStatus | 'pendente', 'neutral' | 'green' | 'red' | 'blue' | 'primary' | 'yellow'> = {
  pendente: 'neutral',
  importado: 'yellow',
  conferido: 'green',
  bloqueado: 'red',
  rodado: 'blue',
  fechado: 'primary',
}

export const CHANNEL_LABELS = { cadm: 'CADM', ai: 'AI' } as const
