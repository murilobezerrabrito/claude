// npm run db:market-cases: gera supabase/tests/14_paridade_mercado.test.sql a partir de SERIES (src/market/sgs.ts).
// A leitura do SGS (parseSgs) e a gravação do banco (record_market_sync) conferem as mesmas regras em separado: as
// mesmas séries, a faixa plausível de cada uma (exclusiva) e a série mensal sempre no dia 1. Os mesmos casos rodam no
// Vitest (src/market/__tests__/paridade.test.ts), que também confere que o arquivo gerado está em dia.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SERIES, SERIES_CODES, type SeriesCode } from '../src/market/sgs.ts'

export interface MarketCase {
  name: string
  code: SeriesCode
  date: string
  /** Valor com 6 casas, como texto (o SGS manda texto; o banco recebe número). */
  value: string
  ok: boolean
}

const root = new URL('..', import.meta.url)
export const OUTPUT = 'supabase/tests/14_paridade_mercado.test.sql'
/** Passo para os valores logo dentro da faixa. */
const STEP = 1e-6

export function marketCases(): MarketCase[] {
  const cases: MarketCase[] = []
  for (const code of SERIES_CODES) {
    const info = SERIES[code]
    const date = info.frequency === 'mensal' ? '2026-09-01' : '2026-09-15'
    const at = (name: string, v: number, ok: boolean) => cases.push({ name: `${info.name}: ${name}`, code, date, value: v.toFixed(6), ok })
    at(`${info.min} (limite de baixo) é recusado`, info.min, false)
    at('logo acima do limite de baixo é aceito', info.min + STEP, true)
    at(`${info.max} (limite de cima) é recusado`, info.max, false)
    at('logo abaixo do limite de cima é aceito', info.max - STEP, true)
    const middle = ((info.min + info.max) / 2).toFixed(6)
    if (info.frequency === 'mensal') cases.push({ name: `${info.name}: fora do dia 1 é recusado`, code, date: '2026-09-15', value: middle, ok: false })
    else cases.push({ name: `${info.name}: qualquer dia é aceito`, code, date: '2026-09-16', value: middle, ok: true })
  }
  return cases
}

const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`
const sqlArray = (items: readonly string[]) => `array[${items.map(sqlText).join(', ')}]::text[]`

export function buildMarketCasesSql(cases: readonly MarketCase[] = marketCases()): string {
  const lines = [
    '-- Gerado por `npm run db:market-cases` (scripts/marketCases.ts) a partir de SERIES (src/market/sgs.ts). Não edite à mão.',
    '-- Paridade entre a gravação do banco (record_market_sync) e a leitura do SGS (parseSgs): as mesmas séries, a mesma',
    '-- faixa plausível (exclusiva) e a série mensal no dia 1. Os mesmos casos rodam no Vitest (src/market/__tests__/paridade.test.ts).',
    'begin;',
    `select plan(${cases.length + 1});`,
    '',
    '-- Só a função do servidor grava (com a chave do servidor).',
    'set local role service_role;',
    `select is((select array_agg(k order by k) from jsonb_object_keys(public.market_last_dates()) k), ${sqlArray([...SERIES_CODES].sort())},`,
    "  'as mesmas séries de src/market');",
  ]
  for (const c of cases) {
    const call = `select public.record_market_sync(${sqlText(c.code)}, '${c.date}', '${c.date}', '[{"date": "${c.date}", "value": ${c.value}}]', null, null)`
    lines.push(c.ok ? `select lives_ok($$ ${call} $$, ${sqlText(c.name)});` : `select throws_ok($$ ${call} $$, '22023', null, ${sqlText(c.name)});`)
  }
  lines.push('', 'select * from finish();', 'rollback;', '')
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL(OUTPUT, root), buildMarketCasesSql())
  console.log(`${OUTPUT} gerado com ${marketCases().length} casos.`)
}
