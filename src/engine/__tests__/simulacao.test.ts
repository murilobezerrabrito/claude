import { describe, expect, it } from 'vitest'
import choques from '../../data/choques.json'
import { buildPlan, fullPlanFlows } from '../plan.ts'
import { projectWealth, requiredReturn } from '../requiredReturn.ts'
import { simulate } from '../simulate.ts'
import type { ShockPreset, SimResult } from '../types.ts'
import { andradeInput, cma, flatCma, OPT, profiles, refValue, syntheticInput } from './helpers.ts'

const presets = choques.presets as ShockPreset[]
/** O resultado sem os campos que identificam a entrada (hash), para comparar cenários equivalentes. */
const numbers = (r: SimResult) => ({ ...r, inputsHash: '' })

describe('T04 volatilidade zero', () => {
  const zeroVol = { ...cma, classes: cma.classes.map((c) => ({ ...c, vol: 0 })) }

  it('probabilidade 0% ou 100% e trajetória igual à do cálculo sem sorteio', () => {
    const input = { ...andradeInput({ rulesEnabled: false }), cma: zeroVol }
    const res = simulate(input, { paths: 1000, seed: 3 })
    expect([0, 1]).toContain(res.successProbability)

    const plan = buildPlan(input)
    const w = profiles.find((p) => p.id === 'moderado')!.weightsPre
    const gross = cma.classes.reduce((acc, c) => acc + w[c.code] * c.mu, 0)
    const R = (1 - plan.fee) * (1 + gross) - 1
    // O último passo da Andrade tem 11 meses e rende a sua fração de ano.
    const det = projectWealth(plan.W0, fullPlanFlows(plan), () => R, plan.stepFrac)
    for (let t = 0; t <= plan.T; t++) {
      expect(res.percentiles.p10[t]).toBeCloseTo(det.wealth[t], 2)
      expect(res.percentiles.p90[t]).toBeCloseTo(det.wealth[t], 2)
    }
  })

  it('um plano que falha sem sorteio tem probabilidade 0%', () => {
    const res = simulate(syntheticInput({ W0: 1_000_000, years: 20, deficit: 100_000, cma: flatCma(0.02, 0) }), { paths: 1000, seed: 3 })
    expect(res.successProbability).toBe(0)
  })
})

describe('T05 renda cobre tudo', () => {
  it('com renda maior ou igual aos gastos em todos os anos, a probabilidade é 100%, mesmo com crise no 1º ano', () => {
    const input = syntheticInput({ W0: 2_000_000, years: 40, income: 600_000, deficit: 400_000, lifestyle: 200_000 })
    const res = simulate({ ...input, scenario: { profileId: 'arrojado', shocks: presets.filter((p) => p.id === 'crise-2008') } }, OPT)
    expect(res.successProbability).toBe(1)
  })
})

describe('T06 reprodutibilidade', () => {
  it('mesma entrada e mesma semente dão resultado idêntico', () => {
    const a = simulate(andradeInput(), OPT)
    const b = simulate(andradeInput(), OPT)
    expect(b).toEqual(a)
    expect(b.inputsHash).toBe(a.inputsHash)
  })

  it('outra semente muda o sorteio, mas a probabilidade fica a ±2 p.p.', () => {
    const a = simulate(andradeInput({ rulesEnabled: false }), OPT)
    const b = simulate(andradeInput({ rulesEnabled: false }), { ...OPT, seed: OPT.seed + 1 })
    expect(b.inputsHash).not.toBe(a.inputsHash)
    expect(b.percentiles.p50).not.toEqual(a.percentiles.p50)
    expect(Math.abs(b.successProbability - a.successProbability)).toBeLessThanOrEqual(0.02)
  })
})

describe('T09 convenção de fluxo', () => {
  it('déficit maior que o patrimônio no início do ano falha naquele ano, qualquer que seja o retorno do ano', () => {
    const res = simulate(syntheticInput({ W0: 100_000, years: 10, deficit: 150_000, cma: flatCma(0.5, 0.3) }), { paths: 1000, seed: 9 })
    expect(res.successProbability).toBe(0)
    expect(res.percentiles.p90[1]).toBe(0)
  })

  it('déficit igual ao patrimônio não falha no ano: o patrimônio vai a zero', () => {
    const res = simulate(syntheticInput({ W0: 150_000, years: 1, deficit: 150_000, cma: flatCma(0.04, 0.1) }), { paths: 1000, seed: 9 })
    expect(res.successProbability).toBe(1)
    expect(res.percentiles.p90[1]).toBe(0)
  })

  it('superávit entra no fim do ano, sem render', () => {
    const res = simulate(syntheticInput({ W0: 1_000_000, years: 1, income: 100_000, cma: flatCma(0.1, 0) }), { paths: 1000, seed: 9 })
    expect(res.percentiles.p50[1]).toBeCloseTo(1_000_000 * 1.1 + 100_000, 6)
  })
})

describe('T10 monotonia', () => {
  for (const rulesEnabled of [false, true]) {
    it(`mais gasto, com a mesma semente, nunca aumenta a probabilidade (regras ${rulesEnabled ? 'ligadas' : 'desligadas'})`, () => {
      let previous = 1
      for (const k of [0.8, 0.9, 1, 1.05, 1.1, 1.2, 1.4]) {
        const p = simulate(andradeInput({ rulesEnabled, spendingMultiplier: k }), OPT).successProbability
        expect(p).toBeLessThanOrEqual(previous)
        previous = p
      }
    })

    it(`menos patrimônio, com a mesma semente, nunca aumenta a probabilidade (regras ${rulesEnabled ? 'ligadas' : 'desligadas'})`, () => {
      let previous = 1
      for (const pos of [6_000_000, 3_000_000, 1_000_000, 0]) {
        const input = andradeInput({ rulesEnabled })
        input.household.cadmPositionsByClass.POS = pos
        const p = simulate(input, OPT).successProbability
        expect(p).toBeLessThanOrEqual(previous)
        previous = p
      }
    })
  }
})

describe('T12 choques', () => {
  const base = simulate(andradeInput({ rulesEnabled: false }), OPT)

  it('choque de −30% no 1º ano reduz a probabilidade', () => {
    const shocked = simulate(andradeInput({ rulesEnabled: false, firstYearShock: -0.3 }), OPT)
    expect(shocked.successProbability).toBeLessThan(base.successProbability)
    expect(shocked.percentiles.p50[1]).toBeLessThan(base.percentiles.p50[1])
  })

  it('choque zero é igual a não ter choque', () => {
    const zero = simulate(andradeInput({ rulesEnabled: false, firstYearShock: 0, shocks: [] }), OPT)
    expect(numbers(zero)).toEqual(numbers(base))
  })

  it.each(presets.map((p) => [p.name, p] as const))('cenário pronto "%s" reduz a probabilidade', (_name, preset) => {
    const shocked = simulate(andradeInput({ rulesEnabled: false, shocks: [preset] }), OPT)
    expect(shocked.successProbability).toBeLessThan(base.successProbability)
  })
})

describe('horizonte', () => {
  it('números aleatórios comuns: com os mesmos fluxos, as faixas até o fim do horizonte menor são idênticas', () => {
    const a = simulate(andradeInput({ rulesEnabled: false }), OPT)
    const b = simulate(andradeInput({ rulesEnabled: false, horizonAge: 96 }), OPT)
    expect(b.T).toBe(a.T + 1)
    for (const key of ['p10', 'p25', 'p50', 'p75', 'p90'] as const) {
      // Até o início do último passo do horizonte menor: com 95 anos ele tem 11 meses (out/2070 a ago/2071) e, com 96,
      // o mesmo passo tem 12 meses, então só o ponto final difere.
      expect(b.percentiles[key].slice(0, a.T)).toEqual(a.percentiles[key].slice(0, a.T))
    }
  })

  it('horizonte mais longo nunca aumenta a probabilidade nem reduz o benchmark pessoal', () => {
    let previousP = 1
    let previousR = -Infinity
    let previousR0 = -Infinity
    for (const horizonAge of [90, 95, 96, 97, 100, 105]) {
      const input = andradeInput({ rulesEnabled: false, horizonAge })
      const res = simulate(input, OPT)
      expect(res.successProbability).toBeLessThanOrEqual(previousP)
      const r = res.requiredReturn.rate as number
      expect(r).toBeGreaterThanOrEqual(previousR)
      const plan = buildPlan(input)
      const r0 = requiredReturn(plan.W0, fullPlanFlows(plan), 0).rate as number
      expect(r0).toBeGreaterThanOrEqual(previousR0)
      previousP = res.successProbability
      previousR = r
      previousR0 = r0
    }
  })
})

describe('idade de esgotamento e benchmark no resultado', () => {
  it('é a idade do ano em que o déficit não foi coberto', () => {
    // R$ 1 mi, déficit de R$ 300 mil, retorno zero: cobre os anos 0, 1 e 2 e falha no ano 3 (aos 88 anos).
    const res = simulate(syntheticInput({ W0: 1_000_000, years: 10, deficit: 300_000, cma: flatCma(0, 0) }), { paths: 1000, seed: 5 })
    expect(res.ages[0]).toBe(85)
    expect(res.depletionAge).toBe(88)
    expect(simulate(andradeInput(), OPT).depletionAge).toBeNull()
  })

  it('o resultado traz o benchmark pessoal e a folga com o retorno composto esperado', () => {
    const res = simulate(andradeInput(), OPT)
    expect(res.requiredReturn.status).toBe('ok')
    expect(Math.abs((res.requiredReturn.rate as number) - refValue('benchmark_com_legado'))).toBeLessThan(0.0001)
    expect(res.slack).toBeCloseTo(res.expectedCompositeReturn - (res.requiredReturn.rate as number), 12)
  })
})
