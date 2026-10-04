import { describe, expect, it } from 'vitest'
import { EngineInputError } from '../errors.ts'
import { buildPlan } from '../plan.ts'
import { simulate } from '../simulate.ts'
import type { SimResult } from '../types.ts'
import { andradeInput, OPT, profiles } from './helpers.ts'

/** O resultado sem o hash das entradas, que muda porque a entrada é escrita de outro jeito. */
const numbers = (r: SimResult) => ({ ...r, inputsHash: '' })
const weightsOf = (id: string) => ({ ...profiles.find((p) => p.id === id)!.weightsPre })

describe('T15 pesos explícitos', () => {
  for (const rulesEnabled of [false, true]) {
    it(`pesos iguais aos do perfil dão resultado idêntico, bit a bit, ao do profileId (regras ${rulesEnabled ? 'ligadas' : 'desligadas'})`, () => {
      const byProfile = simulate(andradeInput({ rulesEnabled }), { ...OPT, collectLifestyle: true })
      const household = andradeInput({ rulesEnabled })
      household.household.household.weights = weightsOf('moderado')
      const byHouseholdWeights = simulate(household, { ...OPT, collectLifestyle: true })
      const byScenarioWeights = simulate(andradeInput({ rulesEnabled, weights: weightsOf('moderado') }), { ...OPT, collectLifestyle: true })
      expect(numbers(byHouseholdWeights)).toEqual(numbers(byProfile))
      expect(numbers(byScenarioWeights)).toEqual(numbers(byProfile))
      expect(byHouseholdWeights.inputsHash).not.toBe(byProfile.inputsHash)
    })
  }

  it('pesos de outro perfil reproduzem esse perfil', () => {
    const arrojado = simulate(andradeInput({ rulesEnabled: false, profileId: 'arrojado' }), OPT)
    const pesos = simulate(andradeInput({ rulesEnabled: false, weights: weightsOf('arrojado') }), OPT)
    expect(numbers(pesos)).toEqual(numbers(arrojado))
  })

  it('a origem dos pesos fica no plano: perfil do cenário, pesos do cenário, pesos da família, perfil da família', () => {
    const input = andradeInput()
    input.household.household.weights = { POS: 0.6, INF: 0.4 }
    const familia = buildPlan(input)
    expect(familia.weightsSource).toBe('pesos')
    expect(familia.profileId).toBeNull()
    expect(familia.weightsPost).toBeNull()
    expect(Array.from(familia.weightsPre)).toEqual([0.6, 0.4, 0, 0, 0, 0, 0, 0])

    const perfilDoCenario = buildPlan({ ...input, scenario: { profileId: 'conservador' } })
    expect(perfilDoCenario.weightsSource).toBe('perfil')
    expect(perfilDoCenario.profileId).toBe('conservador')

    const pesosDoCenario = buildPlan({ ...input, scenario: { weights: { POS: 1 } } })
    expect(Array.from(pesosDoCenario.weightsPre)).toEqual([1, 0, 0, 0, 0, 0, 0, 0])

    const semPesos = buildPlan(andradeInput())
    expect(semPesos.weightsSource).toBe('perfil')
    expect(semPesos.profileId).toBe('moderado')
  })

  it('recusa pesos inválidos com erro claro', () => {
    expect(() => buildPlan(andradeInput({ weights: { POS: 0.5, INF: 0.4 } }))).toThrowError(/somam 90.00%/)
    expect(() => buildPlan(andradeInput({ weights: { POS: 1.2, INF: -0.2 } }))).toThrowError(/Peso inválido para INF/)
    expect(() => buildPlan(andradeInput({ weights: { POS: 0.5, CRIPTO: 0.5 } }))).toThrowError(/classe CRIPTO, que não está nas premissas/)
    expect(() => buildPlan(andradeInput({ weights: { POS: 1 }, profileId: 'moderado' }))).toThrowError(EngineInputError)
    expect(() => buildPlan(andradeInput({ weights: { POS: 1 }, profileId: 'moderado' }))).toThrowError(/perfil e pesos explícitos ao mesmo tempo/)
  })
})
