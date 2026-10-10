// A rodada oficial e a ponte por partes (uma simulação por chamada no servidor) dão exatamente os mesmos números da
// rodada feita de uma vez.

import { describe, expect, it } from 'vitest'
import { simulate } from '../../engine/simulate.ts'
import { assembleBridge, bridgePlan, monthAttribution, runBridgeState, type BridgePlan } from '../attribution.ts'
import dataset from '../../data/andrade-fechamentos.json'
import { planVersionFor } from '../monthInputs.ts'
import { assembleOfficialRun, mainRunResult, officialRun, officialRunPlan, runInputsHash, type MonthPackage } from '../officialRun.ts'
import type { HouseholdMonths, MonthClosing } from '../types.ts'
import { cma, profiles } from './helpers.ts'

const paths = 2_000
const data = dataset as unknown as HouseholdMonths
const pkg = (closing: MonthClosing): MonthPackage => ({
  household: data.household,
  planVersion: planVersionFor(data.planVersions, closing.refDate.slice(0, 7)),
  closing,
  cma,
  profiles,
})
const setembro = pkg(data.closings[0])
const outubro = pkg(data.closings[1])

describe('rodada oficial por partes', () => {
  it('montar a partir das simulações dá a mesma rodada', () => {
    const plan = officialRunPlan(outubro, data.ipca, { paths })
    const main = simulate(plan.main, { paths, seed: plan.seed })
    const rules = plan.rules ? simulate(plan.rules, { paths, seed: plan.seed }).successProbability : null
    // Ida e volta por JSON, como as partes guardadas no banco.
    const stored = JSON.parse(JSON.stringify(mainRunResult(main))) as ReturnType<typeof mainRunResult>
    expect(assembleOfficialRun(outubro, plan, stored, rules)).toEqual(officialRun(outubro, data.ipca, { paths }))
  })

  it('o hash das entradas sem simular é o mesmo do motor', () => {
    const plan = officialRunPlan(outubro, data.ipca, { paths })
    expect(runInputsHash(plan.main, paths, plan.seed)).toBe(simulate(plan.main, { paths, seed: plan.seed }).inputsHash)
  })
})

describe('ponte por partes', () => {
  const published = officialRun(setembro, data.ipca, { paths })
  const args = { previous: { pkg: setembro, published }, current: outubro, ipca: data.ipca, paths }

  it('montar a partir dos estados dá a mesma ponte; o último passo é a rodada oficial do mês', () => {
    const plan = bridgePlan(args) as BridgePlan
    expect(plan.kind).toBe('plano_da_ponte')
    expect(plan.steps.map((s) => s.id)).toEqual(['passagem_do_tempo', 'mercado', 'aportes_e_resgates', 'carteira', 'plano', 'premissas'])
    const main = officialRunPlan(outubro, data.ipca, { paths }).main
    expect(runInputsHash(plan.steps[5].input, paths, plan.seed)).toBe(runInputsHash(main, paths, plan.seed))
    const start = runBridgeState(plan.startInput, paths, plan.seed)
    const states = plan.steps.map((s) => JSON.parse(JSON.stringify(runBridgeState(s.input, paths, plan.seed))))
    expect(assembleBridge(plan, start, states)).toEqual(monthAttribution(args))
  })

  it('primeiro mês: sem plano de ponte', () => {
    expect(bridgePlan({ previous: null, current: setembro, ipca: data.ipca })).toEqual({ kind: 'primeiro_mes' })
  })
})
