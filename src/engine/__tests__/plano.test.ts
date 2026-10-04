import { describe, expect, it } from 'vitest'
import { EngineInputError } from '../errors.ts'
import { buildPlan, isAboveSuitability } from '../plan.ts'
import { firstYearShockDeltas } from '../shocks.ts'
import { andradeInput, cma } from './helpers.ts'

// Passo de 12 meses: a data de referência da Andrade é 30/09/2026, então o passo t vai de out/(2026 + t) a
// set/(2027 + t); o último (t = 44) vai de out/2070 a ago/2071, com 11 meses. Fluxos anuais entram pro rata pelos
// meses do ano civil que caem no passo; eventos únicos e "a cada N anos" entram no seu mês (sem mês, julho).

describe('plano da Família Andrade', () => {
  const plan = buildPlan(andradeInput())

  it('começa com R$ 13,8 mi, 45 passos até ago/2071 (o último com 11 meses) e aposentadoria em 2036', () => {
    expect(plan.W0).toBe(13_800_000)
    expect(plan.T).toBe(45)
    expect(plan.startYear).toBe(2026)
    expect(plan.stepMonths[0]).toBe(12)
    expect(plan.stepMonths[43]).toBe(12)
    expect(plan.stepMonths[44]).toBe(11)
    expect(plan.stepFrac[44]).toBeCloseTo(11 / 12, 15)
    expect(plan.retirementYear).toBe(2036)
    // Ricardo se aposenta em mar/2036, dentro do passo 9 (out/2035 a set/2036): aposentado a partir do passo 10.
    expect(plan.retiredFrom).toBe(10)
    expect(plan.ages[0]).toBe(50)
    expect(plan.ages[45]).toBe(95)
    expect(plan.titularAges[0]).toBe(52)
    expect(plan.legacy).toBe(3_000_000)
  })

  it('soma renda, aluguel e dividendos até dez/2035, pro rata, e só o aluguel depois', () => {
    expect(plan.income[0]).toBe(1_764_000) // out/2026 a set/2027
    expect(plan.income[8]).toBe(1_764_000) // out/2034 a set/2035
    expect(plan.income[9]).toBeCloseTo((1_680_000 * 3) / 12 + 84_000, 6) // out/2035 a set/2036: 3 meses de pró-labore e dividendos
    expect(plan.income[10]).toBe(84_000)
    expect(plan.income[44]).toBeCloseTo((84_000 * 11) / 12, 6) // último passo, 11 meses
  })

  it('expande eventos anuais pro rata e eventos únicos e a cada N anos no seu mês (sem mês, julho)', () => {
    expect(plan.outflows[0]).toBeCloseTo((180_000 * 9) / 12, 6) // faculdade do Pedro, jan a set/2027
    expect(plan.outflows[1]).toBeCloseTo(180_000 + 400_000, 6) // faculdade + troca de carros em jul/2028
    expect(plan.outflows[4]).toBeCloseTo(180_000 + (180_000 * 9) / 12, 6) // Pedro o ano todo + Laura de jan a set/2031
    expect(plan.outflows[5]).toBeCloseTo((180_000 * 3) / 12 + 180_000, 6) // Pedro out a dez/2031 + Laura
    expect(plan.outflows[8]).toBeCloseTo(180_000 + 800_000, 6) // Laura + entrada do apartamento em jul/2035
    expect(plan.outflows[9]).toBeCloseTo((180_000 * 3) / 12, 6) // Laura de out a dez/2035
    expect(plan.outflows[31]).toBe(400_000) // carros em jul/2058
    expect(plan.outflows[36]).toBe(0)
    const carros = Array.from(plan.outflows).filter((v, t) => t >= 10 && v === 400_000).length
    expect(carros).toBe(5) // jul de 2038, 2043, 2048, 2053 e 2058
  })

  it('mantém os gastos do plano, pro rata no último passo, e não tem entradas', () => {
    expect(plan.essential[0]).toBe(660_000)
    expect(plan.lifestyle[43]).toBe(360_000)
    expect(plan.lifestyle[44]).toBeCloseTo((360_000 * 11) / 12, 6)
    expect(plan.inflows.every((v) => v === 0)).toBe(true)
  })
})

describe('hipóteses do "E se?"', () => {
  it('aposentar antes encerra pró-labore e dividendos antes; aposentar depois os estende', () => {
    // Aos 59, mar/2033: pró-labore e dividendos até dez/2032; aposentado a partir do passo que começa em out/2033.
    const cedo = buildPlan(andradeInput({ retirementAge: 59 }))
    expect(cedo.retiredFrom).toBe(7)
    expect(cedo.income[5]).toBe(1_764_000) // out/2031 a set/2032
    expect(cedo.income[6]).toBeCloseTo((1_680_000 * 3) / 12 + 84_000, 6) // out/2032 a set/2033
    expect(cedo.income[7]).toBe(84_000)
    // Aos 65, mar/2039: até dez/2038.
    const tarde = buildPlan(andradeInput({ retirementAge: 65 }))
    expect(tarde.retiredFrom).toBe(13)
    expect(tarde.income[11]).toBe(1_764_000) // out/2037 a set/2038
    expect(tarde.income[12]).toBeCloseTo((1_680_000 * 3) / 12 + 84_000, 6)
    expect(tarde.income[13]).toBe(84_000)
  })

  it('venda de imóvel entra no ano escolhido, pelo valor líquido, e encerra o aluguel daquele imóvel', () => {
    // Venda em julho do ano escolhido: jul/2030 cai no passo 3 (out/2029 a set/2030).
    const praia = buildPlan(andradeInput({ propertySales: [{ propertyId: 'casa-praia', year: 2030 }] }))
    expect(praia.inflows[3]).toBe(3_200_000)
    expect(praia.inflows.reduce((a, b) => a + b, 0)).toBe(3_200_000)
    // Sala vendida em jul/2040 (passo 13): o aluguel para em dez/2039.
    const input = andradeInput({ propertySales: [{ propertyId: 'sala', year: 2040 }] })
    input.household.otherAssets.find((a) => a.id === 'sala')!.netSaleValue = 1_100_000
    const sala = buildPlan(input)
    expect(sala.inflows[13]).toBe(1_100_000)
    expect(sala.income[12]).toBe(84_000) // out/2038 a set/2039
    expect(sala.income[13]).toBeCloseTo((84_000 * 3) / 12, 6) // out a dez/2039
    expect(sala.income[14]).toBe(0)
    expect(() => buildPlan(andradeInput({ propertySales: [{ propertyId: 'apto', year: 2030 }] }))).toThrowError(/não vendável/)
  })

  it('venda sem valor líquido informado é recusada, em vez de usar o valor declarado', () => {
    expect(() => buildPlan(andradeInput({ propertySales: [{ propertyId: 'sala', year: 2040 }] }))).toThrowError(/valor líquido de custos e impostos/)
  })

  it('horizonte mais longo no "E se?" estende os fluxos que vão até o fim do plano; mais curto, corta', () => {
    // Até ago/2076: 50 passos, o último (out/2075 a ago/2076) com 11 meses.
    const longo = buildPlan(andradeInput({ horizonAge: 100 }))
    expect(longo.T).toBe(50)
    expect(longo.essential[48]).toBe(660_000) // out/2074 a set/2075
    expect(longo.lifestyle[48]).toBe(360_000)
    expect(longo.income[48]).toBe(84_000) // aluguel da sala
    expect(longo.essential.subarray(0, 49).every((v) => v === 660_000)).toBe(true)
    expect(longo.essential[49]).toBeCloseTo((660_000 * 11) / 12, 6)
    const curto = buildPlan(andradeInput({ horizonAge: 90 }))
    expect(curto.T).toBe(40)
    expect(curto.ages[40]).toBe(90)
  })

  it('metas conflitantes: usa o horizonte mais longo e o maior legado, com aviso', () => {
    const input = andradeInput()
    input.household.goals = [
      { kind: 'padrao_de_vida', personId: 'helena', targetAge: 98 },
      { kind: 'legado', amount: 4_000_000 },
    ]
    const p = buildPlan(input)
    expect(p.T).toBe(48)
    expect(p.legacy).toBe(4_000_000)
    expect(p.warnings).toHaveLength(2)
    expect(buildPlan(andradeInput()).warnings).toHaveLength(0)
    input.household.goals = [{ kind: 'padrao_de_vida', personId: 'ninguem', targetAge: 95 }]
    expect(() => buildPlan(input)).toThrowError(/não está no plano/)
  })

  it('gastos mensais, multiplicador de gasto e renda por fonte', () => {
    const p = buildPlan(andradeInput({ essentialMonthly: 50_000, lifestyleMonthly: 20_000 }))
    expect(p.essential[13]).toBeCloseTo(600_000, 6)
    expect(p.lifestyle[13]).toBeCloseTo(240_000, 6)
    const mais = buildPlan(andradeInput({ spendingMultiplier: 1.1 }))
    expect(mais.essential[0]).toBeCloseTo(726_000, 6)
    expect(mais.lifestyle[0]).toBeCloseTo(396_000, 6)
    const renda = buildPlan(andradeInput({ incomes: [{ name: 'Pró-labore do Ricardo', monthly: 50_000 }] }))
    expect(renda.income[0]).toBe(600_000 + 480_000 + 84_000)
  })

  it('aportes e resgates pontuais entram como eventos', () => {
    // Sem mês, jul/2027, no passo 0; com mês, no mês informado (nov/2027 cai no passo 1).
    const p = buildPlan(andradeInput({ extraEvents: [{ name: 'Aporte', direction: 'entrada', amountReal: 500_000, year: 2027, recurrence: 'unica' }] }))
    expect(p.inflows[0]).toBe(500_000)
    const nov = buildPlan(andradeInput({ extraEvents: [{ name: 'Resgate', direction: 'saida', amountReal: 300_000, year: 2027, month: 11, recurrence: 'unica' }] }))
    expect(nov.outflows[1] - buildPlan(andradeInput()).outflows[1]).toBe(300_000)
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
