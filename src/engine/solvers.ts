// Perguntas que o motor resolve com a probabilidade-alvo (SPEC, "'E se?' e linguagem natural"):
// "Quanto posso gastar?" (gasto sustentável) e "Quando posso parar?" (menor idade de aposentadoria).
// Todas as rodadas usam o mesmo mercado sorteado (mesma semente).

import { EngineInputError } from './errors.ts'
import { DEFAULT_TARGET_PROBABILITY } from './metrics.ts'
import { buildPlan } from './plan.ts'
import { marketFor, runPaths } from './simulate.ts'
import type { Scenario, SimInput } from './types.ts'

export const SPENDING_K_MIN = 0.3
export const SPENDING_K_MAX = 3
export const SPENDING_SEARCH_PATHS = 2000
export const SPENDING_CONFIRM_PATHS = 5000
export const MAX_RETIREMENT_AGE = 75
const K_TOL = 1e-4

export interface SolverOptions {
  seed: number
  /** Probabilidade-alvo (padrão 90%). */
  target?: number
  /** Trajetórias da confirmação (padrão 5.000) e da busca (padrão 2.000). */
  confirmPaths?: number
  searchPaths?: number
  /**
   * Liga as regras de gasto flexível nas rodadas. Padrão: desligadas (gastos completos), como o resultado de
   * referência do SPEC; é também o número mais conservador (D-010).
   */
  withRules?: boolean
}

export interface SustainableSpending {
  status: 'ok' | 'abaixo_do_minimo' | 'acima_do_maximo'
  /** Multiplicador k do gasto total (essencial + estilo de vida) do cenário. */
  multiplier: number | null
  /** Gasto total mensal no ano 0 com o multiplicador encontrado. */
  monthlySpending: number | null
  /** Gasto total mensal atual (ano 0) do cenário. */
  currentMonthlySpending: number
  /** Probabilidade confirmada com todas as trajetórias. */
  probability: number
}

function withScenario(input: SimInput, patch: Scenario): SimInput {
  return { ...input, scenario: { ...(input.scenario ?? {}), ...patch } }
}

function solverInput(input: SimInput, opts: SolverOptions): SimInput {
  return withScenario(input, { rulesEnabled: opts.withRules ?? false })
}

/**
 * Gasto sustentável: bisseção no multiplicador k do gasto total, entre 0,3 e 3, com a mesma semente em todas
 * as rodadas; busca com 2.000 trajetórias e confirmação com 5.000.
 */
export function sustainableSpending(original: SimInput, opts: SolverOptions): SustainableSpending {
  const input = solverInput(original, opts)
  const target = opts.target ?? DEFAULT_TARGET_PROBABILITY
  const confirmPaths = opts.confirmPaths ?? SPENDING_CONFIRM_PATHS
  const searchPaths = Math.min(opts.searchPaths ?? SPENDING_SEARCH_PATHS, confirmPaths)
  const k0 = input.scenario?.spendingMultiplier ?? 1
  const plan0 = buildPlan(input)
  const market = marketFor(input, plan0, confirmPaths, opts.seed)
  const current = (plan0.essential[0] + plan0.lifestyle[0]) / 12

  const probability = (k: number, paths: number): number => {
    const plan = buildPlan(withScenario(input, { spendingMultiplier: k0 * k }))
    return runPaths(plan, market, { paths }).successCount / paths
  }
  const bisect = (lo: number, hi: number, paths: number): number => {
    while (hi - lo > K_TOL) {
      const mid = (lo + hi) / 2
      if (probability(mid, paths) >= target) lo = mid
      else hi = mid
    }
    return lo
  }

  if (probability(SPENDING_K_MIN, confirmPaths) < target) {
    return { status: 'abaixo_do_minimo', multiplier: null, monthlySpending: null, currentMonthlySpending: current, probability: probability(SPENDING_K_MIN, confirmPaths) }
  }
  if (probability(SPENDING_K_MAX, confirmPaths) >= target) {
    return { status: 'acima_do_maximo', multiplier: null, monthlySpending: null, currentMonthlySpending: current, probability: probability(SPENDING_K_MAX, confirmPaths) }
  }
  let k = SPENDING_K_MIN
  if (probability(SPENDING_K_MAX, searchPaths) < target && probability(SPENDING_K_MIN, searchPaths) >= target) {
    k = bisect(SPENDING_K_MIN, SPENDING_K_MAX, searchPaths)
  }
  // Confirmação com todas as trajetórias; se não confirmar, refina com elas abaixo do valor da busca.
  if (probability(k, confirmPaths) < target) k = bisect(SPENDING_K_MIN, k, confirmPaths)
  return { status: 'ok', multiplier: k, monthlySpending: k * current, currentMonthlySpending: current, probability: probability(k, confirmPaths) }
}

export interface EarliestRetirement {
  status: 'ok' | 'nenhuma_idade' | 'sem_aposentadoria'
  /** Menor idade do titular com probabilidade ≥ alvo. */
  age: number | null
  probability: number | null
}

/** Menor idade de aposentadoria do titular, da idade atual até 75, com probabilidade ≥ alvo. */
export function earliestRetirement(original: SimInput, opts: SolverOptions): EarliestRetirement {
  const input = solverInput(original, opts)
  const target = opts.target ?? DEFAULT_TARGET_PROBABILITY
  const paths = opts.confirmPaths ?? SPENDING_CONFIRM_PATHS
  const plan0 = buildPlan(input)
  if (plan0.retirementAge === null) return { status: 'sem_aposentadoria', age: null, probability: null }
  const market = marketFor(input, plan0, paths, opts.seed)
  const currentAge = plan0.titularAges[0]
  if (currentAge > MAX_RETIREMENT_AGE) throw new EngineInputError('aposentadoria_invalida', 'O titular já passou da idade máxima de aposentadoria do "E se?".')
  for (let age = currentAge; age <= MAX_RETIREMENT_AGE; age++) {
    const plan = buildPlan(withScenario(input, { retirementAge: age }))
    const p = runPaths(plan, market, { paths }).successCount / paths
    if (p >= target) return { status: 'ok', age, probability: p }
  }
  return { status: 'nenhuma_idade', age: null, probability: null }
}
