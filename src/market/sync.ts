// Busca das séries do Banco Central (SPEC, "Dados de mercado", rotinas): para cada série, do último dado gravado até
// hoje, em janelas de até 3 anos; lê e confere cada resposta e grava tudo ou nada (se uma janela falha, a série não
// grava nada e a próxima busca tenta de novo desde o mesmo ponto, sem deixar buraco). Uma série com erro não para as
// outras. A rede e a gravação vêm de fora (`deps`): a função do servidor usa o SGS e o banco; os testes usam respostas
// gravadas.

import { SERIES, SGS_BASE, INITIAL_START, SgsError, parseSgs, sgsUrl, sgsWindows, type SeriesCode, type SeriesRow, type Window } from './sgs.ts'
import { seriesLag, type SeriesLag } from './staleness.ts'

export interface FetchResult {
  status: number
  text: string
}

export interface RecordInput {
  code: SeriesCode
  from: string
  to: string
  rows: SeriesRow[]
  /** Mensagem do erro da busca (nada é gravado da série), ou nulo. */
  error: string | null
}

export interface RecordResult {
  inserted: number
  updated: number
  /** Último dado da série depois da gravação. */
  lastDate: string | null
}

export interface SyncDeps {
  /** Busca a URL e devolve o status HTTP e o corpo; o tempo-limite fica com quem chama. */
  fetchText: (url: string) => Promise<FetchResult>
  /** Grava as linhas (de forma idempotente) e o registro da busca, inclusive quando houve erro. */
  record: (input: RecordInput) => Promise<RecordResult>
}

export interface SeriesSyncResult {
  code: SeriesCode
  from: string
  to: string
  windows: number
  received: number
  inserted: number
  updated: number
  lastDate: string | null
  error: string | null
  lag: SeriesLag
}

/** Primeira data da busca: o último dado já gravado (que existe no SGS) ou a data inicial fixa. */
export function syncStart(lastDate: string | null): string {
  return lastDate ?? INITIAL_START
}

/** Corpo da resposta resumido para a mensagem de erro: sem tags HTML, espaços juntos, no máximo 160 caracteres. */
export function snippet(text: string): string {
  const flat = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat || '(sem corpo)'
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function fetchWindow(code: SeriesCode, w: Window, deps: SyncDeps, base: string): Promise<SeriesRow[]> {
  const name = SERIES[code].name
  let res: FetchResult
  try {
    res = await deps.fetchText(sgsUrl(code, w.from, w.to, base))
  } catch (e) {
    throw new SgsError('rede', `Não foi possível falar com o SGS (${name}): ${messageOf(e)}`)
  }
  if (res.status !== 200) throw new SgsError('http', `O SGS respondeu ${res.status} para ${name}: ${snippet(res.text)}`, res.status)
  let body: unknown
  try {
    body = JSON.parse(res.text)
  } catch {
    throw new SgsError('resposta_invalida', `O SGS devolveu algo que não é JSON (${name}): ${snippet(res.text)}`)
  }
  return parseSgs(body, code, w.to)
}

/** Busca uma série do último dado gravado até hoje e grava. Nunca lança: o erro volta no resultado. */
export async function syncSeries(code: SeriesCode, lastDate: string | null, today: string, deps: SyncDeps, base = SGS_BASE): Promise<SeriesSyncResult> {
  const from = syncStart(lastDate)
  const windows = sgsWindows(from, today)
  let rows: SeriesRow[] = []
  let error: string | null = null
  try {
    for (const w of windows) rows.push(...(await fetchWindow(code, w, deps, base)))
  } catch (e) {
    error = messageOf(e)
    rows = []
  }
  let stored: RecordResult = { inserted: 0, updated: 0, lastDate }
  try {
    stored = await deps.record({ code, from, to: today, rows, error })
  } catch (e) {
    error = `${error ? `${error} ` : ''}Não foi possível gravar a busca: ${messageOf(e)}`
  }
  return {
    code,
    from,
    to: today,
    windows: windows.length,
    received: rows.length,
    inserted: stored.inserted,
    updated: stored.updated,
    lastDate: stored.lastDate,
    error,
    lag: seriesLag(code, stored.lastDate, today),
  }
}

/** Busca as séries pedidas, uma de cada vez. */
export async function syncAll(
  codes: readonly SeriesCode[],
  lastDates: Partial<Record<SeriesCode, string | null>>,
  today: string,
  deps: SyncDeps,
  base = SGS_BASE,
): Promise<SeriesSyncResult[]> {
  const out: SeriesSyncResult[] = []
  for (const code of codes) out.push(await syncSeries(code, lastDates[code] ?? null, today, deps, base))
  return out
}
