import { describe, expect, it } from 'vitest'
import { buildPlan, fullPlanFlows } from '../plan.ts'
import { requiredReturn } from '../requiredReturn.ts'
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

  it('evento único entra no seu mês; sem mês, em julho', () => {
    const plan = buildPlan(
      family({
        referenceDate: '2026-09-30',
        birthDate: '1950-01-10',
        events: [
          { name: 'Com mês', direction: 'saida', amountReal: 100_000, year: 2027, month: 11, recurrence: 'unica' },
          { name: 'Sem mês', direction: 'saida', amountReal: 50_000, year: 2027, recurrence: 'unica' },
        ],
      }),
    )
    expect(plan.outflows[0]).toBe(50_000) // jul/2027 está no passo 0 (out/2026 a set/2027)
    expect(plan.outflows[1]).toBe(100_000) // nov/2027 está no passo 1
    expect(plan.outflows.reduce((a, b) => a + b, 0)).toBe(150_000)
    expect(plan.warnings).toHaveLength(0)
  })

  it('"a cada N anos" com mês: cada ocorrência no seu mês', () => {
    // Dez/2027, dez/2029 e dez/2031 caem nos passos 1, 3 e 5 (passo t = out/(2026 + t) a set/(2027 + t)).
    const plan = buildPlan(
      family({
        referenceDate: '2026-09-30',
        birthDate: '1950-01-10',
        events: [{ name: 'Reforma', direction: 'saida', amountReal: 80_000, year: 2027, endYear: 2031, month: 12, recurrence: 'a_cada_n', everyN: 2 }],
      }),
    )
    expect(Array.from(plan.outflows.slice(0, 7))).toEqual([0, 80_000, 0, 80_000, 0, 80_000, 0])
  })

  it('data já passada (D-031): sai do cálculo; sem mês no ano corrente, com julho passado, a saída vai para o primeiro mês', () => {
    const plan = buildPlan(
      family({
        referenceDate: '2026-09-30',
        birthDate: '1950-01-10',
        events: [
          // Sem mês em 2026: julho já passou e a data é incerta. A saída entra em out/2026; a entrada sai. Com aviso.
          { name: 'Viagem', direction: 'saida', amountReal: 50_000, year: 2026, recurrence: 'unica' },
          { name: 'Prêmio', direction: 'entrada', amountReal: 30_000, year: 2026, recurrence: 'unica' },
          // Com mês, ou de anos anteriores: já aconteceu, fora do cálculo, sem aviso.
          { name: 'Obra', direction: 'saida', amountReal: 70_000, year: 2026, month: 3, recurrence: 'unica' },
          { name: 'Bônus', direction: 'entrada', amountReal: 40_000, year: 2026, month: 8, recurrence: 'unica' },
          { name: 'Antiga', direction: 'saida', amountReal: 90_000, year: 2025, recurrence: 'unica' },
          // A cada 5 anos desde 2016, sem mês: 2016 e 2021 saem; 2026 (julho passado) entra no primeiro mês; 2031 no seu mês.
          { name: 'Carro', direction: 'saida', amountReal: 200_000, year: 2016, endYear: 2031, recurrence: 'a_cada_n', everyN: 5 },
        ],
      }),
    )
    expect(plan.outflows[0]).toBe(50_000 + 200_000)
    expect(plan.outflows[4]).toBe(200_000) // jul/2031
    expect(plan.outflows.reduce((a, b) => a + b, 0)).toBe(50_000 + 400_000)
    expect(plan.inflows.reduce((a, b) => a + b, 0)).toBe(0)
    expect(plan.firstMonthFlow).toBe(-(50_000 + 200_000))
    expect(plan.warnings).toHaveLength(3)
    const aviso = (nome: string, trecho: string) => plan.warnings.some((w) => w.includes(`"${nome}"`) && w.includes(trecho))
    expect(aviso('Viagem', 'a saída foi contada no primeiro mês simulado')).toBe(true)
    expect(aviso('Prêmio', 'a entrada ficou fora do cálculo')).toBe(true)
    expect(aviso('Carro', 'julho de 2026 já passou')).toBe(true)
  })

  it('no ciclo mensal, a saída sem mês volta só até o fim do ano e nada é contado de novo depois', () => {
    // Família Andrade: troca de carros de R$ 400 mil a cada 5 anos desde 2028, sem mês (julho).
    const at = (referenceDate: string, semCarro = false) => {
      const input = andradeInput()
      input.household.household.referenceDate = referenceDate
      if (semCarro) input.household.events = input.household.events.filter((e) => e.name !== 'Troca de carros')
      return buildPlan(input)
    }
    // De ago a dez/2028 (julho passado, data incerta): a troca entra no primeiro mês simulado, com aviso.
    for (const ref of ['2028-07-31', '2028-11-30']) {
      const plan = at(ref)
      expect(plan.firstMonthFlow - at(ref, true).firstMonthFlow).toBeCloseTo(-400_000, 6)
      expect(plan.warnings.some((w) => w.includes('"Troca de carros"'))).toBe(true)
    }
    // Em jul/2028 (o próprio mês) entra normalmente, sem aviso; de jan/2029 em diante, sai sem aviso.
    for (const ref of ['2028-06-30', '2028-12-31', '2029-07-31']) {
      const plan = at(ref)
      expect(plan.warnings).toHaveLength(0)
      const diff = plan.firstMonthFlow - at(ref, true).firstMonthFlow
      expect(diff).toBeCloseTo(ref === '2028-06-30' ? -400_000 : 0, 6)
    }
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

  it('o benchmark também rende (1 + r)^(m/12) no passo curto', () => {
    // Referência em dez/2026; 95 anos em jun/2028: passos de 12 e 6 meses. Sem fluxos, legado = W0 · 1,04^1,5: r* = 4%.
    // Com o passo curto contado como ano inteiro, daria (1,04^1,5)^(1/2) − 1 ≈ 3,0%.
    const input = family({ referenceDate: '2026-12-31', birthDate: '1933-06-10', W0: 1_000_000 })
    input.scenario = { legacyMin: 1_000_000 * 1.04 ** 1.5 }
    const plan = buildPlan(input)
    expect(Array.from(plan.stepMonths)).toEqual([12, 6])
    const r = requiredReturn(plan.W0, fullPlanFlows(plan), plan.legacy, plan.stepFrac)
    expect(r.status).toBe('ok')
    expect(Math.abs((r.rate as number) - 0.04)).toBeLessThan(1e-6)
    const res = simulate(input, { paths: 1000, seed: 1 })
    expect(Math.abs((res.requiredReturn.rate as number) - 0.04)).toBeLessThan(1e-6)
  })

  it('gasto mensal do "E se?" é o do primeiro mês simulado (D-032)', () => {
    // Essencial de R$ 50 mil por mês em 2026 e R$ 60 mil por mês a partir de 2027; o primeiro mês (out/2026) tem R$ 50 mil.
    const cashFlows: HouseholdData['cashFlows'] = [
      { kind: 'gasto_essencial', name: 'Essencial 2026', annualAmountReal: 600_000, startYear: 2026, endYear: 2026 },
      { kind: 'gasto_essencial', name: 'Essencial', annualAmountReal: 720_000, startYear: 2027, endYear: 2060 },
    ]
    const input = family({ referenceDate: '2026-09-30', birthDate: '1950-01-10', cashFlows })
    const plan = buildPlan(input)
    expect(plan.firstMonthEssential).toBeCloseTo(50_000, 6)
    // O mesmo valor do plano não muda nada; 10% a mais no primeiro mês sobe todos os passos em 10%.
    input.scenario = { essentialMonthly: 50_000 }
    expect(Array.from(buildPlan(input).essential)).toEqual(Array.from(plan.essential).map((v) => expect.closeTo(v, 6)))
    input.scenario = { essentialMonthly: 55_000 }
    expect(buildPlan(input).essential[1]).toBeCloseTo(792_000, 6)
    // Passo 0 curto (6 meses): o mesmo valor mensal do plano mantém os R$ 60 mil do passo.
    const curto = family({ referenceDate: '2026-12-31', birthDate: '1932-06-10', cashFlows: [{ kind: 'gasto_essencial', name: 'Essencial', annualAmountReal: 120_000, startYear: 2027, endYear: 2027 }] })
    curto.scenario = { essentialMonthly: 10_000 }
    expect(buildPlan(curto).essential[0]).toBeCloseTo(60_000, 6)
    // Sem esse gasto no primeiro mês: o valor vale para todos os meses, com aviso.
    const depois = family({ referenceDate: '2026-09-30', birthDate: '1950-01-10', cashFlows: [cashFlows[1]] })
    depois.scenario = { essentialMonthly: 60_000 }
    const p = buildPlan(depois)
    expect(p.essential[0]).toBeCloseTo(720_000, 6)
    expect(p.warnings.some((w) => w.includes('primeiro mês'))).toBe(true)
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
