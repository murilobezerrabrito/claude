import { describe, expect, it } from 'vitest'
import { runPaths, marketFor } from '../simulate.ts'
import { buildPlan } from '../plan.ts'
import { earliestRetirement, sustainableSpending } from '../solvers.ts'
import { andradeInput, OPT } from './helpers.ts'

const seed = OPT.seed

function probability(scenario: Parameters<typeof andradeInput>[0]): number {
  const input = andradeInput({ rulesEnabled: false, ...scenario })
  const plan = buildPlan(input)
  const market = marketFor(input, plan, 5000, seed)
  return runPaths(plan, market).successCount / 5000
}

describe('gasto sustentável (Quanto posso gastar?)', () => {
  const res = sustainableSpending(andradeInput(), { seed })

  it('encontra o maior multiplicador com probabilidade ≥ 90%, confirmado com 5.000 trajetórias', () => {
    expect(res.status).toBe('ok')
    expect(res.probability).toBeGreaterThanOrEqual(0.9)
    expect(res.currentMonthlySpending).toBe(85_000)
    expect(res.monthlySpending).toBeCloseTo((res.multiplier as number) * 85_000, 6)
    // Um pouco mais de gasto já fica abaixo do alvo.
    expect(probability({ spendingMultiplier: (res.multiplier as number) + 0.01 })).toBeLessThan(0.9)
  })

  it('por padrão, sem as regras de gasto flexível (o número mais conservador)', () => {
    const withRules = sustainableSpending(andradeInput(), { seed, withRules: true })
    expect(withRules.monthlySpending as number).toBeGreaterThan(res.monthlySpending as number)
  })

  it('quando a busca com 2.000 trajetórias não confirma o intervalo, faz a bisseção com 5.000 (não devolve k = 0,3)', () => {
    // Patrimônio escolhido para que k = 3 bata 90% com 2.000 trajetórias e não com 5.000.
    const input = andradeInput()
    input.household.cadmPositionsByClass.POS = 54_850_000
    const rich = (k: number, paths: number) => {
      const i = { ...input, scenario: { rulesEnabled: false, spendingMultiplier: k } }
      const plan = buildPlan(i)
      return runPaths(plan, marketFor(i, plan, 5000, seed), { paths }).successCount / paths
    }
    expect(rich(3, 2000)).toBeGreaterThanOrEqual(0.9) // pré-condição do caso de borda
    expect(rich(3, 5000)).toBeLessThan(0.9)
    const res = sustainableSpending(input, { seed })
    expect(res.status).toBe('ok')
    expect(res.multiplier as number).toBeGreaterThan(2.5)
    expect(res.probability).toBeGreaterThanOrEqual(0.9)
  })

  it('alvo inalcançável ou folgado demais vira um status, não um número', () => {
    expect(sustainableSpending(andradeInput(), { seed, target: 1.01 }).status).toBe('abaixo_do_minimo')
    expect(sustainableSpending(andradeInput(), { seed, target: 0 }).status).toBe('acima_do_maximo')
  })
})

describe('menor idade de aposentadoria (Quando posso parar?)', () => {
  it('é a primeira idade com probabilidade ≥ 90%; um ano antes não chega ao alvo', () => {
    const res = earliestRetirement(andradeInput(), { seed })
    expect(res.status).toBe('ok')
    const age = res.age as number
    expect(res.probability as number).toBeGreaterThanOrEqual(0.9)
    expect(probability({ retirementAge: age })).toBe(res.probability)
    if (age > 52) expect(probability({ retirementAge: age - 1 })).toBeLessThan(0.9)
  })

  it('sem nenhuma idade possível, avisa', () => {
    expect(earliestRetirement(andradeInput({ spendingMultiplier: 3 }), { seed }).status).toBe('nenhuma_idade')
  })
})
