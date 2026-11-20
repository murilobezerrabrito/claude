import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { andradeReportArgs, EXAMPLE_SNAPSHOT_PATH } from '../../../scripts/reportExample.ts'
import choques from '../../data/choques.json'
import { planVersionFor } from '../monthInputs.ts'
import type { MonthPackage } from '../officialRun.ts'
import {
  MAX_SCENARIO_CHANGES,
  runScenario,
  scenarioIssues,
  scenarioName,
  SHOCK_PRESETS,
  toEngineScenario,
  type ReportScenarioParams,
} from '../scenarios.ts'
import type { ReportSnapshot } from '../snapshot.ts'
import { RECOMMENDATION } from './helpers.ts'

const frozen = JSON.parse(readFileSync(new URL(`../../../${EXAMPLE_SNAPSHOT_PATH}`, import.meta.url), 'utf8')) as ReportSnapshot
// Andrade, out/2026: titular com 52 anos, aposentadoria aos 62, gasto essencial de R$ 55.220 e estilo de vida de R$ 35 mil
// por mês, pró-labore de R$ 100.400, patrimônio de R$ 13,26 mi, casa de praia e sala comercial vendáveis de 2027 a 2071.
const ctx = frozen.scenarioContext
const plain = (s: string) => s.replace(/\u00a0/g, ' ')
const paths = (p: unknown) => scenarioIssues(p, ctx).map((i) => i.path)

describe('cenários da conversa do mês', () => {
  it('os cenários prontos são os de src/data/choques.json', () => {
    expect(SHOCK_PRESETS).toEqual(choques.presets)
  })

  it('cenários dentro das faixas do SPEC passam', () => {
    const ok: ReportScenarioParams[] = [
      { retirementAge: 59 },
      { spendingMultiplier: 1.1 },
      { shockPresetId: 'crise-2008' },
      { essentialMonthly: 60_000, lifestyleMonthly: 0 },
      { incomes: [{ name: 'Pró-labore do Ricardo', monthly: 0 }] },
      { extraFlows: [{ kind: 'resgate', amount: 500_000, year: 2027, month: 3 }] },
      { propertySales: [{ propertyId: 'casa-praia', year: 2030 }], horizonAge: 100 },
      { firstYearShock: -0.2, rulesEnabled: false },
    ]
    for (const p of ok) expect(scenarioIssues(p, ctx)).toEqual([])
  })

  it('fora das faixas, dos passos ou do plano, o problema vem no campo', () => {
    expect(paths({})).toEqual([''])
    expect(paths({ profileId: 'arrojado' })).toEqual(['profileId', ''])
    expect(paths({ weights: { ACOES: 1 } })).toContain('weights')
    expect(paths({ retirementAge: 51 })).toEqual(['retirementAge'])
    expect(paths({ retirementAge: 76 })).toEqual(['retirementAge'])
    expect(paths({ retirementAge: 62 })).toEqual(['retirementAge'])
    expect(paths({ essentialMonthly: 10_000 })).toEqual(['essentialMonthly'])
    expect(paths({ essentialMonthly: 60_500 })).toEqual(['essentialMonthly'])
    expect(paths({ lifestyleMonthly: 106_000 })).toEqual(['lifestyleMonthly'])
    expect(paths({ spendingMultiplier: 1 })).toEqual(['spendingMultiplier'])
    expect(paths({ spendingMultiplier: 1.12 })).toEqual(['spendingMultiplier'])
    expect(paths({ incomes: [{ name: 'Aluguel', monthly: 0 }] })).toEqual(['incomes.0.name'])
    expect(paths({ incomes: [{ name: 'Pró-labore do Ricardo', monthly: 205_000 }] })).toEqual(['incomes.0.monthly'])
    expect(paths({ extraFlows: [{ kind: 'resgate', amount: 7_000_000, year: 2027, month: 3 }] })).toEqual(['extraFlows.0.amount'])
    expect(paths({ extraFlows: [{ kind: 'aporte', amount: 120_000, year: 2027, month: 3 }] })).toEqual(['extraFlows.0.amount'])
    expect(paths({ extraFlows: [{ kind: 'aporte', amount: 100_000, year: 2026, month: 10 }] })).toEqual(['extraFlows.0.month'])
    expect(paths({ propertySales: [{ propertyId: 'fazenda', year: 2030 }] })).toEqual(['propertySales.0.propertyId'])
    expect(paths({ propertySales: [{ propertyId: 'sala', year: 2026 }] })).toEqual(['propertySales.0.year'])
    expect(paths({ firstYearShock: -0.12 })).toEqual(['firstYearShock'])
    expect(paths({ firstYearShock: -0.2, shockPresetId: 'crise-2008' })).toEqual(['firstYearShock'])
    expect(paths({ shockPresetId: 'pandemia' })).toEqual(['shockPresetId'])
    expect(paths({ horizonAge: 95 })).toEqual(['horizonAge'])
    expect(paths({ rulesEnabled: true })).toEqual(['rulesEnabled'])
  })

  it(`até ${MAX_SCENARIO_CHANGES} mudanças por cenário`, () => {
    expect(paths({ retirementAge: 59, spendingMultiplier: 1.1, horizonAge: 100 })).toEqual([])
    expect(paths({ retirementAge: 59, spendingMultiplier: 1.1, horizonAge: 100, rulesEnabled: false })).toEqual([''])
    const flows = [3, 4, 5, 6].map((month) => ({ kind: 'aporte', amount: 50_000, year: 2027, month }))
    expect(paths({ extraFlows: flows })).toEqual([''])
  })

  it('aportes, resgates e vendas só até o fim do horizonte do cenário (depois dele, nada entraria no cálculo)', () => {
    // O plano da Andrade vai até ago/2071: o membro mais jovem do casal, nascido em ago/1976, chega aos 95.
    expect([ctx.lastMonth, ctx.youngestBirthMonth]).toEqual(['2071-08', '1976-08'])
    const flow = (year: number, month: number, horizonAge?: number) =>
      paths({ extraFlows: [{ kind: 'aporte', amount: 100_000, year, month }], ...(horizonAge === undefined ? {} : { horizonAge }) })
    expect(flow(2071, 8)).toEqual([])
    expect(flow(2071, 9)).toEqual(['extraFlows.0.month'])
    expect(flow(2076, 8, 100)).toEqual([])
    expect(flow(2066, 9, 90)).toEqual(['extraFlows.0.month'])
    expect(scenarioIssues({ extraFlows: [{ kind: 'aporte', amount: 100_000, year: 2071, month: 9 }] }, ctx)[0].message).toBe(
      'Escolha um mês depois de out/2026 e até ago/2071 (fim do horizonte).',
    )
    const sale = (year: number, horizonAge?: number) =>
      paths({ propertySales: [{ propertyId: 'casa-praia', year }], ...(horizonAge === undefined ? {} : { horizonAge }) })
    expect(sale(2071)).toEqual([])
    expect(sale(2072)).toEqual(['propertySales.0.year'])
    expect(sale(2070, 90)).toEqual(['propertySales.0.year'])
    expect(sale(2066, 90)).toEqual([])
    expect(sale(2076, 100)).toEqual([])
  })

  it('nome automático, em português', () => {
    const name = (p: ReportScenarioParams) => plain(scenarioName(p, ctx))
    expect(name({ retirementAge: 59 })).toBe('Aposentar 3 anos antes (aos 59)')
    expect(name({ retirementAge: 63 })).toBe('Aposentar 1 ano depois (aos 63)')
    expect(name({ spendingMultiplier: 1.1 })).toBe('Gastar 10% a mais')
    expect(name({ shockPresetId: 'crise-2008' })).toBe('Crise como a de 2008 no 1º ano')
    expect(name({ shockPresetId: 'inflacao-alta' })).toBe('Inflação alta nos 5 primeiros anos')
    expect(name({ retirementAge: 59, spendingMultiplier: 1.1 })).toBe('Aposentar 3 anos antes (aos 59) e gastar 10% a mais')
    expect(name({ essentialMonthly: 60_000, lifestyleMonthly: 0, horizonAge: 100 })).toBe(
      'Gasto essencial de R$ 60 mil por mês, sem gasto de estilo de vida e horizonte até os 100 anos',
    )
    expect(name({ incomes: [{ name: 'Pró-labore do Ricardo', monthly: 0 }] })).toBe('Sem pró-labore do Ricardo')
    expect(name({ extraFlows: [{ kind: 'resgate', amount: 1_250_000, year: 2027, month: 3 }] })).toBe('Resgate de R$ 1,25 mi em mar/2027')
    // Acima de R$ 1 mi, o valor sai exato no passo de R$ 1 mil (dois valores diferentes, dois nomes diferentes).
    expect(name({ lifestyleMonthly: 1_234_000 })).toBe('Estilo de vida de R$ 1,234 mi por mês')
    expect(name({ lifestyleMonthly: 1_231_000 })).toBe('Estilo de vida de R$ 1,231 mi por mês')
    expect(name({ propertySales: [{ propertyId: 'casa-praia', year: 2030 }] })).toBe('Imóvel Casa de praia vendido em 2030')
    expect(name({ firstYearShock: -0.2, rulesEnabled: false })).toBe('Choque de −20% no 1º ano e sem ajustes de gasto em anos ruins')
  })

  it('o nome nunca recomenda produto, ativo ou alocação', () => {
    const names: string[] = []
    for (const retirementAge of [undefined, 55, 65])
      for (const spendingMultiplier of [undefined, 0.9, 1.2])
        for (const extra of [{}, { shockPresetId: 'decada-perdida' }, { propertySales: [{ propertyId: 'sala', year: 2035 }] }, { rulesEnabled: false }])
          names.push(scenarioName({ retirementAge, spendingMultiplier, ...extra }, ctx))
    for (const n of names) expect(n).not.toMatch(RECOMMENDATION)
  })

  it('roda com os sorteios da rodada oficial: a crise de 2008 dá o mesmo número do relatório de exemplo', () => {
    const args = andradeReportArgs()
    const closing = args.data.closings.find((c) => c.refDate.startsWith('2026-10'))!
    const pkg: MonthPackage = { household: args.data.household, planVersion: planVersionFor(args.data.planVersions, '2026-10'), closing, ...args.cmaFor('2026-10') }
    const r = runScenario(pkg, args.data.ipca, toEngineScenario({ shockPresetId: 'crise-2008' }))
    const example = frozen.scenarios.find((s) => s.id === 'crise-2008')!
    expect(r.probability).toBe(example.probability)
    expect(r.requiredReturn).toBe(example.requiredReturn)
    expect(r).toMatchObject({ paths: 10_000, seed: args.data.household.seed })
  })
})
