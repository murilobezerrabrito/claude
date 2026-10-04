import { describe, expect, it } from 'vitest'
import dataset from '../../data/andrade-fechamentos.json'
import { monthReturn, performanceSummary, type PerformanceMonth } from '../performance.ts'
import type { HouseholdMonths } from '../types.ts'

const data = dataset as unknown as HouseholdMonths
const [setembro, outubro] = data.closings
const IPCA = { '2026-10': 0.004, '2026-11': 0.003 }

describe('T20 rentabilidade do mês', () => {
  it('Família Andrade, out/2026: Dietz modificado com o resgate de 15/10 (peso 16/31), deflacionado pelo IPCA', () => {
    const r = monthReturn({ refDate: outubro.refDate, startValue: setembro.officialPl, endValue: outubro.officialPl, flows: outubro.flows, ipca: data.ipca })
    const nominal = (11_450_961.29 - 12_000_000 + 300_000) / (12_000_000 - 300_000 * (16 / 31))
    expect(r.month).toBe('2026-10')
    expect(r.nominal).toBeCloseTo(nominal, 15)
    expect(r.real).toBeCloseTo((1 + nominal) / 1.004 - 1, 15)
    expect(r.real).toBeCloseTo(-0.024925, 6)
    expect(r.approximateDates).toBe(false)
    expect(r.implausible).toBe(false)
  })

  it('sem data do movimento: meio do mês, com a marca "datas aproximadas"', () => {
    const flows = [{ kind: 'aporte' as const, amount: 100_000 }, { kind: 'resgate' as const, amount: 40_000, date: '2026-10-31' }]
    const r = monthReturn({ refDate: '2026-10-31', startValue: 1_000_000, endValue: 1_080_000, flows, ipca: IPCA })
    // Aporte no meio do mês (peso 1/2); resgate no último dia (peso 0).
    expect(r.nominal).toBeCloseTo((1_080_000 - 1_000_000 - 60_000) / (1_000_000 + 50_000), 15)
    expect(r.approximateDates).toBe(true)
  })

  it('movimento no primeiro dia pesa (dias − 1) ÷ dias; sem movimentos, é a variação simples', () => {
    const r = monthReturn({ refDate: '2026-11-30', startValue: 1_000_000, endValue: 1_210_000, flows: [{ kind: 'aporte', amount: 200_000, date: '2026-11-01' }], ipca: IPCA })
    expect(r.nominal).toBeCloseTo(10_000 / (1_000_000 + 200_000 * (29 / 30)), 15)
    expect(monthReturn({ refDate: '2026-11-30', startValue: 1_000_000, endValue: 1_010_000, flows: [], ipca: IPCA }).nominal).toBeCloseTo(0.01, 15)
  })

  it('rentabilidade real fora de −10% a +10% pede confirmação', () => {
    const queda = monthReturn({ refDate: '2026-10-31', startValue: 1_000_000, endValue: 880_000, flows: [], ipca: IPCA })
    expect(queda.implausible).toBe(true)
    expect(monthReturn({ refDate: '2026-10-31', startValue: 1_000_000, endValue: 1_100_000, flows: [], ipca: IPCA }).implausible).toBe(false)
  })

  it('dados inválidos dão erro claro', () => {
    const base = { refDate: '2026-10-31', startValue: 1_000_000, endValue: 1_000_000, ipca: IPCA }
    expect(() => monthReturn({ ...base, flows: [{ kind: 'resgate', amount: 1, date: '2026-09-30' }] })).toThrowError(/não é do mês 2026-10/)
    expect(() => monthReturn({ ...base, flows: [{ kind: 'aporte', amount: 0 }] })).toThrowError(/valor positivo/)
    expect(() => monthReturn({ ...base, refDate: '2026-10-30', flows: [] })).toThrowError(/último dia/)
    expect(() => monthReturn({ ...base, refDate: '2026-12-31', flows: [] })).toThrowError(/Falta o IPCA de 2026-12/)
    expect(() => monthReturn({ ...base, startValue: 0, flows: [{ kind: 'resgate', amount: 10, date: '2026-10-01' }] })).toThrowError(/patrimônio médio/)
  })
})

describe('rentabilidade encadeada e benchmark pessoal acumulado', () => {
  const rStar = 0.03244
  const mensal = (1 + rStar) ** (1 / 12) - 1

  it('primeiros meses: "no ano" e "12 meses" ficam vazios; desde o início encadeia', () => {
    const history: PerformanceMonth[] = [
      { month: '2026-10', real: -0.025, benchmarkAnnual: rStar },
      { month: '2026-11', real: 0.01, benchmarkAnnual: 0.033 },
    ]
    const s = performanceSummary(history, '2026-11')
    expect(s.trackingSince).toBe('2026-09')
    expect(s.month.real).toBeCloseTo(0.01, 15)
    expect(s.yearToDate).toBeNull()
    expect(s.twelveMonths).toBeNull()
    expect(s.sinceStart.real).toBeCloseTo(0.975 * 1.01 - 1, 15)
    expect(s.sinceStart.benchmark).toBeCloseTo((1 + mensal) * 1.033 ** (1 / 12) - 1, 15)
    expect(s.sinceStart.months).toBe(2)
    // Em out/2026, só o mês: o benchmark de um mês com o r* de 3,244% publicado em setembro.
    expect(performanceSummary(history, '2026-10').month.benchmark).toBeCloseTo(mensal, 15)
  })

  it('com histórico desde dezembro, "no ano" aparece; com 12 meses, "12 meses" também', () => {
    const history: PerformanceMonth[] = []
    for (let i = 0; i < 13; i++) {
      const idx = 2025 * 12 + 11 + i // dez/2025 a dez/2026
      history.push({ month: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`, real: 0.005, benchmarkAnnual: rStar })
    }
    const s = performanceSummary(history, '2026-12')
    expect(s.trackingSince).toBe('2025-11')
    expect(s.yearToDate?.months).toBe(12)
    expect(s.yearToDate?.real).toBeCloseTo(1.005 ** 12 - 1, 12)
    expect(s.twelveMonths?.benchmark).toBeCloseTo(rStar, 12)
    expect(s.sinceStart.months).toBe(13)
    // Até mar/2026: no ano tem 3 meses, e 12 meses ainda não.
    const mar = performanceSummary(history, '2026-03')
    expect(mar.yearToDate?.months).toBe(3)
    expect(mar.twelveMonths).toBeNull()
  })

  it('a marca "datas aproximadas" acompanha todo período que inclui um mês com movimento sem data', () => {
    const s = performanceSummary(
      [
        { month: '2026-10', real: -0.025, benchmarkAnnual: rStar, approximateDates: true },
        { month: '2026-11', real: 0.01, benchmarkAnnual: rStar, approximateDates: false },
      ],
      '2026-11',
    )
    expect(s.month.approximateDates).toBe(false)
    expect(s.sinceStart.approximateDates).toBe(true)
  })

  it('sem r* em algum mês, o benchmark do período fica vazio; mês faltando no histórico é erro', () => {
    const s = performanceSummary([{ month: '2026-10', real: 0, benchmarkAnnual: null }, { month: '2026-11', real: 0, benchmarkAnnual: rStar }], '2026-11')
    expect(s.month.benchmark).toBeCloseTo(mensal, 15)
    expect(s.sinceStart.benchmark).toBeNull()
    expect(() => performanceSummary([{ month: '2026-09', real: 0, benchmarkAnnual: rStar }, { month: '2026-11', real: 0, benchmarkAnnual: rStar }], '2026-11')).toThrowError(/Falta a rentabilidade de 2026-10/)
    expect(() => performanceSummary([{ month: '2026-10', real: 0, benchmarkAnnual: rStar }], '2026-11')).toThrowError(/Falta a rentabilidade de 2026-11/)
  })
})
