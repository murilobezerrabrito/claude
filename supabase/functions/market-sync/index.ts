// Busca das séries do Banco Central (SPEC, "Dados de mercado"): CDI (série 12), IPCA (433) e dólar de venda (1) no
// SGS, do último dado gravado até hoje (horário de Brasília), com a gravação idempotente no banco e o registro de cada
// busca. Quem pede: o agendamento diário (com a chave do servidor; entra na etapa da nuvem) ou alguém da gestão ou do
// comitê, com segundo fator, pelo console. Pedido: { series?: ['cdi', 'ipca', 'dolar'] } (sem a lista, as três).
// Uma série com erro não para as outras: a resposta traz, por série, o que entrou, o erro e o atraso.

import { brazilToday } from '../_shared/aware/market/calendar.ts'
import { SERIES_CODES, SGS_BASE, type SeriesCode } from '../_shared/aware/market/sgs.ts'
import { syncAll } from '../_shared/aware/market/sync.ts'
import { bearer, CORS, HttpError, reply, rpc } from '../_shared/server.ts'

/** Outro endereço do SGS só por variável do servidor (nunca pelo pedido). */
const SGS_BASE_URL = Deno.env.get('SGS_BASE_URL') ?? SGS_BASE
/** Tempo-limite de cada consulta ao SGS. */
const FETCH_TIMEOUT_MS = 20_000

function requestedSeries(body: unknown): SeriesCode[] {
  const series = (body as { series?: unknown } | null)?.series
  if (series === undefined) return SERIES_CODES
  if (!Array.isArray(series) || series.length === 0 || !series.every((s) => (SERIES_CODES as string[]).includes(s))) {
    throw new HttpError(400, `Séries desconhecidas: use ${SERIES_CODES.join(', ')}.`)
  }
  return SERIES_CODES.filter((c) => series.includes(c))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply(405, { erro: 'Use POST.' })
  try {
    const who = await rpc<{ actor: string | null; via: 'agendamento' | 'console' }>('market_sync_permission', {}, {
      user: bearer(req, 'Entre no console para buscar as séries.'),
    })
    const text = await req.text()
    let body: unknown = null
    try {
      body = text === '' ? null : JSON.parse(text)
    } catch {
      throw new HttpError(400, 'Pedido inválido: envie JSON.')
    }
    const codes = requestedSeries(body)
    const lastDates = await rpc<Record<SeriesCode, string | null>>('market_last_dates', {}, 'servidor')
    const today = brazilToday()
    const results = await syncAll(
      codes,
      lastDates,
      today,
      {
        fetchText: async (url) => {
          const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
          return { status: res.status, text: await res.text() }
        },
        record: async (input) => {
          const r = await rpc<{ inserted: number; updated: number; last_date: string | null }>(
            'record_market_sync',
            { p_series: input.code, p_from: input.from, p_to: input.to, p_rows: input.rows, p_error: input.error, p_actor: who.actor },
            'servidor',
          )
          return { inserted: r.inserted, updated: r.updated, lastDate: r.last_date }
        },
      },
      SGS_BASE_URL,
    )
    return reply(200, { hoje: today, via: who.via, series: results })
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { erro: e.message })
    console.error(e)
    return reply(500, { erro: 'Erro inesperado na busca das séries. Tente de novo; se continuar, avise a equipe técnica.' })
  }
})
