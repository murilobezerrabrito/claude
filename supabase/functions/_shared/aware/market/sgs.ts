// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Séries do Banco Central no SGS (SPEC, "Dados de mercado"): CDI diário (série 12), IPCA mensal (433) e dólar de
// venda (1), gravadas em `market_series` como o Banco Central publica (D-051): CDI em % ao dia, IPCA em % no mês (no
// dia 1 do mês) e dólar em reais. Respeita as armadilhas do SPEC: janelas de no máximo 3 anos (o SGS recusa mais de
// 10 anos nas séries diárias), `dataFinal` sempre preenchida e o atalho `/ultimos/N` com no máximo 20 registros.

import { addDays, isoDate } from './calendar.ts'

export type SeriesCode = 'cdi' | 'ipca' | 'dolar'

export interface SeriesInfo {
  code: SeriesCode
  /** Código da série no SGS. */
  sgs: number
  name: string
  frequency: 'diaria' | 'mensal'
  unit: string
  /** Faixa plausível do valor (exclusiva): fora dela, a resposta é recusada como erro. */
  min: number
  max: number
}

export const SERIES: Record<SeriesCode, SeriesInfo> = {
  cdi: { code: 'cdi', sgs: 12, name: 'CDI', frequency: 'diaria', unit: '% ao dia', min: 0, max: 1 },
  ipca: { code: 'ipca', sgs: 433, name: 'IPCA', frequency: 'mensal', unit: '% no mês', min: -5, max: 10 },
  dolar: { code: 'dolar', sgs: 1, name: 'Dólar de venda', frequency: 'diaria', unit: 'R$ por US$', min: 0.5, max: 50 },
}

export const SERIES_CODES = Object.keys(SERIES) as SeriesCode[]

export const SGS_BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs'

/** Janela máxima de cada consulta (o SGS recusa mais de 10 anos nas séries diárias; 3 anos dá folga). */
export const MAX_WINDOW_YEARS = 3
/** O atalho `/ultimos/N` aceita no máximo 20 registros. */
export const MAX_LAST = 20
/** A janela mais antiga de uma busca tem pelo menos este número de dias, para nunca cair só em fim de semana e feriado. */
export const MIN_WINDOW_DAYS = 31
/** Primeira data buscada quando a série ainda não tem nenhum dado gravado. */
export const INITIAL_START = '2024-01-01'

export class SgsError extends Error {
  readonly code: string
  readonly status?: number
  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = 'SgsError'
    this.code = code
    this.status = status
  }
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const BR = /^(\d{2})\/(\d{2})\/(\d{4})$/

function validIso(date: string): boolean {
  const m = ISO.exec(date)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return addDays(isoDate(y, mo, 1), d - 1) === date
}

function requireIso(date: string, what: string): void {
  if (!validIso(date)) throw new SgsError('data_invalida', `Data inválida em ${what}: use AAAA-MM-DD.`)
}

/** "2026-10-30" → "30/10/2026", o formato do SGS. */
export const toSgsDate = (date: string) => date.split('-').reverse().join('/')

/** "30/10/2026" → "2026-10-30"; nulo se não for uma data válida. */
export function fromSgsDate(text: string): string | null {
  const m = BR.exec(text)
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  return validIso(iso) ? iso : null
}

/** Mesma data, `years` anos antes (29 de fevereiro vira 28). */
function yearsBefore(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const target = isoDate(y - years, m, d)
  return validIso(target) ? target : isoDate(y - years, m, d - 1)
}

/** Consulta de uma janela, sempre com `dataInicial` e `dataFinal`, de no máximo 3 anos. */
export function sgsUrl(code: SeriesCode, from: string, to: string, base = SGS_BASE): string {
  requireIso(from, 'dataInicial')
  requireIso(to, 'dataFinal')
  if (from > to) throw new SgsError('janela_invalida', 'A data inicial vem depois da final.')
  if (from < addDays(yearsBefore(to, MAX_WINDOW_YEARS), 1)) {
    throw new SgsError('janela_grande', `A janela passa de ${MAX_WINDOW_YEARS} anos: divida em janelas menores.`)
  }
  return `${base}.${SERIES[code].sgs}/dados?formato=json&dataInicial=${toSgsDate(from)}&dataFinal=${toSgsDate(to)}`
}

/** Atalho dos últimos N registros (no máximo 20), para testar a conexão. */
export function sgsLastUrl(code: SeriesCode, n: number, base = SGS_BASE): string {
  if (!Number.isInteger(n) || n < 1 || n > MAX_LAST) {
    throw new SgsError('ultimos_invalido', `O atalho /ultimos aceita de 1 a ${MAX_LAST} registros.`)
  }
  return `${base}.${SERIES[code].sgs}/dados/ultimos/${n}?formato=json`
}

export interface Window {
  from: string
  to: string
}

/**
 * Janelas de no máximo 3 anos que cobrem [from, to], contadas de trás para frente (da mais recente à mais antiga).
 * Assim, só a mais antiga pode ser curta, e ela começa em `from`, que é o último dado já gravado (ou a data inicial
 * fixa): a resposta nunca vem vazia por ter caído só em fim de semana e feriado. Se ainda ficar curta, ela recua até
 * ter 31 dias (busca a mais, que a gravação idempotente absorve).
 */
export function sgsWindows(from: string, to: string): Window[] {
  requireIso(from, 'início da busca')
  requireIso(to, 'fim da busca')
  if (from > to) return []
  const windows: Window[] = []
  let end = to
  for (;;) {
    const start = addDays(yearsBefore(end, MAX_WINDOW_YEARS), 1)
    if (start <= from) {
      const minStart = addDays(end, -(MIN_WINDOW_DAYS - 1))
      windows.push({ from: from < minStart ? from : minStart, to: end })
      return windows
    }
    windows.push({ from: start, to: end })
    end = addDays(start, -1)
  }
}

export interface SeriesRow {
  date: string
  value: number
}

/**
 * Lê a resposta do SGS (`[{"data": "dd/MM/aaaa", "valor": "0.055131"}]`) e confere cada linha: data válida, nada
 * depois de `to`, IPCA sempre no dia 1, valor com ponto decimal dentro da faixa plausível da série e nenhuma data
 * repetida com outro valor. Devolve as linhas em ordem de data. Qualquer problema recusa a resposta inteira.
 */
export function parseSgs(body: unknown, code: SeriesCode, to: string): SeriesRow[] {
  const info = SERIES[code]
  if (!Array.isArray(body)) throw new SgsError('resposta_invalida', `O SGS devolveu outra coisa que não uma lista de dados (${info.name}).`)
  const byDate = new Map<string, number>()
  body.forEach((item, i) => {
    const where = `${info.name}, item ${i + 1}`
    if (item === null || typeof item !== 'object') throw new SgsError('resposta_invalida', `Item sem data e valor (${where}).`)
    const { data, valor } = item as { data?: unknown; valor?: unknown }
    const date = typeof data === 'string' ? fromSgsDate(data) : null
    if (!date) throw new SgsError('data_invalida', `Data inválida no SGS: ${String(data)} (${where}).`)
    if (date > to) throw new SgsError('data_futura', `O SGS devolveu ${String(data)}, depois do fim da busca (${where}).`)
    if (info.frequency === 'mensal' && !date.endsWith('-01')) throw new SgsError('data_invalida', `Série mensal com data fora do dia 1: ${String(data)} (${where}).`)
    const text = typeof valor === 'number' ? String(valor) : typeof valor === 'string' ? valor.trim() : ''
    if (!/^-?\d+(\.\d+)?$/.test(text)) throw new SgsError('valor_invalido', `Valor inválido no SGS: ${String(valor)} (${where}).`)
    const value = Number(text)
    if (!(value > info.min && value < info.max)) {
      throw new SgsError('valor_implausivel', `Valor fora da faixa esperada para ${info.name} (${info.unit}): ${text} em ${String(data)}.`)
    }
    const seen = byDate.get(date)
    if (seen !== undefined && seen !== value) throw new SgsError('data_repetida', `O SGS devolveu ${String(data)} duas vezes, com valores diferentes (${info.name}).`)
    byDate.set(date, value)
  })
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }))
}
