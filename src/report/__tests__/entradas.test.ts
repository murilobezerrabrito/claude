import { describe, expect, it } from 'vitest'
import { hashInputs } from '../../engine/hash.ts'
import { buildPlan } from '../../engine/plan.ts'
import { simulate } from '../../engine/simulate.ts'
import { correctPlan, formatMonth, ipcaFactor, parseMonth } from '../inflation.ts'
import { buildMonthInputs, checkClosing, currentWeights } from '../monthInputs.ts'
import { andrade, andradePlanV1, andradeRecord, andradeSeptember, cma, profiles } from './helpers.ts'

const IPCA = { '2026-10': 0.004, '2026-11': 0.0025, '2026-12': 0.005 }

describe('IPCA acumulado', () => {
  it('do mês seguinte ao mês-base até o mês de referência, inclusive', () => {
    expect(ipcaFactor(IPCA, '2026-09', '2026-09')).toBe(1)
    expect(ipcaFactor(IPCA, '2026-09', '2026-10')).toBe(1.004)
    expect(ipcaFactor(IPCA, '2026-09', '2026-12')).toBeCloseTo(1.004 * 1.0025 * 1.005, 15)
    expect(ipcaFactor(IPCA, '2026-10', '2026-12')).toBeCloseTo(1.0025 * 1.005, 15)
  })

  it('falta de IPCA, IPCA em porcentagem, mês inválido ou mês-base depois do mês de referência dão erro claro', () => {
    expect(() => ipcaFactor(IPCA, '2026-09', '2027-01')).toThrowError(/Falta o IPCA de 2027-01/)
    expect(() => ipcaFactor({ '2026-10': 0.4 }, '2026-09', '2026-10')).toThrowError(/em fração/)
    expect(() => ipcaFactor(IPCA, '2026-9', '2026-10')).toThrowError(/AAAA-MM/)
    expect(() => ipcaFactor(IPCA, '2026-11', '2026-10')).toThrowError(/depois do mês de referência/)
  })

  it('meses AAAA-MM e meses corridos', () => {
    expect(formatMonth(parseMonth('2026-10', 'teste'))).toBe('2026-10')
    expect(formatMonth(parseMonth('2026-12', 'teste') + 1)).toBe('2027-01')
  })
})

describe('plano corrigido pelo IPCA', () => {
  it('corrige fluxos, eventos, bens declarados e metas, em centavos, sem mexer em pessoas, anos e regras', () => {
    const v1 = andradePlanV1().snapshot
    const p = correctPlan(v1, 1.004)
    expect(p.otherAssets.find((a) => a.id === 'vgbl')?.value).toBe(1_807_200)
    expect(p.otherAssets.find((a) => a.id === 'casa-praia')?.netSaleValue).toBe(3_212_800)
    expect(p.otherAssets.find((a) => a.id === 'sala')?.annualIncome).toBe(84_336)
    expect(p.cashFlows.find((c) => c.kind === 'gasto_estilo')?.annualAmountReal).toBe(361_440)
    expect(p.events.find((e) => e.name === 'Troca de carros')?.amountReal).toBe(401_600)
    expect(p.goals.find((g) => g.kind === 'legado')?.amount).toBe(3_012_000)
    expect(p.people).toEqual(v1.people)
    expect(p.rules).toEqual(v1.rules)
    expect(p.cashFlows.map((c) => [c.startYear, c.endYear])).toEqual(v1.cashFlows.map((c) => [c.startYear, c.endYear]))
    expect(v1.cashFlows.find((c) => c.kind === 'gasto_estilo')?.annualAmountReal).toBe(360_000) // o original não muda
    expect(correctPlan(v1, 1.0025 * 1.004).cashFlows[0].annualAmountReal).toBe(1_207_812) // 1.200.000 × 1,004 × 1,0025
  })
})

describe('entradas do mês', () => {
  it('setembro/2026 (mês-base do plano): as mesmas entradas da Família Andrade, com o mesmo hash e o mesmo resultado', () => {
    const m = buildMonthInputs({ household: andradeRecord(), planVersion: andradePlanV1(), closing: andradeSeptember(), ipca: IPCA, cma, profiles })
    expect(m.refMonth).toBe('2026-09')
    expect(m.ipcaFactor).toBe(1)
    expect(m.seed).toBe(20261002)
    expect(m.input.household).toEqual(andrade)
    const direto = { household: andrade, cma, profiles }
    const opt = { paths: 1000, seed: m.seed }
    expect(hashInputs({ input: m.input, ...opt })).toBe(hashInputs({ input: direto, ...opt }))
    expect(simulate(m.input, opt).percentiles).toEqual(simulate(direto, opt).percentiles)
  })

  it('outubro/2026 com o plano de setembro: o plano vai para reais de outubro e o gasto não encolhe em termos reais', () => {
    const closing = { ...andradeSeptember(), refDate: '2026-10-31' }
    const m = buildMonthInputs({ household: andradeRecord(), planVersion: andradePlanV1(), closing, ipca: IPCA, cma, profiles })
    expect(m.refMonth).toBe('2026-10')
    expect(m.ipcaFactor).toBe(1.004)
    expect(m.input.household.household.referenceDate).toBe('2026-10-31')
    expect(m.input.household.household.legacyMin).toBe(3_012_000)
    const plan = buildPlan(m.input)
    // Primeiro mês (nov/2026): gasto de R$ 85 mil de setembro, em reais de outubro.
    expect(plan.firstMonthEssential + plan.firstMonthLifestyle).toBeCloseTo(85_000 * 1.004, 6)
    expect(plan.W0).toBe(12_000_000 + 1_807_200)
    // Legado do cadastro e meta de legado corrigidos juntos: nenhum aviso de divergência.
    expect(plan.warnings).toHaveLength(0)
    expect(plan.legacy).toBe(3_012_000)
  })

  it('conferência: a soma das posições precisa bater com o PL oficial em 0,01%', () => {
    const ok = { ...andradeSeptember(), officialPl: 12_000_000 + 1_199 }
    expect(checkClosing(ok)).toBe('2026-09')
    const fora = { ...andradeSeptember(), officialPl: 12_000_000 + 1_300 }
    expect(() => checkClosing(fora)).toThrowError(/não bate com o PL oficial/)
    expect(() => buildMonthInputs({ household: andradeRecord(), planVersion: andradePlanV1(), closing: fora, ipca: IPCA, cma, profiles })).toThrowError(/fora do fechamento/)
    expect(() => checkClosing({ ...andradeSeptember(), refDate: '2026-09-29' })).toThrowError(/último dia de um mês/)
    expect(() => checkClosing({ ...andradeSeptember(), positionsByClass: { POS: -1 } })).toThrowError(/Posição inválida/)
  })

  it('plano com mês-base depois do fechamento, ou sem o IPCA do mês, não roda', () => {
    const v2 = { ...andradePlanV1(), baseMonth: '2026-10' }
    expect(() => buildMonthInputs({ household: andradeRecord(), planVersion: v2, closing: andradeSeptember(), ipca: IPCA, cma, profiles })).toThrowError(/depois do mês de referência/)
    const closing = { ...andradeSeptember(), refDate: '2026-10-31' }
    expect(() => buildMonthInputs({ household: andradeRecord(), planVersion: andradePlanV1(), closing, ipca: {}, cma, profiles })).toThrowError(/Falta o IPCA de 2026-10/)
  })

  it('cliente AI: os pesos são a carteira atual por classe, com os bens que entram na simulação', () => {
    const household = andradeRecord({ channel: 'ai', weightsSource: 'carteira_atual' })
    const m = buildMonthInputs({ household, planVersion: andradePlanV1(), closing: andradeSeptember(), ipca: IPCA, cma, profiles })
    const w = m.input.household.household.weights as Record<string, number>
    // POS: R$ 3 mi da carteira + R$ 1,8 mi do VGBL, sobre R$ 13,8 mi.
    expect(w.POS).toBeCloseTo(4_800_000 / 13_800_000, 15)
    expect(w.ACOES).toBeCloseTo(960_000 / 13_800_000, 15)
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    const plan = buildPlan(m.input)
    expect(plan.weightsSource).toBe('pesos')
    expect(plan.profileId).toBeNull()
  })

  it('carteira atual: bem na simulação sem classe, ou carteira vazia, dá erro claro', () => {
    expect(() => currentWeights({}, [{ id: 'x', kind: 'previdencia', name: 'PGBL', value: 10, inSimulation: true }])).toThrowError(/"PGBL".*classe/)
    expect(() => currentWeights({ POS: 0 }, [])).toThrowError(/vazia/)
  })
})
