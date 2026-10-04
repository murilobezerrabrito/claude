import { describe, expect, it } from 'vitest'
import type { ProbabilityBand } from '../../engine/metrics.ts'
import type { Bridge, BridgeStepId } from '../attribution.ts'
import { BAND_COLORS, benchmarkSentence, bridgeSentence, factorPhrase, medianSentence, methodologyParagraphs, readingSentence, reportFooter, slackSentence, stepDescription } from '../texts.ts'
import type { ExternalFlow } from '../types.ts'

const plain = (s: string) => s.replace(/\u00a0/g, ' ')

/** Palavras de recomendação de produto, ativo ou alocação, que o texto automático nunca usa. */
const RECOMMENDATION = /\b(recomend\w*|sugir\w*|sugest\w*|sugerimos|aconselh\w*|dever(ia|iam|ão)|compre\w*|comprar|vend(a|am|er)\b|invist\w*|investir|apliqu\w*|aplicar|realoc\w*|aloqu\w*|alocar|troqu\w*|trocar|migr\w*|rebalanc\w*|reduz\w*|aument\w*)/i

const BANDS: ProbabilityBand[] = ['folga_grande', 'no_caminho', 'atencao', 'em_risco']
const STEPS: BridgeStepId[] = ['atualizacao_do_metodo', 'passagem_do_tempo', 'mercado', 'aportes_e_resgates', 'carteira', 'plano', 'premissas']
const FLOWS: ExternalFlow[][] = [
  [],
  [{ kind: 'resgate', amount: 300_000, date: '2026-10-15' }],
  [{ kind: 'resgate', amount: 100_000 }, { kind: 'resgate', amount: 50_000 }],
  [{ kind: 'aporte', amount: 1_000_000 }],
  [{ kind: 'aporte', amount: 10_000 }, { kind: 'aporte', amount: 20_000 }],
  [{ kind: 'aporte', amount: 10_000 }, { kind: 'resgate', amount: 20_000 }],
]

/** Ponte mínima para as frases: um passo dominante `main`, com `tenths` décimos de p.p. */
function bridge(main: BridgeStepId, tenths: number, flows: ExternalFlow[], start = 865): Bridge {
  const steps = STEPS.filter((s) => s !== 'atualizacao_do_metodo').map((id) => ({
    id,
    label: id,
    successDelta: id === main ? tenths * 10 : 0,
    requiredReturnDelta: id === main ? -tenths / 10_000 : 0,
    inputsHash: '',
    successCount: 0,
    requiredReturn: 0.03,
    wealth: 0,
  }))
  return {
    kind: 'ponte',
    paths: 10_000,
    fromMonth: '2026-09',
    toMonth: '2026-10',
    published: { successCount: start * 10, requiredReturn: 0.0324, inputsHash: '', engineVersion: '' },
    start: steps[0],
    steps,
    totalSuccessDelta: tenths * 10,
    totalRequiredReturnDelta: -tenths / 10_000,
    display: { startTenths: start, endTenths: start + tenths, bars: steps.map((s) => ({ id: s.id, label: s.id, tenths: s.id === main ? tenths : 0, noEffect: s.id !== main })) },
    plannedFlow: 62_248,
    monthNominalReturn: -0.021,
    externalFlows: flows,
  }
}

/** Todas as frases automáticas para um conjunto amplo de entradas. */
function allSentences(): string[] {
  const out: string[] = []
  for (const band of BANDS) {
    for (const channel of ['relatorio', 'app'] as const) {
      out.push(readingSentence({ probability: 0.62, horizonAge: 95, depletionAge: 85, band, channel }))
      out.push(readingSentence({ probability: 0.995, horizonAge: 95, depletionAge: null, band, channel }))
    }
    for (const to of BANDS) for (const main of STEPS) for (const flows of FLOWS) {
      const b = bridge(main === 'atualizacao_do_metodo' ? 'mercado' : main, -181, flows)
      out.push(bridgeSentence(b, { from: band, to }), benchmarkSentence(b, 0.038) ?? '')
      out.push(factorPhrase(main, flows))
      for (const nominal of [-0.021, 0.015]) for (const planned of [62_248, -40_000]) {
        out.push(stepDescription(main, { nominalReturn: nominal, plannedFlow: planned, ipcaMonth: 0.004, flows, planBaseMonth: '2026-10', cmaVersion: 'ilustrativa-2026-10' }))
      }
    }
  }
  out.push(medianSentence({ horizonAge: 95, medianFinal: 4_266_658 }), medianSentence({ horizonAge: 95, medianFinal: 0 }))
  out.push(...methodologyParagraphs({ paths: 10_000, feeRate: 0.008, horizonAge: 95 }))
  for (const status of ['ok', 'folga_total', 'inviavel'] as const) {
    for (const [e, r] of [[0.039, 0.038], [0.035, 0.038], [0.038, 0.038]]) out.push(slackSentence({ expectedReturn: e, requiredReturn: r, status }))
  }
  return out
}

describe('textos automáticos', () => {
  it('nunca recomendam produto, ativo ou alocação', () => {
    const sentences = allSentences()
    expect(sentences.length).toBeGreaterThan(500)
    for (const s of sentences) expect(s).not.toMatch(RECOMMENDATION)
  })

  it('o detector pega frases de recomendação', () => {
    for (const s of ['Recomendamos vender ações.', 'Sugerimos aumentar a renda fixa.', 'Invista no exterior.', 'Vale realocar a carteira.']) {
      expect(s).toMatch(RECOMMENDATION)
    }
  })

  it('frase de leitura, como nos exemplos do SPEC', () => {
    expect(readingSentence({ probability: 0.78, horizonAge: 95, depletionAge: 89, band: 'atencao', channel: 'relatorio' })).toBe(
      'Em 78 de cada 100 cenários o dinheiro dura até os 95. No cenário ruim, ele acaba aos 89. Vale revisar o plano na conversa do mês.',
    )
    expect(readingSentence({ probability: 0.78, horizonAge: 95, depletionAge: 89, band: 'atencao', channel: 'app' })).toMatch(/com seu assessor\.$/)
    expect(readingSentence({ probability: 0.9, horizonAge: 95, depletionAge: null, band: 'no_caminho', channel: 'relatorio' })).toBe(
      'Em 90 de cada 100 cenários o dinheiro dura até os 95. No cenário ruim, ele também dura até os 95.',
    )
  })

  it('frase da ponte: maior fator, aportes e resgates "fora do plano" e a faixa', () => {
    expect(plain(bridgeSentence(bridge('aportes_e_resgates', -12, [{ kind: 'resgate', amount: 300_000, date: '2026-10-15' }], 926), { from: 'no_caminho', to: 'no_caminho' }))).toBe(
      'A chance foi de 92,6% para 91,4% em outubro, principalmente pelo resgate de R$ 300 mil fora do plano (−1,2 p.p.). O plano continua na faixa verde.',
    )
    expect(plain(bridgeSentence(bridge('plano', -181, []), { from: 'no_caminho', to: 'em_risco' }))).toBe(
      'A chance foi de 86,5% para 68,4% em outubro, principalmente pela mudança no plano (−18,1 p.p.). O plano passou para a faixa vermelha.',
    )
    expect(bridgeSentence(bridge('mercado', 0, []), { from: 'atencao', to: 'atencao' })).toBe('A chance ficou em 86,5% em outubro. O plano continua na faixa amarela.')
    expect(BAND_COLORS.folga_grande).toBe('azul')
  })

  it('frase do benchmark só acima de 0,1 p.p.', () => {
    expect(benchmarkSentence(bridge('plano', -10, []), 0.0334)).toBeNull() // 0,10 p.p.: não passa de 0,1
    expect(plain(benchmarkSentence(bridge('plano', -38, []), 0.0362) as string)).toBe(
      'O retorno que o plano precisa foi de IPCA + 3,2% a.a. para IPCA + 3,6% a.a., principalmente pela mudança no plano (+0,38 p.p.).',
    )
  })

  it('descrição dos passos da ponte', () => {
    const ctx = { nominalReturn: -0.021, plannedFlow: 62_248, ipcaMonth: 0.004, flows: [{ kind: 'resgate' as const, amount: 300_000, date: '2026-10-15' }], planBaseMonth: '2026-10', cmaVersion: 'ilustrativa-2026-10' }
    expect(plain(stepDescription('passagem_do_tempo', ctx))).toBe(
      'Um mês a mais no calendário do plano: patrimônio e plano corrigidos pelo IPCA do mês (0,40%), com a entrada de R$ 62 mil que o plano previa para o mês.',
    )
    expect(stepDescription('mercado', ctx)).toBe('Rentabilidade da carteira no mês (−2,1%, antes da inflação) no lugar do IPCA.')
    expect(plain(stepDescription('aportes_e_resgates', ctx))).toBe('Resgate de R$ 300 mil em 15/10/2026. O patrimônio passa a ser o do fechamento.')
    expect(stepDescription('plano', ctx)).toMatch(/revisada em out\/2026/)
  })

  it('margem de segurança e rodapé', () => {
    expect(plain(slackSentence({ expectedReturn: 0.0391, requiredReturn: 0.0381, status: 'ok' }))).toBe(
      'O retorno esperado da carteira (IPCA + 3,9% a.a.) fica 0,1 p.p. acima do que o plano precisa (IPCA + 3,8% a.a.).',
    )
    expect(plain(slackSentence({ expectedReturn: 0.035, requiredReturn: 0.038, status: 'ok' }))).toMatch(/0,3 p\.p\. abaixo/)
    expect(reportFooter('2026-10', 'ilustrativa-2026-10')).toBe(
      'Relatório de acompanhamento do plano, preparado pela gestão da Aware Investments com as posições de out/2026 e as premissas ilustrativa-2026-10. Simulação ilustrativa; não é promessa de rentabilidade nem recomendação de investimento.',
    )
  })
})
