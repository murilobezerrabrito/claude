// Métricas da Família Andrade comparadas com reference/resultados_referencia.json.
// Usado por `npm run reference` e pelo teste 13, para que os dois confiram exatamente a mesma coisa.

import { buildPlan, fullPlanFlows, requiredReturn, simulate, sustainableSpending } from '../src/engine/index.ts'
import type { SimInput } from '../src/engine/index.ts'

export interface ReferenceMetric {
  id: string
  descricao: string
  valor: number
  tolerancia: number
  unidade: 'taxa' | 'probabilidade' | 'reais'
  sorteio: boolean
}

export interface ReferenceFile {
  trajetorias: number
  metricas: ReferenceMetric[]
}

export interface Comparison extends ReferenceMetric {
  obtido: number
  diferenca: number
  passou: boolean
}

/** Calcula, para a família, cada métrica da tabela de referência. */
export function computeMetrics(input: SimInput, paths: number, seed: number): Record<string, number> {
  const plan = buildPlan(input)
  const flows = fullPlanFlows(plan)
  const withLegacy = requiredReturn(plan.W0, flows, plan.legacy)
  const withoutLegacy = requiredReturn(plan.W0, flows, 0)
  if (withLegacy.rate === null || withoutLegacy.rate === null) throw new Error('Benchmark pessoal sem valor numérico.')

  const scenario = input.scenario ?? {}
  const off = simulate({ ...input, scenario: { ...scenario, rulesEnabled: false } }, { paths, seed })
  const on = simulate({ ...input, scenario: { ...scenario, rulesEnabled: true, rulesMode: 'trajetoria_referencia' } }, { paths, seed })
  const gk = simulate({ ...input, scenario: { ...scenario, rulesEnabled: true, rulesMode: 'guyton_klinger' } }, { paths, seed })
  const spending = sustainableSpending(input, { seed, target: 0.9 })

  return {
    retornoCompostoLiquido: off.expectedCompositeReturn,
    benchmarkComLegado: withLegacy.rate,
    benchmarkSemLegado: withoutLegacy.rate,
    folga: off.slack ?? Number.NaN,
    probSucessoSemRegras: off.successProbability,
    probLegadoSemRegras: off.legacyProbability ?? Number.NaN,
    patrimonioMediano95SemRegras: off.percentiles.p50[off.T],
    probSucessoComRegras: on.successProbability,
    chanceCorteTrajetoriaReferencia: on.cutProbability ?? Number.NaN,
    chanceCorteGuytonKlinger: gk.cutProbability ?? Number.NaN,
    gastoSustentavelMensal90: spending.monthlySpending ?? Number.NaN,
  }
}

export function compare(reference: ReferenceFile, values: Record<string, number>): Comparison[] {
  return reference.metricas.map((m) => {
    const obtido = values[m.id]
    if (obtido === undefined) throw new Error(`O motor não calcula a métrica de referência "${m.id}".`)
    const diferenca = obtido - m.valor
    // Folga mínima para erro de ponto flutuante em comparações exatas na borda da tolerância.
    const passou = Number.isFinite(obtido) && Math.abs(diferenca) <= m.tolerancia + 1e-12
    return { ...m, obtido, diferenca, passou }
  })
}

const pct = (digits: number) => new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits })
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function formatValue(value: number, unit: ReferenceMetric['unidade']): string {
  if (unit === 'taxa') return pct(3).format(value)
  if (unit === 'probabilidade') return pct(1).format(value)
  return brl.format(value)
}

export function formatTolerance(value: number, unit: ReferenceMetric['unidade']): string {
  if (unit === 'reais') return `±${brl.format(value)}`
  const pp = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value * 100)
  return `±${pp} p.p.`
}
