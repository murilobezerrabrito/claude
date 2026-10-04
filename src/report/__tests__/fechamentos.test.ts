import { describe, expect, it } from 'vitest'
import dataset from '../../data/andrade-fechamentos.json'
import { buildPlan } from '../../engine/plan.ts'
import { correctPlan } from '../inflation.ts'
import { buildMonthInputs, checkClosing, planVersionFor } from '../monthInputs.ts'
import { monthReturn } from '../performance.ts'
import type { HouseholdMonths } from '../types.ts'
import { andrade, andradePlanV1, cma, profiles } from './helpers.ts'

const data = dataset as unknown as HouseholdMonths
const [setembro, outubro] = data.closings
const inputsFor = (closing: (typeof data.closings)[number]) =>
  buildMonthInputs({
    household: data.household,
    planVersion: planVersionFor(data.planVersions, closing.refDate.slice(0, 7)),
    closing,
    ipca: data.ipca,
    cma,
    profiles,
  })

describe('fechamentos fictícios da Família Andrade', () => {
  it('setembro/2026: os dados de andrade.json, como estão', () => {
    expect(planVersionFor(data.planVersions, '2026-09').id).toBe('andrade-v1')
    expect(data.planVersions[0].snapshot).toEqual(andradePlanV1().snapshot)
    expect(setembro.positionsByClass).toEqual(andrade.cadmPositionsByClass)
    expect(setembro.flows).toHaveLength(0)
    expect(inputsFor(setembro).input.household).toEqual(andrade)
  })

  it('outubro/2026: plano v2 = v1 corrigido pelo IPCA de 0,40%, com o estilo de vida em R$ 35 mil por mês', () => {
    const v2 = planVersionFor(data.planVersions, '2026-10')
    expect(v2.id).toBe('andrade-v2')
    expect(v2.baseMonth).toBe('2026-10')
    expect(data.ipca['2026-10']).toBe(0.004)
    const esperado = correctPlan(data.planVersions[0].snapshot, 1.004)
    for (const cf of esperado.cashFlows) if (cf.kind === 'gasto_estilo') cf.annualAmountReal = 420_000
    expect(v2.snapshot).toEqual(esperado)
    // VGBL com valor real constante: R$ 1,8 mi de setembro em reais de outubro.
    expect(v2.snapshot.otherAssets.find((a) => a.id === 'vgbl')?.value).toBe(1_807_200)
  })

  it('outubro/2026: resgate de R$ 300 mil em 15/10, PL conferido e rentabilidade real de cerca de −2,5%', () => {
    expect(outubro.flows).toEqual([{ date: '2026-10-15', kind: 'resgate', amount: 300_000, description: 'Resgate para reforma' }])
    for (const closing of data.closings) expect(() => checkClosing(closing)).not.toThrow()
    const { real } = monthReturn({ refDate: outubro.refDate, startValue: setembro.officialPl, endValue: outubro.officialPl, flows: outubro.flows, ipca: data.ipca })
    expect(real).toBeGreaterThan(-0.026)
    expect(real).toBeLessThan(-0.024)
  })

  it('entradas de outubro: plano v2 sem correção (mês-base outubro), patrimônio novo e nenhum aviso', () => {
    const m = inputsFor(outubro)
    expect(m.ipcaFactor).toBe(1)
    const plan = buildPlan(m.input)
    expect(plan.W0).toBeCloseTo(11_450_961.29 + 1_807_200, 6)
    expect(plan.firstMonthLifestyle).toBeCloseTo(35_000, 6)
    expect(plan.legacy).toBe(3_012_000)
    expect(plan.warnings).toHaveLength(0)
  })
})
