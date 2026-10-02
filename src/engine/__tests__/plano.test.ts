import { describe, expect, it } from 'vitest'
import { EngineInputError } from '../errors.ts'
import { buildPlan, isAboveSuitability } from '../plan.ts'
import { firstYearShockDeltas } from '../shocks.ts'
import { andradeInput, cma } from './helpers.ts'

const at = (arr: Float64Array, year: number) => arr[year - 2026]

describe('plano da Família Andrade', () => {
  const plan = buildPlan(andradeInput())

  it('começa com R$ 13,8 mi, 45 anos de horizonte e aposentadoria em 2036', () => {
    expect(plan.W0).toBe(13_800_000)
    expect(plan.T).toBe(45)
    expect(plan.startYear).toBe(2026)
    expect(plan.retirementYear).toBe(2036)
    expect(plan.retiredFrom).toBe(10)
    expect(plan.ages[0]).toBe(50)
    expect(plan.ages[45]).toBe(95)
    expect(plan.titularAges[0]).toBe(52)
    expect(plan.legacy).toBe(3_000_000)
  })

  it('soma renda, aluguel e dividendos até 2035 e só o aluguel depois', () => {
    expect(at(plan.income, 2026)).toBe(1_764_000)
    expect(at(plan.income, 2035)).toBe(1_764_000)
    expect(at(plan.income, 2036)).toBe(84_000)
    expect(at(plan.income, 2070)).toBe(84_000)
  })

  it('expande eventos únicos, anuais e a cada N anos', () => {
    expect(at(plan.outflows, 2026)).toBe(0)
    expect(at(plan.outflows, 2027)).toBe(180_000)
    expect(at(plan.outflows, 2028)).toBe(580_000) // faculdade + troca de carros
    expect(at(plan.outflows, 2031)).toBe(360_000) // duas faculdades
    expect(at(plan.outflows, 2035)).toBe(980_000) // faculdade + entrada do apartamento
    expect(at(plan.outflows, 2058)).toBe(400_000)
    expect(at(plan.outflows, 2063)).toBe(0)
    const carros = Array.from(plan.outflows).filter((v, t) => t + 2026 > 2035 && v === 400_000).length
    expect(carros).toBe(5) // 2038, 2043, 2048, 2053, 2058
  })

  it('mantém os gastos do plano e não tem entradas', () => {
    expect(at(plan.essential, 2026)).toBe(660_000)
    expect(at(plan.lifestyle, 2070)).toBe(360_000)
    expect(plan.inflows.every((v) => v === 0)).toBe(true)
  })
})

describe('hipóteses do "E se?"', () => {
  it('aposentar antes encerra pró-labore e dividendos antes; aposentar depois os estende', () => {
    const cedo = buildPlan(andradeInput({ retirementAge: 59 }))
    expect(cedo.retiredFrom).toBe(7)
    expect(at(cedo.income, 2032)).toBe(1_764_000)
    expect(at(cedo.income, 2033)).toBe(84_000)
    const tarde = buildPlan(andradeInput({ retirementAge: 65 }))
    expect(at(tarde.income, 2038)).toBe(1_764_000)
    expect(at(tarde.income, 2039)).toBe(84_000)
  })

  it('venda de imóvel entra no ano escolhido e encerra o aluguel daquele imóvel', () => {
    const praia = buildPlan(andradeInput({ propertySales: [{ propertyId: 'casa-praia', year: 2030 }] }))
    expect(at(praia.inflows, 2030)).toBe(3_200_000)
    const sala = buildPlan(andradeInput({ propertySales: [{ propertyId: 'sala', year: 2040 }] }))
    expect(at(sala.inflows, 2040)).toBe(1_200_000)
    expect(at(sala.income, 2039)).toBe(84_000)
    expect(at(sala.income, 2040)).toBe(0)
    expect(sala.warnings.some((w) => w.includes('valor líquido'))).toBe(true)
    expect(() => buildPlan(andradeInput({ propertySales: [{ propertyId: 'apto', year: 2030 }] }))).toThrowError(/não vendável/)
  })

  it('gastos mensais, multiplicador de gasto e renda por fonte', () => {
    const p = buildPlan(andradeInput({ essentialMonthly: 50_000, lifestyleMonthly: 20_000 }))
    expect(at(p.essential, 2040)).toBe(600_000)
    expect(at(p.lifestyle, 2040)).toBe(240_000)
    const mais = buildPlan(andradeInput({ spendingMultiplier: 1.1 }))
    expect(at(mais.essential, 2026)).toBeCloseTo(726_000, 6)
    expect(at(mais.lifestyle, 2026)).toBeCloseTo(396_000, 6)
    const renda = buildPlan(andradeInput({ incomes: [{ name: 'Pró-labore do Ricardo', monthly: 50_000 }] }))
    expect(at(renda.income, 2026)).toBe(600_000 + 480_000 + 84_000)
  })

  it('aportes e resgates pontuais entram como eventos', () => {
    const p = buildPlan(andradeInput({ extraEvents: [{ name: 'Aporte', direction: 'entrada', amountReal: 500_000, year: 2027, recurrence: 'unica' }] }))
    expect(at(p.inflows, 2027)).toBe(500_000)
  })

  it('horizonte, perfil, legado e regras vêm do cenário quando informados', () => {
    const p = buildPlan(andradeInput({ horizonAge: 100, profileId: 'arrojado', legacyMin: 0, rulesEnabled: false }))
    expect(p.T).toBe(50)
    expect(p.profileId).toBe('arrojado')
    expect(p.legacy).toBe(0)
    expect(p.rules.enabled).toBe(false)
  })

  it('choque do 1º ano: inteiro nas ações, proporcional à volatilidade nas outras classes de risco, fora do pós-fixado', () => {
    const d = firstYearShockDeltas(cma, -0.3)
    const k = (code: string) => cma.classes.findIndex((c) => c.code === code)
    expect(d[k('ACOES')]).toBeCloseTo(-0.3, 12)
    expect(d[k('FII')]).toBeCloseTo((-0.3 * 0.14) / 0.24, 12)
    expect(d[k('POS')]).toBe(0)
    const p = buildPlan(andradeInput({ firstYearShock: -0.3 }))
    expect(p.shockPre[0]).toBeLessThan(0)
    expect(p.shockPre[1]).toBe(0)
  })

  it('recusa entradas inválidas com erro claro', () => {
    expect(() => buildPlan(andradeInput({ profileId: 'inexistente' }))).toThrowError(EngineInputError)
    const torto = andradeInput()
    torto.profiles = [{ id: 'moderado', name: 'Moderado', weightsPre: { POS: 0.5, INF: 0.4 } }]
    expect(() => buildPlan(torto)).toThrowError(/somam 90.00%/)
    expect(() => buildPlan(andradeInput({ horizonAge: 40 }))).toThrowError(/já foi atingida/)
  })

  it('suitability: perfil acima do perfil de investidor é sinalizado', () => {
    expect(isAboveSuitability('arrojado', 'moderado')).toBe(true)
    expect(isAboveSuitability('moderado', 'moderado')).toBe(false)
    expect(isAboveSuitability('conservador', 'moderado')).toBe(false)
    expect(isAboveSuitability('moderado', 'desconhecido')).toBe(true)
  })
})
