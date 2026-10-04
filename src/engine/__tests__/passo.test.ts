import { describe, expect, it } from 'vitest'
import { buildPlan } from '../plan.ts'
import { simulate } from '../simulate.ts'
import type { HouseholdData, SimInput } from '../types.ts'
import { andrade, andradeInput, cma, flatCma, OPT, profiles } from './helpers.ts'

/** Família de uma pessoa, sem fluxos além dos informados, para testar o calendário. */
function family(opts: {
  referenceDate: string
  birthDate: string
  retirementAge?: number
  W0?: number
  cashFlows?: HouseholdData['cashFlows']
  events?: HouseholdData['events']
  vol?: number
  mu?: number
}): SimInput {
  const household: HouseholdData = {
    household: { id: 'cal', name: 'Calendário', referenceDate: opts.referenceDate, profileId: 'moderado', feeRate: 0, horizonAge: 95, legacyMin: 0 },
    people: [{ id: 'p', name: 'Pessoa', birthDate: opts.birthDate, sex: 'F', role: 'titular', retirementAge: opts.retirementAge }],
    cadmPositionsByClass: { POS: opts.W0 ?? 1_000_000 },
    otherAssets: [],
    cashFlows: opts.cashFlows ?? [],
    events: opts.events ?? [],
    goals: [],
    rules: { ...andrade.rules, enabled: false },
  }
  return { household, cma: opts.mu === undefined ? cma : flatCma(opts.mu, opts.vol ?? 0), profiles }
}

describe('T18 passo de 12 meses', () => {
  it('a data de referência precisa ser o último dia do mês de competência', () => {
    expect(() => buildPlan(family({ referenceDate: '2026-09-15', birthDate: '1976-08-02' }))).toThrowError(/último dia do mês/)
    expect(() => buildPlan(family({ referenceDate: '2026-09-30', birthDate: '1976-08-02' }))).not.toThrow()
  })

  it('Família Andrade: 45 passos de out/2026 a ago/2071, o último com 11 meses, e o fluxo do primeiro mês', () => {
    const plan = buildPlan(andradeInput())
    expect(plan.T).toBe(45)
    expect(Array.from(plan.stepMonths).filter((m) => m !== 12)).toEqual([11])
    expect(plan.years[0]).toBe(2026)
    expect(plan.years[45]).toBe(2071)
    expect(plan.ages[45]).toBe(95)
    // Out/2026: renda de R$ 1.764.000/12 menos gastos de R$ 85.000; nenhum evento no mês.
    expect(plan.firstMonthFlow).toBeCloseTo(1_764_000 / 12 - 85_000, 6)
  })

  it('fluxos anuais entram pro rata pelos meses de cada ano civil que caem no passo', () => {
    // Passo 0 = out/2026 a set/2027: 3 meses de 2026 (R$ 120 mil por ano) e 9 de 2027 (R$ 240 mil por ano).
    const plan = buildPlan(
      family({
        referenceDate: '2026-09-30',
        birthDate: '1950-01-10',
        cashFlows: [
          { kind: 'renda', name: 'Renda 2026', annualAmountReal: 120_000, startYear: 2026, endYear: 2026 },
          { kind: 'renda', name: 'Renda depois', annualAmountReal: 240_000, startYear: 2027, endYear: 2040 },
        ],
      }),
    )
    expect(plan.income[0]).toBeCloseTo(120_000 * (3 / 12) + 240_000 * (9 / 12), 6)
    expect(plan.income[1]).toBeCloseTo(240_000, 6)
  })

  it('evento único entra no seu mês; sem mês, em julho; data antes do primeiro mês sai do cálculo com aviso', () => {
    const plan = buildPlan(
      family({
        referenceDate: '2026-09-30',
        birthDate: '1950-01-10',
        events: [
          { name: 'Com mês', direction: 'saida', amountReal: 100_000, year: 2027, month: 11, recurrence: 'unica' },
          { name: 'Sem mês', direction: 'saida', amountReal: 50_000, year: 2027, recurrence: 'unica' },
          { name: 'Passado', direction: 'saida', amountReal: 70_000, year: 2026, month: 3, recurrence: 'unica' },
        ],
      }),
    )
    expect(plan.outflows[0]).toBe(50_000) // jul/2027 está no passo 0 (out/2026 a set/2027)
    expect(plan.outflows[1]).toBe(100_000) // nov/2027 está no passo 1
    expect(plan.outflows.reduce((a, b) => a + b, 0)).toBe(150_000)
    expect(plan.warnings.some((w) => w.includes('"Passado"') && w.includes('antes do primeiro mês'))).toBe(true)
  })

  it('o último passo com m < 12 meses rende (1 + R)^(m/12) − 1', () => {
    // Referência em dez/2026; a pessoa faz 95 em jun/2027: um passo só, de jan a jun/2027 (6 meses), a 4% real.
    const input = family({ referenceDate: '2026-12-31', birthDate: '1932-06-10', W0: 1_000_000, mu: 0.04, vol: 0 })
    const plan = buildPlan(input)
    expect(plan.T).toBe(1)
    expect(plan.stepMonths[0]).toBe(6)
    const res = simulate(input, { paths: 1000, seed: 1 })
    expect(res.percentiles.p50[1]).toBeCloseTo(1_000_000 * Math.sqrt(1.04), 4)
  })

  it('aposentado no passo t só se a aposentadoria foi antes do início do passo', () => {
    // Referência em set/2026; passo t começa em out/(2026 + t).
    const base = { referenceDate: '2026-09-30', W0: 1_000_000 }
    // Aniversário em mar: aposentadoria aos 60 em mar/2036, dentro do passo 9 (out/2035 a set/2036): aposentado a partir do passo 10.
    expect(buildPlan(family({ ...base, birthDate: '1976-03-10', retirementAge: 60 })).retiredFrom).toBe(10)
    // Aniversário em out: aposentadoria em out/2036, no mês em que o passo 10 começa; não foi antes do início, então só no passo 11.
    expect(buildPlan(family({ ...base, birthDate: '1976-10-10', retirementAge: 60 })).retiredFrom).toBe(11)
    // Aposentadoria já ocorrida antes da data de referência: aposentado desde o passo 0.
    expect(buildPlan(family({ ...base, birthDate: '1960-05-10', retirementAge: 60 })).retiredFrom).toBe(0)
  })

  it('nenhum corte do gasto flexível nos últimos 15 passos, inclusive o passo parcial', () => {
    const res = simulate(andradeInput({ rulesEnabled: true }), { ...OPT, collectLifestyle: true })
    const T = res.T
    const mults = res.lifestyleMultipliers as Float64Array
    for (let i = 0; i < res.paths; i++) {
      for (let t = T - 15; t < T; t++) {
        expect(mults[i * T + t]).toBeGreaterThanOrEqual(mults[i * T + t - 1] - 1e-12)
      }
    }
  })
})
