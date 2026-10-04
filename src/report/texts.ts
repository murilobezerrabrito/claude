// Textos automáticos do relatório (SPEC, "Linguagem", "Exemplos de texto" e "Textos de aviso"). Frases curtas, em
// português do Brasil, que nunca recomendam produto, ativo ou alocação. Os avisos legais são os rascunhos do SPEC,
// copiados sem mudança, até compliance aprovar.

import type { ProbabilityBand } from '../engine/metrics.ts'
import type { RequiredReturnStatus } from '../engine/types.ts'
import {
  formatDate,
  formatFrequency,
  formatMoney,
  formatMonthLabel,
  formatPercent,
  formatPp,
  formatRealReturn,
  formatSignedPercent,
  formatTenthsPercent,
  formatTenthsPp,
  monthName,
} from '../lib/format.ts'
import type { Bridge, BridgeStepId } from './attribution.ts'
import type { ExternalFlow } from './types.ts'

export const BAND_LABELS: Record<ProbabilityBand, string> = {
  folga_grande: 'Folga grande',
  no_caminho: 'No caminho',
  atencao: 'Atenção',
  em_risco: 'Plano em risco',
}

/** Cor da faixa, no feminino ("faixa verde"). */
export const BAND_COLORS: Record<ProbabilityBand, string> = {
  folga_grande: 'azul',
  no_caminho: 'verde',
  atencao: 'amarela',
  em_risco: 'vermelha',
}

/** Onde a frase aparece: no relatório da CADM ou no app da AI. */
export type TextChannel = 'relatorio' | 'app'

/**
 * Frase de leitura: "Em 78 de cada 100 cenários o dinheiro dura até os 95. No cenário ruim, ele acaba aos 89."
 * Nas faixas amarela e vermelha, completa com o convite a revisar o plano.
 */
export function readingSentence(o: { probability: number; horizonAge: number; depletionAge: number | null; band: ProbabilityBand; channel: TextChannel }): string {
  const parts = [`Em ${formatFrequency(o.probability)} o dinheiro dura até os ${o.horizonAge}.`]
  parts.push(o.depletionAge === null ? `No cenário ruim, ele também dura até os ${o.horizonAge}.` : `No cenário ruim, ele acaba aos ${o.depletionAge}.`)
  if (o.band === 'atencao' || o.band === 'em_risco') {
    parts.push(o.channel === 'relatorio' ? 'Vale revisar o plano na conversa do mês.' : 'Vale revisar o plano com seu assessor.')
  }
  return parts.join(' ')
}

/** "No cenário do meio, vocês chegam aos 95 anos com R$ 9,8 mi em valores de hoje." */
export function medianSentence(o: { horizonAge: number; medianFinal: number }): string {
  if (o.medianFinal <= 0) return `No cenário do meio, o dinheiro não chega aos ${o.horizonAge} anos.`
  return `No cenário do meio, vocês chegam aos ${o.horizonAge} anos com ${formatMoney(o.medianFinal)} em valores de hoje.`
}

/** Margem de segurança: o retorno esperado da carteira contra o retorno que o plano precisa. */
export function slackSentence(o: { expectedReturn: number; requiredReturn: number | null; status: RequiredReturnStatus }): string {
  if (o.status === 'folga_total') return 'Folga total: o plano se sustenta mesmo com retorno real negativo.'
  if (o.status === 'inviavel' || o.requiredReturn === null) return 'Plano inviável sem ajustes: nem um retorno de IPCA + 20% a.a. sustenta o plano.'
  const diff = o.expectedReturn - o.requiredReturn
  const where = Math.abs(diff) < 0.0005 ? 'fica no mesmo nível do' : diff > 0 ? `fica ${formatPp(Math.abs(diff)).replace('+', '')} acima do` : `fica ${formatPp(Math.abs(diff)).replace('+', '')} abaixo do`
  return `O retorno esperado da carteira (${formatRealReturn(o.expectedReturn)}) ${where} que o plano precisa (${formatRealReturn(o.requiredReturn)}).`
}

const brlFlows = (flows: ExternalFlow[], kind: ExternalFlow['kind']) => flows.filter((f) => f.kind === kind)

/** O fator da ponte numa frase ("pela mudança no plano"); aportes e resgates sempre "fora do plano". */
export function factorPhrase(id: BridgeStepId, flows: ExternalFlow[]): string {
  switch (id) {
    case 'atualizacao_do_metodo':
      return 'pela atualização do método de cálculo'
    case 'passagem_do_tempo':
      return 'pela passagem do tempo'
    case 'mercado':
      return 'pelo mercado do mês'
    case 'aportes_e_resgates': {
      const aportes = brlFlows(flows, 'aporte')
      const resgates = brlFlows(flows, 'resgate')
      const total = (list: ExternalFlow[]) => formatMoney(list.reduce((a, f) => a + f.amount, 0))
      if (aportes.length > 0 && resgates.length > 0) return 'pelos aportes e resgates fora do plano'
      if (resgates.length === 1) return `pelo resgate de ${total(resgates)} fora do plano`
      if (resgates.length > 1) return `pelos resgates de ${total(resgates)} fora do plano`
      if (aportes.length === 1) return `pelo aporte de ${total(aportes)} fora do plano`
      if (aportes.length > 1) return `pelos aportes de ${total(aportes)} fora do plano`
      return 'pela diferença entre o fluxo previsto no plano e o que entrou na carteira'
    }
    case 'carteira':
      return 'pela mudança na carteira'
    case 'plano':
      return 'pela mudança no plano'
    case 'premissas':
      return 'pelas novas premissas'
  }
}

/**
 * Frase da ponte: "A chance foi de 92,6% para 91,4% em outubro, principalmente pelo resgate de R$ 300 mil fora do
 * plano (−0,9 p.p.). O plano continua na faixa verde." Cita só o maior fator.
 */
export function bridgeSentence(b: Bridge, bands: { from: ProbabilityBand; to: ProbabilityBand }): string {
  const { startTenths, endTenths, bars } = b.display
  const month = monthName(b.toMonth)
  const parts: string[] = []
  if (startTenths === endTenths) parts.push(`A chance ficou em ${formatTenthsPercent(endTenths)} em ${month}.`)
  else {
    let main = bars[0]
    for (const bar of bars) if (Math.abs(bar.tenths) > Math.abs(main.tenths)) main = bar
    const why = main.noEffect ? '' : `, principalmente ${factorPhrase(main.id, b.externalFlows)} (${formatTenthsPp(main.tenths)})`
    parts.push(`A chance foi de ${formatTenthsPercent(startTenths)} para ${formatTenthsPercent(endTenths)} em ${month}${why}.`)
  }
  const color = BAND_COLORS[bands.to]
  parts.push(bands.from === bands.to ? `O plano continua na faixa ${color}.` : `O plano passou para a faixa ${color}.`)
  return parts.join(' ')
}

/** Variação do r* acima da qual a ponte também o cita numa frase (0,1 p.p.). */
export const BENCHMARK_SENTENCE_MIN = 0.001

/** Frase do benchmark pessoal na ponte, só quando ele muda mais de 0,1 p.p.; null caso contrário. */
export function benchmarkSentence(b: Bridge, to: number | null): string | null {
  const total = b.totalRequiredReturnDelta
  const from = b.published.requiredReturn
  if (total === null || from === null || to === null || Math.abs(total) <= BENCHMARK_SENTENCE_MIN) return null
  let main = b.steps[0]
  for (const s of b.steps) if (Math.abs(s.requiredReturnDelta ?? 0) > Math.abs(main.requiredReturnDelta ?? 0)) main = s
  return (
    `O retorno que o plano precisa foi de ${formatRealReturn(from)} para ${formatRealReturn(to)}, ` +
    `principalmente ${factorPhrase(main.id, b.externalFlows)} (${formatPp(main.requiredReturnDelta ?? 0, 2)}).`
  )
}

/** O que cada passo da ponte trocou, para a tabela da página 3. */
export function stepDescription(
  id: BridgeStepId,
  ctx: { nominalReturn: number; plannedFlow: number; ipcaMonth: number; flows: ExternalFlow[]; planBaseMonth: string; cmaVersion: string },
): string {
  switch (id) {
    case 'atualizacao_do_metodo':
      return 'O número do mês passado refeito com a versão atual do cálculo.'
    case 'passagem_do_tempo': {
      const flow = ctx.plannedFlow >= 0 ? `a entrada de ${formatMoney(ctx.plannedFlow)}` : `a saída de ${formatMoney(-ctx.plannedFlow)}`
      return `Um mês a mais no calendário do plano: patrimônio e plano corrigidos pelo IPCA do mês (${formatPercent(ctx.ipcaMonth, 2)}), com ${flow} que o plano previa para o mês.`
    }
    case 'mercado':
      return `Rentabilidade da carteira no mês (${formatSignedPercent(ctx.nominalReturn)}, antes da inflação) no lugar do IPCA.`
    case 'aportes_e_resgates': {
      const list = ctx.flows.map((f) => `${f.kind === 'aporte' ? 'Aporte' : 'Resgate'} de ${formatMoney(f.amount)}${f.date ? ` em ${formatDate(f.date)}` : ' (data aproximada)'}`)
      return `${list.length > 0 ? list.join('; ') : 'Sem aportes nem resgates no mês'}. O patrimônio passa a ser o do fechamento.`
    }
    case 'carteira':
      return 'Pesos por classe e custo da carteira no fechamento.'
    case 'plano':
      return `Versão do plano em vigor, revisada em ${formatMonthLabel(ctx.planBaseMonth)}: fluxos, metas, horizonte e bens declarados.`
    case 'premissas':
      return `Premissas vigentes no fechamento (${ctx.cmaVersion}).`
  }
}

/** Metodologia em linguagem simples (página 7). */
export function methodologyParagraphs(o: { paths: number; feeRate: number; horizonAge: number }): string[] {
  const paths = o.paths.toLocaleString('pt-BR')
  return [
    `Simulamos ${paths} cenários para o rendimento de cada classe de ativo, ano a ano, até o fim do horizonte do plano (${o.horizonAge} anos). ` +
      'Os cenários seguem as premissas de retorno, oscilação e correlação do comitê de investimentos e incluem anos muito ruins com mais frequência do que uma curva normal.',
    'A chance de o plano dar certo é a parte dos cenários em que o dinheiro dura até o fim do horizonte, pagando todos os gastos do plano. ' +
      'Ao lado, a chance com ajustes de gasto em anos ruins considera que o estilo de vida cai em anos ruins e sobe em anos bons, dentro dos limites do plano.',
    'O retorno que o plano precisa é o menor rendimento acima da inflação, igual em todos os anos, que paga o plano inteiro e deixa o legado mínimo. ' +
      `A margem de segurança é o retorno esperado da carteira, já descontado o custo de ${formatPercent(o.feeRate, 2)} ao ano, menos o retorno que o plano precisa.`,
    'O que mudou no mês é separado trocando um fator de cada vez, com os mesmos cenários, do número publicado no mês anterior até o número deste mês.',
    'Todos os valores estão em reais de hoje, corrigidos pela inflação (IPCA). O cenário ruim é o 10º pior de cada 100, o do meio é a mediana e o bom é o 10º melhor.',
  ]
}

// Avisos (rascunhos do SPEC para compliance aprovar), sem mudança de texto.

/** Rodapé de toda página do relatório. */
export function reportFooter(refMonth: string, cmaVersion: string): string {
  return (
    `Relatório de acompanhamento do plano, preparado pela gestão da Aware Investments com as posições de ${formatMonthLabel(refMonth)} ` +
    `e as premissas ${cmaVersion}. Simulação ilustrativa; não é promessa de rentabilidade nem recomendação de investimento.`
  )
}

export const BRIDGE_NOTE = 'A variação foi separada trocando um fator de cada vez. A ordem dos fatores muda a divisão entre eles, não o total.'

export const FIRST_REPORT_NOTE = 'Este é o primeiro mês do acompanhamento. A partir do próximo, mostramos o que mudou de um mês para o outro.'

export const FULL_DISCLAIMER =
  'As projeções deste relatório e deste aplicativo são simulações estatísticas. Elas usam premissas de retorno, risco e correlação ' +
  'definidas pelo comitê de investimentos da Aware Investments e as informações do seu plano. Não garantem resultados futuros, não ' +
  'constituem recomendação de investimento e não substituem a análise da gestão ou do seu assessor. Rentabilidade obtida no passado ' +
  'não representa garantia de rentabilidade futura. Os valores estão em reais de hoje, corrigidos pela inflação. Quando as premissas ' +
  'ou o seu plano mudam, os resultados mudam junto.'

export const APP_FOOTER = 'Simulação com base na sua carteira atual. Não é recomendação de investimento; para decisões, fale com seu assessor.'

export const SUITABILITY_NOTICE = 'Este perfil está acima do perfil de investidor do cliente. Use apenas como ilustração.'
