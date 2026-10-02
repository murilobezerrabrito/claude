// Simulação de Monte Carlo anual (SPEC, "Motor de simulação" e "Pseudocódigo").
// Diferença deliberada do pseudocódigo (D-009): o mercado é sorteado antes dos fluxos e uma trajetória que falha
// continua com patrimônio zero, sem `break`. Assim nenhuma falha desalinha os sorteios das trajetórias seguintes.

import { EngineInputError } from './errors.ts'
import { applyGuardrails, referencePath, resetGuardrails, type GuardrailState } from './guardrails.ts'
import { hashInputs } from './hash.ts'
import { median, wealthPercentiles } from './metrics.ts'
import { buildPlan, fullPlanFlows, type Plan } from './plan.ts'
import { requiredReturn, slack } from './requiredReturn.ts'
import { classParams, generateMarket, type Market } from './returns.ts'
import type { SimInput, SimOptions, SimResult } from './types.ts'
import { ENGINE_VERSION } from './version.ts'

export const DEFAULT_PATHS = 5000
export const MIN_PATHS = 1000
export const DEFAULT_SEED = 20261002

export function validateOptions(opt: SimOptions): void {
  if (!Number.isInteger(opt.paths) || opt.paths < MIN_PATHS) {
    throw new EngineInputError('trajetorias_invalidas', `O número de trajetórias precisa ser um inteiro de pelo menos ${MIN_PATHS}.`)
  }
  if (!Number.isInteger(opt.seed) || opt.seed < 0 || opt.seed > 0xffffffff) {
    throw new EngineInputError('semente_invalida', 'A semente precisa ser um inteiro de 32 bits sem sinal.')
  }
}

/** Sorteia o mercado para um plano (depende só das premissas, dos pesos, do horizonte, das trajetórias e da semente). */
export function marketFor(input: SimInput, plan: Plan, paths: number, seed: number): Market {
  return generateMarket(classParams(input.cma), plan.weightsPre, plan.weightsPost, paths, plan.T, seed)
}

export interface RunOutput {
  paths: number
  successCount: number
  legacyCount: number
  /** Soma de ln(1 + R) com choques e taxa, sobre paths × T. */
  sumLogR: number
  /** Soma de ln(1 + R) sem choques, com taxa: base do retorno composto esperado do perfil. */
  sumLogExpected: number
  cutPaths: number
  /** Maior corte por trajetória, em fração do estilo de vida inicial; NaN sem corte. */
  maxCut: Float64Array
  /** Anos com corte por trajetória (só conta trajetórias com corte; NaN sem corte). */
  cutYears: Float64Array
  /** Patrimônio paths × (T + 1), quando pedido. */
  wealth: Float64Array | null
  /** Multiplicador do estilo de vida paths × T, quando pedido. */
  lifestyleMultipliers: Float64Array | null
}

function sameWeights(a: Float64Array | null, b: Float64Array | null): boolean {
  if (a === null || b === null) return a === b
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** Retorno composto esperado do perfil (líquido de taxa, sem choques) antes e depois da aposentadoria, sobre o mercado inteiro. */
export function expectedRates(plan: Plan, market: Market): { pre: number; post: number } {
  const pre = (1 - plan.fee) * Math.exp(market.meanLogPre) - 1
  const post = market.meanLogPost === null ? pre : (1 - plan.fee) * Math.exp(market.meanLogPost) - 1
  return { pre, post }
}

/**
 * Roda os fluxos do plano sobre o mercado já sorteado. `paths` usa só as primeiras trajetórias do mercado
 * (são as mesmas que um mercado menor com a mesma semente teria).
 */
export function runPaths(
  plan: Plan,
  market: Market,
  opts: { paths?: number; keepWealth?: boolean; collectLifestyle?: boolean } = {},
): RunOutput {
  const T = plan.T
  if (market.T !== T) throw new EngineInputError('mercado_incompativel', 'O mercado sorteado tem outro horizonte.')
  if (!sameWeights(market.weightsPre, plan.weightsPre) || !sameWeights(market.weightsPost, plan.weightsPost)) {
    throw new EngineInputError('mercado_incompativel', 'O mercado sorteado usa outros pesos de alocação.')
  }
  const n = opts.paths ?? market.paths
  if (n > market.paths) throw new EngineInputError('mercado_incompativel', 'O mercado sorteado tem menos trajetórias que o pedido.')

  const { base, lifestyle, retiredFrom, rules, W0, legacy } = plan
  const shockPre = plan.shockPre
  const shockPost = plan.shockPost ?? plan.shockPre
  const gPre = market.grossPre
  const gPost = market.grossPost ?? market.grossPre
  const keep = 1 - plan.fee
  const rulesOn = rules.enabled
  let ref: Float64Array | null = null
  if (rulesOn && rules.mode === 'trajetoria_referencia') {
    const rates = expectedRates(plan, market)
    ref = referencePath(W0, fullPlanFlows(plan), rates.pre, rates.post, retiredFrom)
  }

  const wealth = opts.keepWealth ? new Float64Array(n * (T + 1)) : null
  const mults = opts.collectLifestyle ? new Float64Array(n * T) : null
  const maxCut = new Float64Array(n)
  const cutYears = new Float64Array(n)
  const st: GuardrailState = { mult: 1, wr0: Number.NaN, cut: false }
  let successCount = 0
  let legacyCount = 0
  let cutPaths = 0
  let sumLogR = 0
  let sumLogExpected = 0

  for (let i = 0; i < n; i++) {
    resetGuardrails(st)
    let W = W0
    let failed = false
    let yearsCut = 0
    let minMult = 1
    if (wealth) wealth[i * (T + 1)] = W
    for (let t = 0; t < T; t++) {
      const idx = i * T + t
      const retired = t >= retiredFrom
      const G = retired ? gPost[idx] : gPre[idx]
      let growth = keep * (1 + G + (retired ? shockPost[t] : shockPre[t])) // 1 + R
      if (growth < 0) growth = 0 // choque maior que a carteira: perda total
      sumLogR += Math.log(growth > 1e-300 ? growth : 1e-300)
      sumLogExpected += Math.log(keep * (1 + G))

      if (!failed) {
        if (rulesOn && retired) {
          applyGuardrails(rules, st, W, ref ? ref[t] : 0, t, T, base[t], lifestyle[t])
          if (st.cut) yearsCut++
          if (st.mult < minMult) minMult = st.mult
        }
        const F = base[t] - lifestyle[t] * st.mult
        if (F >= 0) W = W * growth + F
        else if (W + F < 0) {
          failed = true
          W = 0
        } else W = (W + F) * growth
      }
      if (mults) mults[idx] = st.mult
      if (wealth) wealth[i * (T + 1) + t + 1] = W
    }
    if (!failed) successCount++
    if (legacy > 0 && W >= legacy) legacyCount++
    if (yearsCut > 0) {
      cutPaths++
      maxCut[i] = Math.max(0, 1 - minMult)
      cutYears[i] = yearsCut
    } else {
      maxCut[i] = Number.NaN
      cutYears[i] = Number.NaN
    }
  }

  return { paths: n, successCount, legacyCount, sumLogR, sumLogExpected, cutPaths, maxCut, cutYears, wealth, lifestyleMultipliers: mults }
}

export function summarize(input: SimInput, opt: SimOptions, plan: Plan, out: RunOutput): SimResult {
  const { T } = plan
  const n = out.paths
  const percentiles = wealthPercentiles(out.wealth as Float64Array, n, T)
  // P10 zera no fim do ano em que o déficit não foi coberto: a idade é a desse ano (D-013).
  const zeroAt = percentiles.p10.findIndex((v) => v <= 0)
  const depletionAge = zeroAt < 0 ? null : plan.ages[Math.max(0, zeroAt - 1)]
  const cuts = out.maxCut.filter((v) => !Number.isNaN(v))
  const cutYears = out.cutYears.filter((v) => !Number.isNaN(v))
  const expectedCompositeReturn = Math.exp(out.sumLogExpected / (n * T)) - 1
  const required = requiredReturn(plan.W0, fullPlanFlows(plan), plan.legacy)
  return {
    engineVersion: ENGINE_VERSION,
    cmaVersion: input.cma.version,
    inputsHash: hashInputs({ input, paths: opt.paths, seed: opt.seed, engineVersion: ENGINE_VERSION }),
    seed: opt.seed,
    paths: n,
    startYear: plan.startYear,
    T,
    years: Array.from({ length: T + 1 }, (_, t) => plan.startYear + t),
    ages: plan.ages,
    titularAges: plan.titularAges,
    retirementYear: plan.retirementYear,
    successProbability: out.successCount / n,
    legacyProbability: plan.legacy > 0 ? out.legacyCount / n : null,
    compositeReturn: Math.exp(out.sumLogR / (n * T)) - 1,
    expectedCompositeReturn,
    requiredReturn: required,
    slack: slack(expectedCompositeReturn, required),
    percentiles,
    depletionAge,
    cutProbability: plan.rules.enabled ? out.cutPaths / n : null,
    medianMaxCut: plan.rules.enabled && cuts.length > 0 ? median(cuts) : null,
    medianCutYears: plan.rules.enabled && cutYears.length > 0 ? median(cutYears) : null,
    ...(out.lifestyleMultipliers ? { lifestyleMultipliers: out.lifestyleMultipliers } : {}),
    warnings: plan.warnings,
  }
}

/** Função pura: mesmas entradas e mesma semente geram exatamente o mesmo resultado. */
export function simulate(input: SimInput, opt: SimOptions): SimResult {
  validateOptions(opt)
  const plan = buildPlan(input)
  const market = marketFor(input, plan, opt.paths, opt.seed)
  const out = runPaths(plan, market, { keepWealth: true, collectLifestyle: opt.collectLifestyle })
  return summarize(input, opt, plan, out)
}
