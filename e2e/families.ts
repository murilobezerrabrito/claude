// Famílias e mês só do teste de ponta a ponta, para não depender do que `npm run db:import -- exemplo` deixou no banco
// (setembro fica fechado depois do exemplo). A cada execução: duas famílias fictícias novas (E2E-<marca>-A, na CADM,
// com o plano da Andrade; E2E-<marca>-B, na AI, com o da Barbosa), mês-base julho/2026, planilhas geradas a partir
// dos exemplos de setembro (códigos de família e de ativo trocados, data 31/07/2026) e o dólar e o IPCA fictícios de
// julho. As famílias de execuções anteriores ficam encerradas. Só o Supabase LOCAL (localStack recusa outro).

import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { call, localStack } from '../scripts/localSupabase.ts'

export const E2E_MONTH = '2026-07'
export const E2E_REF_DATE = '2026-07-31'
const SOURCE_DATE = '2026-09-30'

export interface E2eData {
  cadm: string
  ai: string
  /** Ativo novo (com a marca) → classe, para o comitê mapear. */
  classes: Record<string, string>
  positionsFile: string
  plFile: string
  positionsRows: number
}

interface HouseholdRow {
  id: string
  code: string
  channel: 'cadm' | 'ai'
  profile_id: string
  weights_source: string
  suitability: string | null
  fee_rate: number
  horizon_age: number
  seed: number
}

const example = (name: string) => readFileSync(`src/data/importacao/${name}`, 'utf8')

export async function e2eData(): Promise<E2eData> {
  const local = localStack()
  const admin = { admin: true }
  const tag = Date.now().toString(36).toUpperCase()
  const codes = { AND001: `E2E-${tag}-A`, BAR001: `E2E-${tag}-B` } as Record<string, string>

  await call(local, '/rest/v1/households?code=like.E2E-*&status=eq.ativa', { ...admin, method: 'PATCH', body: { status: 'encerrada' } })

  for (const [source, code] of Object.entries(codes)) {
    const [h] = (await call(local, `/rest/v1/households?code=eq.${source}&select=*`, admin)) as HouseholdRow[]
    const [plan] = (await call(local, `/rest/v1/plan_versions?household_id=eq.${h.id}&version=eq.1&select=snapshot`, admin)) as { snapshot: unknown }[]
    const id = randomUUID()
    await call(local, '/rest/v1/households', {
      ...admin,
      body: {
        id, code, name: `Família ${code.slice(-1)} do teste (fictícia)`, channel: h.channel, profile_id: h.profile_id, weights_source: h.weights_source,
        suitability: h.suitability, fee_rate: h.fee_rate, horizon_age: h.horizon_age, seed: h.seed,
      },
    })
    await call(local, '/rest/v1/plan_versions', {
      ...admin,
      body: { household_id: id, version: 1, snapshot: plan.snapshot, base_month: `${E2E_MONTH}-01`, note: 'Plano do teste de ponta a ponta.' },
    })
  }

  // Dólar e IPCA fictícios de julho/2026 (31/07 é sexta-feira); o que já existir fica como está.
  await call(local, '/rest/v1/market_series', {
    ...admin,
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: [
      { series_code: 'dolar', date: E2E_REF_DATE, value: 5.0, source: 'ficticio' },
      { series_code: 'ipca', date: `${E2E_MONTH}-01`, value: 0.26, source: 'ficticio' },
    ],
  })

  // Planilhas: as linhas de setembro da Andrade e da Barbosa, com os códigos novos.
  const exampleClasses = (JSON.parse(example('exemplo-classes.json')) as { classes: Record<string, string> }).classes
  const classes: Record<string, string> = {}
  const [header, ...lines] = example('exemplo-posicoes-2026-09.csv').trim().split('\n')
  const cols = header.split(',')
  const at = (name: string) => cols.indexOf(name)
  const kept: string[] = []
  for (const line of lines) {
    const cells = line.split(',')
    const code = codes[cells[at('codigo_cliente')]]
    if (!code) continue
    const asset = `${tag}-${cells[at('codigo_ativo')]}`
    classes[asset] = exampleClasses[cells[at('codigo_ativo')]]
    cells[at('data_referencia')] = E2E_REF_DATE
    cells[at('codigo_cliente')] = code
    cells[at('codigo_ativo')] = asset
    kept.push(cells.join(','))
  }
  const plLines = example('exemplo-pl-2026-09.csv')
    .trim()
    .split('\n')
    .filter((l, i) => i === 0 || codes[l.split(',')[1]])
    .map((l, i) => (i === 0 ? l : l.replace(SOURCE_DATE, E2E_REF_DATE).replace(/,(AND001|BAR001),/, (_, c: string) => `,${codes[c]},`)))

  const dir = mkdtempSync(join(tmpdir(), 'aware-e2e-'))
  const positionsFile = join(dir, 'e2e-posicoes-2026-07.csv')
  const plFile = join(dir, 'e2e-pl-2026-07.csv')
  writeFileSync(positionsFile, [header, ...kept].join('\n') + '\n')
  writeFileSync(plFile, plLines.join('\n') + '\n')
  return { cadm: codes.AND001, ai: codes.BAR001, classes, positionsFile, plFile, positionsRows: kept.length }
}
