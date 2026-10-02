import { describe, expect, it } from 'vitest'
import { buildPlan, fullPlanFlows } from '../plan.ts'
import { projectWealth, requiredReturn, sustains } from '../requiredReturn.ts'
import { simulate } from '../simulate.ts'
import { andradeInput, flatCma, syntheticInput } from './helpers.ts'

const constant = (value: number, years: number) => new Float64Array(years).fill(value)

describe('T01 saque exato sem retorno', () => {
  const flows = constant(-50_000, 20)

  it('R$ 1.000.000 com déficit de R$ 50.000 no início de cada ano e r = 0 termina com patrimônio 0', () => {
    const p = projectWealth(1_000_000, flows, () => 0)
    expect(p.failedAt).toBe(-1)
    expect(p.wealth[20]).toBe(0)
  })

  it('benchmark pessoal de 0,00%', () => {
    const r = requiredReturn(1_000_000, flows, 0)
    expect(r.status).toBe('ok')
    expect(Math.abs(r.rate as number)).toBeLessThan(0.00005)
  })

  it('no motor completo, com retorno e volatilidade zero, o plano não falha e termina em 0', () => {
    const res = simulate(syntheticInput({ W0: 1_000_000, years: 20, deficit: 50_000, cma: flatCma(0, 0) }), { paths: 1000, seed: 1 })
    expect(res.successProbability).toBe(1)
    expect(Math.abs(res.percentiles.p50[20])).toBeLessThan(1e-6)
  })
})

describe('T02 saque que zera o patrimônio', () => {
  it('R$ 1.000.000 a 4% real por 30 anos: saque de R$ 55.605,86 no início do ano zera o patrimônio no fim do 30º ano', () => {
    const p = projectWealth(1_000_000, constant(-55_605.86, 30), () => 0.04)
    expect(p.failedAt).toBe(-1)
    expect(Math.abs(p.wealth[30])).toBeLessThan(1)
    // Um real a mais por ano já não fecha.
    expect(projectWealth(1_000_000, constant(-55_606.86, 30), () => 0.04).failedAt).toBe(29)
  })

  it('no motor completo, com 4% real e volatilidade zero, chega ao mesmo resultado', () => {
    const res = simulate(syntheticInput({ W0: 1_000_000, years: 30, deficit: 55_605.86, cma: flatCma(0.04, 0) }), { paths: 1000, seed: 1 })
    expect(res.successProbability).toBe(1)
    expect(Math.abs(res.percentiles.p50[30])).toBeLessThan(1)
  })
})

describe('T03 bisseção do benchmark', () => {
  it('R$ 1.000.000 com déficit de R$ 60.000 por 25 anos, sem legado: r* = 3,7366% (±0,001 p.p.)', () => {
    const r = requiredReturn(1_000_000, constant(-60_000, 25), 0)
    expect(r.status).toBe('ok')
    expect(Math.abs((r.rate as number) - 0.037366)).toBeLessThan(0.00001)
  })

  it('o r* encontrado é o menor que sustenta o plano', () => {
    const flows = constant(-60_000, 25)
    const r = requiredReturn(1_000_000, flows, 0).rate as number
    expect(sustains(1_000_000, flows, r, 0)).toBe(true)
    expect(sustains(1_000_000, flows, r - 1e-6, 0)).toBe(false)
  })

  it('Família Andrade: IPCA + 2,98% com legado de R$ 3 mi e 2,77% sem legado (±0,01 p.p.)', () => {
    const plan = buildPlan(andradeInput())
    const flows = fullPlanFlows(plan)
    expect(Math.abs((requiredReturn(plan.W0, flows, 3_000_000).rate as number) - 0.0298)).toBeLessThan(0.0001)
    expect(Math.abs((requiredReturn(plan.W0, flows, 0).rate as number) - 0.0277)).toBeLessThan(0.0001)
  })

  it('folga total quando o plano se sustenta até com −5%, e inviável quando nem 20% basta', () => {
    const folga = requiredReturn(10_000_000, constant(-10_000, 10), 0)
    expect(folga.status).toBe('folga_total')
    expect(folga.message).toMatch(/Folga total/)
    const inviavel = requiredReturn(100_000, constant(-500_000, 10), 0)
    expect(inviavel.status).toBe('inviavel')
    expect(inviavel.message).toMatch(/inviável/)
  })
})
