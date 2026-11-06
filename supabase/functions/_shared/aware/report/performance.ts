// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Rentabilidade realizada da carteira (SPEC, "Termômetro mensal" e "Aportes e resgates"): retorno do mês por Dietz
// modificado com os aportes e resgates, deflacionado pelo IPCA e encadeado no tempo, contra o benchmark pessoal
// acumulado no mesmo período e, como referência secundária, o CDI do Banco Central descontada a inflação.

import { isBusinessDay } from '../market/calendar.ts'
import { ReportInputError } from './errors.ts'
import { formatMonth, lastDayOfMonth, parseMonth, type IpcaSeries } from './inflation.ts'
import type { ExternalFlow } from './types.ts'

/** Fora desta faixa, a rentabilidade real do mês pede confirmação de quem importou. */
export const PLAUSIBLE_REAL_RANGE = { min: -0.1, max: 0.1 } as const

const DATE_RE = /^(\d{4}-(?:0[1-9]|1[0-2]))-(\d{2})$/

const daysInMonth = (monthIdx: number) => lastDayOfMonth(Math.floor(monthIdx / 12), (monthIdx % 12) + 1)

export interface MonthReturnInput {
  /** Data de referência do fechamento (AAAA-MM-DD), o último dia do mês. */
  refDate: string
  /** PL no fechamento do mês anterior. */
  startValue: number
  /** PL no fechamento do mês. */
  endValue: number
  flows: ExternalFlow[]
  ipca: IpcaSeries
}

export interface MonthReturn {
  /** Mês (AAAA-MM). */
  month: string
  nominal: number
  real: number
  /** Algum movimento sem data: contado no meio do mês. */
  approximateDates: boolean
  /** Rentabilidade real fora de −10% a +10%: pede confirmação de quem importou. */
  implausible: boolean
}

/**
 * Retorno do mês por Dietz modificado: (V1 − V0 − F) ÷ (V0 + Σ wᵢ Fᵢ), com aporte positivo e resgate negativo.
 * O movimento conta no fim do dia: wᵢ = (dias do mês − dia) ÷ dias do mês. Sem data, o meio do mês (w = 1/2) e a
 * marca "datas aproximadas". O real é (1 + nominal) ÷ (1 + IPCA do mês) − 1.
 */
export function monthReturn(input: MonthReturnInput): MonthReturn {
  const m = DATE_RE.exec(input.refDate)
  if (!m) throw new ReportInputError('data_referencia_invalida', `Data de referência inválida: ${input.refDate}.`)
  const month = m[1]
  const idx = parseMonth(month, 'data de referência')
  const days = daysInMonth(idx)
  if (Number(m[2]) !== days) {
    throw new ReportInputError('data_referencia_invalida', `A data de referência ${input.refDate} precisa ser o último dia do mês.`)
  }
  for (const [v, what] of [[input.startValue, 'PL do início do mês'], [input.endValue, 'PL do fim do mês']] as const) {
    if (!Number.isFinite(v) || v < 0) throw new ReportInputError('pl_invalido', `Valor inválido no ${what}.`)
  }
  const ipca = input.ipca[month]
  if (ipca === undefined) throw new ReportInputError('ipca_ausente', `Falta o IPCA de ${month} para a rentabilidade real do mês.`)

  let net = 0
  let weighted = 0
  let approximateDates = false
  for (const f of input.flows) {
    if (!Number.isFinite(f.amount) || f.amount <= 0) {
      throw new ReportInputError('movimento_invalido', `Valor inválido num ${f.kind} do mês: use valor positivo.`)
    }
    const signed = f.kind === 'aporte' ? f.amount : -f.amount
    let w = 0.5
    if (f.date === undefined) approximateDates = true
    else {
      const d = DATE_RE.exec(f.date)
      const day = d ? Number(d[2]) : 0
      if (!d || d[1] !== month || day < 1 || day > days) {
        throw new ReportInputError('movimento_fora_do_mes', `O ${f.kind} de ${f.date} não é do mês ${month}.`)
      }
      w = (days - day) / days
    }
    net += signed
    weighted += w * signed
  }
  const base = input.startValue + weighted
  if (!(base > 0)) {
    throw new ReportInputError('dietz_sem_base', `Não dá para calcular a rentabilidade de ${month}: o patrimônio médio do mês não é positivo.`)
  }
  const nominal = (input.endValue - input.startValue - net) / base
  const real = (1 + nominal) / (1 + ipca) - 1
  return { month, nominal, real, approximateDates, implausible: real < PLAUSIBLE_REAL_RANGE.min || real > PLAUSIBLE_REAL_RANGE.max }
}

/** CDI diário do Banco Central (série 12), em % ao dia por data (AAAA-MM-DD), como em `market_series`. */
export type CdiSeries = Record<string, number>

/**
 * CDI do mês descontada a inflação (D-070): o acumulado de todos os dias úteis do mês, Π(1 + taxa ÷ 100) − 1,
 * deflacionado pelo IPCA do mês. Null quando falta algum dia útil do mês na série (feriados nacionais da ANBIMA) ou o
 * IPCA do mês: a referência secundária só aparece completa.
 */
export function cdiMonthReal(cdi: CdiSeries, month: string, ipca: IpcaSeries): number | null {
  const idx = parseMonth(month, 'mês do CDI')
  const days = daysInMonth(idx)
  let factor = 1
  for (let day = 1; day <= days; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`
    if (!isBusinessDay(date)) continue
    const rate = cdi[date]
    if (rate === undefined) return null
    factor *= 1 + rate / 100
  }
  const inflation = ipca[month]
  return inflation === undefined ? null : factor / (1 + inflation) - 1
}

/** Um mês do histórico: a rentabilidade real e o benchmark pessoal publicado no fechamento anterior (início do mês). */
export interface PerformanceMonth {
  /** Mês (AAAA-MM). */
  month: string
  real: number
  /** r* anual publicado no fechamento anterior; null quando não havia número (folga total ou plano inviável). */
  benchmarkAnnual: number | null
  /** Algum movimento do mês entrou sem data (meio do mês). */
  approximateDates?: boolean
  /** CDI do mês descontada a inflação; null (ou ausente) quando a série não cobre o mês. */
  cdiReal?: number | null
}

export interface PeriodReturn {
  /** Rentabilidade real acumulada no período. */
  real: number
  /** Benchmark pessoal acumulado no mesmo período; null se faltou o r* em algum mês. */
  benchmark: number | null
  /** CDI acumulado no mesmo período, descontada a inflação; null se a série não cobre algum mês do período. */
  cdi: number | null
  months: number
  /** Algum mês do período usou datas aproximadas: a marca acompanha o número. */
  approximateDates: boolean
}

export interface PerformanceSummary {
  /** Mês do primeiro fechamento acompanhado (o anterior ao primeiro retorno). */
  trackingSince: string
  month: PeriodReturn
  /** Do começo do ano até o mês; null se o acompanhamento não cobre o ano todo. */
  yearToDate: PeriodReturn | null
  /** Últimos 12 meses; null se o acompanhamento tem menos de 12 meses de retorno. */
  twelveMonths: PeriodReturn | null
  sinceStart: PeriodReturn
}

function accumulate(months: PerformanceMonth[]): PeriodReturn {
  let real = 1
  let bench: number | null = 1
  let cdi: number | null = 1
  let approximateDates = false
  for (const m of months) {
    real *= 1 + m.real
    bench = bench === null || m.benchmarkAnnual === null ? null : bench * (1 + m.benchmarkAnnual) ** (1 / 12)
    cdi = cdi === null || m.cdiReal === undefined || m.cdiReal === null ? null : cdi * (1 + m.cdiReal)
    if (m.approximateDates) approximateDates = true
  }
  return { real: real - 1, benchmark: bench === null ? null : bench - 1, cdi: cdi === null ? null : cdi - 1, months: months.length, approximateDates }
}

/**
 * Rentabilidade real no mês, no ano, em 12 meses e desde o início, até `refMonth`, contra o benchmark pessoal
 * acumulado no mesmo período: em cada mês, (1 + r*)^(1/12) − 1 com o r* publicado no fechamento anterior.
 * O histórico precisa ser contínuo: falta de um mês é erro.
 */
export function performanceSummary(history: PerformanceMonth[], refMonth: string): PerformanceSummary {
  const ref = parseMonth(refMonth, 'mês de referência')
  const sorted = history
    .map((h) => ({ h, idx: parseMonth(h.month, 'histórico de rentabilidade') }))
    .filter((x) => x.idx <= ref)
    .sort((a, b) => a.idx - b.idx)
  if (sorted.length === 0 || sorted[sorted.length - 1].idx !== ref) {
    throw new ReportInputError('sem_rentabilidade', `Falta a rentabilidade de ${refMonth}.`)
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].idx !== sorted[i - 1].idx + 1) {
      throw new ReportInputError('historico_com_falha', `Falta a rentabilidade de ${formatMonth(sorted[i - 1].idx + 1)} no histórico.`)
    }
  }
  const first = sorted[0].idx
  const months = sorted.map((x) => x.h)
  const last = (n: number) => months.slice(months.length - n)
  const january = ref - (ref % 12)
  return {
    trackingSince: formatMonth(first - 1),
    month: accumulate(last(1)),
    yearToDate: first <= january ? accumulate(last(ref - january + 1)) : null,
    twelveMonths: months.length >= 12 ? accumulate(last(12)) : null,
    sinceStart: accumulate(months),
  }
}
