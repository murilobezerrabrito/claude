// Métricas da Família Andrade comparadas com reference/resultados_referencia.json, o arquivo gerado por
// reference/motor_referencia.py (ids e campos no formato dele).
// Usado por `npm run reference` e pelo teste 13, para que os dois confiram exatamente a mesma coisa.

import { buildPlan, fullPlanFlows, requiredReturn, simulate, sustainableSpending } from '../src/engine/index.ts'
import type { SimInput } from '../src/engine/index.ts'

export interface ReferenceMetric {
  id: string
  descricao: string
  valor: number
  tolerancia: number
  /** "fração ao ano", "fração", "R$ de hoje" ou "R$ de hoje por mês". */
  unidade: string
  sorteada: boolean
}

export interface ReferenceFile {
  fonte?: string
  trajetorias: number
  semente?: number
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
    retorno_composto_liquido: off.expectedCompositeReturn,
    benchmark_com_legado: withLegacy.rate,
    benchmark_sem_legado: withoutLegacy.rate,
    folga: off.slack ?? Number.NaN,
    prob_sucesso: off.successProbability,
    prob_legado: off.legacyProbability ?? Number.NaN,
    patrimonio_mediano_final: off.percentiles.p50[off.T],
    prob_sucesso_gasto_flexivel: on.successProbability,
    chance_corte_trajetoria: on.cutProbability ?? Number.NaN,
    chance_corte_guyton_klinger: gk.cutProbability ?? Number.NaN,
    gasto_sustentavel_mensal_90: spending.monthlySpending ?? Number.NaN,
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

const isMoney = (unit: string) => unit.startsWith('R$')

export function formatValue(value: number, unit: string): string {
  if (isMoney(unit)) return brl.format(value)
  if (unit === 'fração ao ano') return pct(3).format(value)
  return pct(1).format(value)
}

export function formatTolerance(value: number, unit: string): string {
  if (isMoney(unit)) return `±${brl.format(value)}`
  const pp = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value * 100)
  return `±${pp} p.p.`
}
