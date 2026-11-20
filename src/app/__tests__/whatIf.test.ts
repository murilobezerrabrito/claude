// "E se?" do app: com o mercado guardado entre um cenário e outro, o resultado é o mesmo do `simulate` do motor, com as
// mesmas 5.000 trajetórias e a mesma semente; o mercado é sorteado uma vez (horizonte máximo) e recortado. Família Andrade,
// out/2026, como cliente AI (o exemplo do app).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_EXAMPLE_PATH } from '../../../scripts/appExample.ts'
import { simulate } from '../../engine/simulate.ts'
import { buildMonthInputs } from '../../report/monthInputs.ts'
import { mainInput } from '../../report/officialRun.ts'
import { toEngineScenario, type ReportScenarioParams } from '../../report/scenarios.ts'
import type { ClientMonthView } from '../types.ts'
import { createWhatIf, WHAT_IF_PATHS } from '../whatIf.ts'

const view = JSON.parse(readFileSync(new URL(`../../../${APP_EXAMPLE_PATH}`, import.meta.url), 'utf8')) as ClientMonthView

function direct(params: ReportScenarioParams) {
  const m = buildMonthInputs({ ...view.pkg, ipca: view.ipca, scenario: toEngineScenario(params) })
  return simulate(mainInput(m.input), { paths: WHAT_IF_PATHS, seed: m.seed })
}

describe('E se? no aparelho', () => {
  const whatIf = createWhatIf(view.pkg, view.ipca)

  it('o plano e os cenários dão exatamente o mesmo do motor, com o mercado sorteado uma vez e recortado por horizonte', () => {
    const cases: [ReportScenarioParams, boolean][] = [
      [{}, false],
      [{ retirementAge: 59 }, true],
      [{ spendingMultiplier: 1.1 }, true],
      [{ shockPresetId: 'crise-2008' }, true],
      [{ propertySales: [{ propertyId: 'casa-praia', year: 2030 }], rulesEnabled: false }, true],
      [{ horizonAge: 100 }, true],
      [{ horizonAge: 100, essentialMonthly: 50_000 }, true],
      [{ horizonAge: 85 }, true],
      [{ horizonAge: 105, retirementAge: 65 }, true],
    ]
    for (const [params, reused] of cases) {
      const r = whatIf.run(params)
      const d = direct(params)
      expect(r.marketReused, JSON.stringify(params)).toBe(reused)
      expect(r.probability).toBe(d.successProbability)
      expect(r.requiredReturn).toBe(d.requiredReturn.rate)
      expect(r.p10).toEqual(d.percentiles.p10)
      expect(r.p50).toEqual(d.percentiles.p50)
      expect(r.p90).toEqual(d.percentiles.p90)
      expect(r.depletionAge).toBe(d.depletionAge)
    }
  })

  it('o plano no aparelho dá a chance da rodada de 5.000 trajetórias; aos 80 e no fim, o cenário do meio', () => {
    const plan = whatIf.run({})
    expect(plan.horizonAge).toBe(95)
    expect(plan.medianAt80).toBe(plan.p50[plan.ages.findIndex((a) => a >= 80)])
    expect(plan.medianFinal).toBe(plan.p50[plan.p50.length - 1])
  })

  it('gasto sustentável com 90% de chance, sob demanda', () => {
    const r = whatIf.sustainable({})
    expect(r.status).toBe('ok')
    expect(r.target).toBe(0.9)
    expect(r.monthlySpending).toBeGreaterThan(0)
    expect(r.monthlySpending).toBeLessThan(r.currentMonthlySpending)
  })
})
