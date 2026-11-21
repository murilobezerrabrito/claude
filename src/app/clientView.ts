// Monta, no aparelho, a visão do mês do cliente AI a partir do que `client_month` devolve (SPEC, "Canal 2"): o retrato
// do mês sai do mesmo código do relatório (`assembleReportSnapshot`, sem simular), com as rodadas publicadas dos meses
// fechados; o histórico, de cada mês contra o anterior. O exemplo da Família Andrade passa pelo mesmo caminho. Sem DOM.

import { ReportInputError } from '../report/errors.ts'
import { monthReturn } from '../report/performance.ts'
import { assembleReportSnapshot } from '../report/snapshot.ts'
import { REPORT_LEGAL_KEYS, type ReportLegalTexts } from '../report/texts.ts'
import type { ClientHistoryMonth, ClientMonthInputs, ClientMonthView, LegalText } from './types.ts'

function legalText(inputs: ClientMonthInputs, key: string): LegalText {
  const t = inputs.legal[key]
  if (!t || !Number.isInteger(t.version) || t.version < 1 || typeof t.body !== 'string' || t.body.trim() === '') {
    throw new ReportInputError('texto_legal_ausente', `Falta o texto legal "${key}" aprovado.`)
  }
  return t
}

/** O histórico: a chance e o retorno que o plano precisa publicados em cada mês e o rendimento real do mês. */
export function clientHistory(inputs: Pick<ClientMonthInputs, 'months' | 'ipca'>): ClientHistoryMonth[] {
  return inputs.months.map(({ pkg, run }, i) => {
    const prev = i > 0 ? inputs.months[i - 1].pkg : null
    const events: string[] = []
    if (prev && prev.planVersion.id !== pkg.planVersion.id) events.push('Mudança no plano')
    if (prev && prev.cma.version !== pkg.cma.version) events.push('Premissas novas')
    return {
      month: run.refMonth,
      probability: run.probability,
      requiredReturn: run.requiredReturn,
      requiredReturnStatus: run.requiredReturnStatus,
      realReturn: prev
        ? monthReturn({ refDate: pkg.closing.refDate, startValue: prev.closing.officialPl, endValue: pkg.closing.officialPl, flows: pkg.closing.flows, ipca: inputs.ipca }).real
        : null,
      events,
    }
  })
}

/**
 * A visão do mês; null quando a família ainda não tem mês fechado. Erros de montagem (texto legal que falta, meses fora
 * de sequência) saem como `ReportInputError`, para a tela dizer que os números do mês ainda não estão prontos.
 */
export function buildClientView(inputs: ClientMonthInputs, opts: { example?: boolean } = {}): ClientMonthView | null {
  if (inputs.schema !== 1) throw new ReportInputError('versao_desconhecida', 'Atualize o app: os dados vieram num formato novo.')
  if (inputs.ref_date === null || inputs.months.length === 0) return null
  const last = inputs.months[inputs.months.length - 1]
  if (last.pkg.closing.refDate !== inputs.ref_date) {
    throw new ReportInputError('rodada_de_outro_mes', `O último mês recebido não é ${inputs.ref_date}.`)
  }
  if (!inputs.bridge) throw new ReportInputError('ponte_incoerente', `Falta a ponte de ${inputs.ref_date.slice(0, 7)}.`)
  const reportTexts = Object.fromEntries(REPORT_LEGAL_KEYS.map((k) => [k, legalText(inputs, k)])) as ReportLegalTexts
  const snapshot = assembleReportSnapshot({
    months: inputs.months,
    bridge: inputs.bridge,
    ipca: inputs.ipca,
    cdi: Object.keys(inputs.cdi).length > 0 ? inputs.cdi : null,
    scenarios: [],
    comment: { text: '', example: false },
    manager: '',
    legalTexts: reportTexts,
  })
  return {
    schema: 1,
    example: opts.example ?? false,
    snapshot,
    pkg: last.pkg,
    ipca: inputs.ipca,
    history: clientHistory(inputs),
    intermediary: inputs.household.intermediary,
    legal: { rodape_app: legalText(inputs, 'rodape_app'), aviso_completo: reportTexts.aviso_completo },
    scenarios: inputs.scenarios,
    requests: inputs.requests,
  }
}
