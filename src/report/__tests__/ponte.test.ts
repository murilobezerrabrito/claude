import { describe, expect, it } from 'vitest'
import dataset from '../../data/andrade-fechamentos.json'
import { bridgeDisplay, monthAttribution, type Bridge } from '../attribution.ts'
import { planVersionFor } from '../monthInputs.ts'
import { officialRun, type MonthPackage } from '../officialRun.ts'
import type { HouseholdMonths, HouseholdRecord, MonthClosing } from '../types.ts'
import { cma, profiles } from './helpers.ts'

const data = dataset as unknown as HouseholdMonths
const pkg = (closing: MonthClosing, household: HouseholdRecord = data.household): MonthPackage => ({
  household,
  planVersion: planVersionFor(data.planVersions, closing.refDate.slice(0, 7)),
  closing,
  cma,
  profiles,
})
const setembro = pkg(data.closings[0])
const outubro = pkg(data.closings[1])

// Rodadas oficiais (10.000 trajetórias) e a ponte de setembro para outubro de 2026.
const publicadoSet = officialRun(setembro, data.ipca)
const oficialOut = officialRun(outubro, data.ipca)
const ponte = monthAttribution({ previous: { pkg: setembro, published: publicadoSet }, current: outubro, ipca: data.ipca }) as Bridge

describe('T19 ponte "o que mudou no mês"', () => {
  it('estado inicial com o hash da rodada oficial de setembro; final com o da rodada de outubro', () => {
    expect(ponte.kind).toBe('ponte')
    expect(ponte.paths).toBe(10_000)
    expect(ponte.start.inputsHash).toBe(publicadoSet.inputsHash)
    expect(ponte.start.successCount).toBe(publicadoSet.successCount)
    const fim = ponte.steps[ponte.steps.length - 1]
    expect(fim.inputsHash).toBe(oficialOut.inputsHash)
    expect(fim.successCount).toBe(oficialOut.successCount)
    expect(fim.requiredReturn).toBe(oficialOut.requiredReturn)
  })

  it('seis passos na ordem fixa; a soma das barras, em trajetórias, é a variação total', () => {
    expect(ponte.steps.map((s) => s.id)).toEqual(['passagem_do_tempo', 'mercado', 'aportes_e_resgates', 'carteira', 'plano', 'premissas'])
    const soma = ponte.steps.reduce((a, s) => a + s.successDelta, 0)
    expect(soma).toBe(ponte.totalSuccessDelta)
    expect(ponte.totalSuccessDelta).toBe(oficialOut.successCount - publicadoSet.successCount)
    for (const s of ponte.steps) expect(Number.isInteger(s.successDelta)).toBe(true)
  })

  it('a variação do benchmark pessoal é decomposta na mesma ordem', () => {
    const soma = ponte.steps.reduce((a, s) => a + (s.requiredReturnDelta as number), 0)
    expect(soma).toBeCloseTo(ponte.totalRequiredReturnDelta as number, 12)
    expect(ponte.totalRequiredReturnDelta).toBeCloseTo((oficialOut.requiredReturn as number) - (publicadoSet.requiredReturn as number), 15)
  })

  it('cada entrada num único passo: sem mudança de carteira nem de premissas, esses passos não mexem em nada', () => {
    const i = ponte.steps.findIndex((s) => s.id === 'carteira')
    expect(ponte.steps[i].successDelta).toBe(0)
    expect(ponte.steps[i].inputsHash).toBe(ponte.steps[i - 1].inputsHash)
    const premissas = ponte.steps[ponte.steps.length - 1]
    expect(premissas.successDelta).toBe(0)
    expect(premissas.inputsHash).toBe(ponte.steps[ponte.steps.length - 2].inputsHash)
  })

  it('passagem do tempo e mercado: o fluxo previsto para outubro (R$ 62 mil de setembro, em reais de outubro) entra no patrimônio', () => {
    expect(ponte.plannedFlow).toBe(62_248)
    const [tempo, mercado, aportes] = ponte.steps
    // Carteira de R$ 12 mi × 1,004 + o fluxo previsto, mais o VGBL corrigido (R$ 1.807.200).
    expect(tempo.wealth).toBeCloseTo(12_000_000 * 1.004 + 62_248 + 1_807_200, 2)
    expect(mercado.wealth).toBeCloseTo(12_000_000 * (1 + ponte.monthNominalReturn) + 62_248 + 1_807_200, 1)
    expect(aportes.wealth).toBeCloseTo(11_450_961.29 + 1_807_200, 2)
    expect(ponte.externalFlows).toEqual(data.closings[1].flows)
  })

  it('página 3: décimos de p.p.; o resíduo de arredondamento vai para a maior barra; abaixo de 0,05 p.p., "sem efeito"', () => {
    const { startTenths, endTenths, bars } = ponte.display
    expect(startTenths).toBe(Math.round(publicadoSet.probability * 1000))
    expect(endTenths).toBe(Math.round(oficialOut.probability * 1000))
    expect(bars.reduce((a, b) => a + b.tenths, 0)).toBe(endTenths - startTenths)
    const raw = ponte.steps.map((s) => (s.successDelta * 1000) / ponte.paths)
    const maior = raw.reduce((best, v, i) => (Math.abs(v) > Math.abs(raw[best]) ? i : best), 0)
    bars.forEach((b, i) => {
      if (i !== maior) expect(b.tenths).toBe(Math.sign(raw[i]) * Math.round(Math.abs(raw[i])))
      expect(b.noEffect).toBe(Math.abs(raw[i]) < 0.5)
    })
    expect(bars.find((b) => b.id === 'carteira')?.noEffect).toBe(true)
  })

  it('primeiro mês da família: sem ponte', () => {
    expect(monthAttribution({ previous: null, current: setembro, ipca: data.ipca })).toEqual({ kind: 'primeiro_mes' })
  })
})

describe('página 3: arredondamento das barras', () => {
  const step = (id: Bridge['steps'][number]['id'], successDelta: number) => ({ id, label: id, successDelta })

  it('o resíduo que cai numa barra pequena a tira de "sem efeito"', () => {
    // Duas barras de +4 trajetórias (0,04 p.p. cada) com os extremos em 50,0% e 50,1%: a soma tem de dar +0,1 p.p.
    const d = bridgeDisplay(5_000, [step('mercado', 4), step('plano', 4)], 5_008, 10_000)
    expect(d.endTenths - d.startTenths).toBe(1)
    expect(d.bars.reduce((a, b) => a + b.tenths, 0)).toBe(1)
    expect(d.bars[0]).toMatchObject({ tenths: 1, noEffect: false })
    expect(d.bars[1]).toMatchObject({ tenths: 0, noEffect: true })
  })

  it('meio décimo arredonda para longe do zero, nos dois sentidos', () => {
    const d = bridgeDisplay(5_000, [step('mercado', -5), step('plano', 5)], 5_000, 10_000)
    expect(d.bars.map((b) => b.tenths)).toEqual([-1, 1])
    expect(d.bars.every((b) => !b.noEffect)).toBe(true)
  })
})

describe('ponte: casos de borda (2.000 trajetórias)', () => {
  const paths = 2000
  const publicado = officialRun(setembro, data.ipca, { paths })

  it('se o motor atual refaz outro número, a primeira barra é "Atualização do método", e a soma parte do publicado', () => {
    const antigo = { ...publicado, successCount: publicado.successCount + 25, requiredReturn: (publicado.requiredReturn as number) - 0.001 }
    const p = monthAttribution({ previous: { pkg: setembro, published: antigo }, current: outubro, ipca: data.ipca, paths }) as Bridge
    expect(p.steps[0].id).toBe('atualizacao_do_metodo')
    expect(p.steps[0].successDelta).toBe(-25)
    expect(p.steps[0].requiredReturnDelta).toBeCloseTo(0.001, 15)
    expect(p.steps).toHaveLength(7)
    expect(p.steps.reduce((a, s) => a + s.successDelta, 0)).toBe(p.totalSuccessDelta)
    expect(p.totalSuccessDelta).toBe(p.steps[6].successCount - antigo.successCount)
    expect(p.display.bars.reduce((a, b) => a + b.tenths, 0)).toBe(p.display.endTenths - p.display.startTenths)
    // Sem diferença, não há essa barra.
    const igual = monthAttribution({ previous: { pkg: setembro, published: publicado }, current: outubro, ipca: data.ipca, paths }) as Bridge
    expect(igual.steps[0].id).toBe('passagem_do_tempo')
  })

  it('cliente AI: os pesos do mês anterior ficam até o passo "Carteira", que troca pela carteira do fechamento', () => {
    const ai = { ...data.household, channel: 'ai' as const, weightsSource: 'carteira_atual' as const }
    const prev = pkg(data.closings[0], ai)
    const cur = pkg(data.closings[1], ai)
    const p = monthAttribution({ previous: { pkg: prev, published: officialRun(prev, data.ipca, { paths }) }, current: cur, ipca: data.ipca, paths }) as Bridge
    const i = p.steps.findIndex((s) => s.id === 'carteira')
    // Em outubro, a carteira mudou (ações caíram mais, resgate do pós-fixado): os pesos mudam só no passo 4.
    expect(p.steps[i].inputsHash).not.toBe(p.steps[i - 1].inputsHash)
    expect(p.steps[p.steps.length - 1].inputsHash).toBe(officialRun(cur, data.ipca, { paths }).inputsHash)
  })

  it('meses fora de sequência, semente diferente ou outro número de trajetórias: erro claro', () => {
    const novembro = pkg({ ...data.closings[1], refDate: '2026-11-30' })
    expect(() => monthAttribution({ previous: { pkg: setembro, published: publicado }, current: novembro, ipca: { ...data.ipca, '2026-11': 0.003 }, paths })).toThrowError(/meses seguidos/)
    const outraSemente = pkg(data.closings[1], { ...data.household, seed: 1 })
    expect(() => monthAttribution({ previous: { pkg: setembro, published: publicado }, current: outraSemente, ipca: data.ipca, paths })).toThrowError(/semente/)
    expect(() => monthAttribution({ previous: { pkg: setembro, published: publicado }, current: outubro, ipca: data.ipca })).toThrowError(/trajetórias/)
  })
})
