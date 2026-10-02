import { describe, expect, it } from 'vitest'
import { simulate } from '../simulate.ts'
import type { RulesMode } from '../types.ts'
import { andrade, andradeInput, OPT } from './helpers.ts'

const { floor, cap, noCutLastYears } = andrade.rules
const EPS = 1e-12

describe('T11 gasto flexível', () => {
  const off = simulate(andradeInput({ rulesEnabled: false }), OPT)

  for (const mode of ['trajetoria_referencia', 'guyton_klinger'] as RulesMode[]) {
    describe(mode, () => {
      const on = simulate(andradeInput({ rulesEnabled: true, rulesMode: mode }), { ...OPT, collectLifestyle: true })
      const T = on.T
      const mults = on.lifestyleMultipliers as Float64Array
      const retiredFrom = (on.retirementYear as number) - on.startYear

      it('regras ligadas, mesma semente: probabilidade maior ou igual à sem regras', () => {
        expect(on.successProbability).toBeGreaterThanOrEqual(off.successProbability)
        expect(on.cutProbability).toBeGreaterThan(0)
      })

      it('estilo de vida sempre entre o piso e o teto, e igual ao plano antes da aposentadoria', () => {
        for (let i = 0; i < on.paths; i++) {
          for (let t = 0; t < T; t++) {
            const m = mults[i * T + t]
            expect(m >= floor - EPS && m <= cap + EPS).toBe(true)
            if (t < retiredFrom) expect(m).toBe(1)
          }
        }
      })

      it(`nenhum corte nos últimos ${noCutLastYears} anos`, () => {
        for (let i = 0; i < on.paths; i++) {
          for (let t = Math.max(1, T - noCutLastYears); t < T; t++) {
            expect(mults[i * T + t]).toBeGreaterThanOrEqual(mults[i * T + t - 1] - EPS)
          }
        }
      })
    })
  }

  it('com regras desligadas não há corte nem métricas de corte', () => {
    expect(off.cutProbability).toBeNull()
    expect(off.medianMaxCut).toBeNull()
  })
})
