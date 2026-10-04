import { describe, expect, it } from 'vitest'
import { buildPlan } from '../plan.ts'
import { classParams, yearDraws } from '../returns.ts'
import { marketFor, runPaths } from '../simulate.ts'
import type { Cma, SimInput } from '../types.ts'
import { andradeInput, cma, OPT, profiles } from './helpers.ts'

const seed = OPT.seed
const PATHS = 2000
/** Algumas (trajetória, ano) para conferir, inclusive anos depois do horizonte da Andrade. */
const POINTS: [number, number][] = [[0, 0], [1, 0], [0, 1], [17, 9], [1234, 44], [1999, 30], [42, 49]]

function market(input: SimInput) {
  const plan = buildPlan(input)
  return { plan, market: marketFor(input, plan, PATHS, seed) }
}

/** G e as normais de Q por código de classe, para comparar premissas com classes diferentes. */
function drawsByCode(c: Cma, path: number, year: number) {
  const d = yearDraws(classParams(c), seed, path, year)
  return { g: Object.fromEntries(c.classes.map((cls, k) => [cls.code, d.g[k]])), qn: Array.from(d.qn) }
}

function withoutClass(c: Cma, code: string): Cma {
  const keep = c.classes.map((cls, k) => (cls.code === code ? -1 : k)).filter((k) => k >= 0)
  return { ...c, classes: keep.map((k) => c.classes[k]), correlation: keep.map((a) => keep.map((b) => c.correlation[a][b])) }
}

function reversed(c: Cma): Cma {
  const order = c.classes.map((_, k) => c.classes.length - 1 - k)
  return { ...c, classes: order.map((k) => c.classes[k]), correlation: order.map((a) => order.map((b) => c.correlation[a][b])) }
}

function withExtraClass(c: Cma): Cma {
  const K = c.classes.length
  return {
    ...c,
    classes: [...c.classes, { code: 'OURO', name: 'Ouro', mu: 0.03, vol: 0.15 }],
    correlation: [...c.correlation.map((row) => [...row, 0]), [...new Array<number>(K).fill(0), 1]],
  }
}

describe('T16 sorteios alinhados', () => {
  it('patrimônio e plano diferentes, mesma semente: o mesmo mercado sorteado', () => {
    const base = market(andradeInput())
    const outra = andradeInput({ spendingMultiplier: 1.3, retirementAge: 58, extraEvents: [{ name: 'Resgate', direction: 'saida', amountReal: 500_000, year: 2028, recurrence: 'unica' }] })
    outra.household.cadmPositionsByClass.POS = 1_000_000
    const diferente = market(outra)
    expect(diferente.plan.W0).not.toBe(base.plan.W0)
    expect(diferente.market.grossPre).toEqual(base.market.grossPre)
  })

  it('horizonte diferente: o ano t de cada trajetória não muda', () => {
    const curto = market(andradeInput())
    const longo = market(andradeInput({ horizonAge: 100 }))
    const T = curto.plan.T
    expect(longo.plan.T).toBe(T + 5)
    let diferentes = 0
    for (let i = 0; i < PATHS; i++) {
      for (let t = 0; t < T; t++) if (longo.market.grossPre[i * (T + 5) + t] !== curto.market.grossPre[i * T + t]) diferentes++
    }
    expect(diferentes).toBe(0)
  })

  it('pesos diferentes: as carteiras combinam os mesmos retornos por classe', () => {
    const p = classParams(cma)
    for (const id of ['conservador', 'moderado', 'arrojado']) {
      const { plan, market: m } = market(andradeInput({ profileId: id }))
      for (const [i, t] of POINTS.filter(([, year]) => year < plan.T)) {
        const r = yearDraws(p, seed, i, t).r
        let gross = 0
        for (let k = 0; k < p.K; k++) gross += plan.weightsPre[k] * r[k]
        expect(m.grossPre[i * plan.T + t]).toBe(gross)
      }
    }
    expect(profiles).toHaveLength(3)
  })

  it('premissas diferentes (retorno, volatilidade e correlação): os mesmos G e Q', () => {
    const outra: Cma = {
      ...cma,
      version: 'outra',
      classes: cma.classes.map((c) => ({ ...c, mu: c.mu + 0.01, vol: c.vol * 1.5 })),
      correlation: cma.correlation.map((row, a) => row.map((_, b) => (a === b ? 1 : 0))),
    }
    for (const [i, t] of POINTS) {
      const a = yearDraws(classParams(cma), seed, i, t)
      const b = yearDraws(classParams(outra), seed, i, t)
      expect(b.g).toEqual(a.g)
      expect(b.qn).toEqual(a.qn)
      expect(b.r).not.toEqual(a.r)
    }
  })

  it('ν diferente: os mesmos G, e Q usa as mesmas normais (mais ou menos delas)', () => {
    for (const [i, t] of POINTS) {
      const nu5 = drawsByCode(cma, i, t)
      const nu7 = drawsByCode({ ...cma, nu: 7 }, i, t)
      const nu3 = drawsByCode({ ...cma, nu: 3 }, i, t)
      expect(nu7.g).toEqual(nu5.g)
      expect(nu3.g).toEqual(nu5.g)
      expect(nu7.qn.slice(0, 5)).toEqual(nu5.qn)
      expect(nu5.qn.slice(0, 3)).toEqual(nu3.qn)
    }
  })

  it('número e ordem de classes diferentes: cada classe mantém o seu G', () => {
    for (const [i, t] of POINTS) {
      const base = drawsByCode(cma, i, t)
      const semPre = drawsByCode(withoutClass(cma, 'PRE'), i, t)
      const invertida = drawsByCode(reversed(cma), i, t)
      const comOuro = drawsByCode(withExtraClass(cma), i, t)
      const semPreBase = Object.fromEntries(Object.entries(base.g).filter(([code]) => code !== 'PRE'))
      expect(semPre.g).toEqual(semPreBase)
      expect(invertida.g).toEqual(base.g)
      expect(comOuro.g).toMatchObject(base.g)
      expect(Object.keys(comOuro.g)).toContain('OURO')
      for (const d of [semPre, invertida, comOuro]) expect(d.qn).toEqual(base.qn)
    }
  })

  it('sorteios diferentes entre classes, anos, trajetórias e sementes', () => {
    const p = classParams(cma)
    const a = yearDraws(p, seed, 3, 7)
    expect(new Set(a.g).size).toBe(p.K)
    expect(yearDraws(p, seed, 3, 8).g).not.toEqual(a.g)
    expect(yearDraws(p, seed, 4, 7).g).not.toEqual(a.g)
    expect(yearDraws(p, seed + 1, 3, 7).g).not.toEqual(a.g)
    expect(yearDraws(p, seed, 3, 7)).toEqual(a)
  })
})

describe('T17 resgate pequeno', () => {
  // "A chance" do relatório e do app é a probabilidade sem gasto flexível.
  const resgate = { name: 'Resgate de R$ 1 mil', direction: 'saida' as const, amountReal: 1_000, year: 2027, recurrence: 'unica' as const }

  for (const multiplier of [1, 1.15, 1.3]) {
    it(`um resgate de R$ 1 mil nunca aumenta a chance, em nenhuma trajetória (gasto ×${multiplier})`, () => {
      for (const s of [1, 2, 3, 20261002]) {
        const base = andradeInput({ rulesEnabled: false, spendingMultiplier: multiplier })
        const plan = buildPlan(base)
        const m = marketFor(base, plan, PATHS, s)
        const antes = runPaths(plan, m, { keepWealth: true })

        const comEvento = runPaths(buildPlan(andradeInput({ rulesEnabled: false, spendingMultiplier: multiplier, extraEvents: [resgate] })), m, { keepWealth: true })
        const menosPatrimonio = andradeInput({ rulesEnabled: false, spendingMultiplier: multiplier })
        menosPatrimonio.household.cadmPositionsByClass.POS -= 1_000
        const comMenos = runPaths(buildPlan(menosPatrimonio), m, { keepWealth: true })

        for (const depois of [comEvento, comMenos]) {
          expect(depois.successCount).toBeLessThanOrEqual(antes.successCount)
          const wa = antes.wealth as Float64Array
          const wd = depois.wealth as Float64Array
          let maiores = 0
          for (let j = 0; j < wa.length; j++) if (wd[j] > wa[j]) maiores++
          expect(maiores).toBe(0)
        }
      }
    })
  }
})
