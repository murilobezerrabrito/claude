// "E se?" no aparelho do cliente AI (SPEC, "3. E se?" e "Desempenho e reprodutibilidade"): o plano oficial e cada cenário
// com 5.000 trajetórias e os mesmos sorteios (a semente da família), a partir das entradas do mês da rodada oficial.
// O mercado sorteado depende só das premissas, dos pesos, do horizonte, das trajetórias e da semente, e o ano t de cada
// trajetória usa sempre os mesmos sorteios: o app sorteia uma vez para o horizonte máximo (105 anos) e recorta para o
// horizonte de cada cenário (`sliceMarket`). É o que o motor faz em `simulate` (plano, mercado, trajetórias e resumo),
// com o mercado guardado: o resultado é o mesmo (teste), e nenhum controle sorteia de novo. Sem DOM: roda no Web Worker
// e nos testes.

import { DEFAULT_TARGET_PROBABILITY } from '../engine/metrics.ts'
import { buildPlan } from '../engine/plan.ts'
import { marketFor, runPaths, summarize } from '../engine/simulate.ts'
import { sliceMarket } from '../engine/returns.ts'
import { sustainableSpending } from '../engine/solvers.ts'
import type { Market } from '../engine/returns.ts'
import type { RequiredReturnStatus, SimInput } from '../engine/types.ts'
import type { IpcaSeries } from '../report/inflation.ts'
import { buildMonthInputs } from '../report/monthInputs.ts'
import { mainInput, type MonthPackage } from '../report/officialRun.ts'
import { toEngineScenario, type ReportScenarioParams } from '../report/scenarios.ts'

/** Trajetórias do "E se?" no aparelho (SPEC: plano oficial e cenário, os dois com 5.000). */
export const WHAT_IF_PATHS = 5_000
/** O maior horizonte do controle (SPEC, "Controles"): o mercado é sorteado uma vez para ele. */
const MAX_HORIZON_AGE = 105

export interface WhatIfRun {
  probability: number
  requiredReturn: number | null
  requiredReturnStatus: RequiredReturnStatus
  /** Retorno composto esperado da carteira, líquido do custo. */
  expectedReturn: number
  /** Idade em que o dinheiro acaba no cenário ruim; null se dura até o horizonte. */
  depletionAge: number | null
  horizonAge: number
  /** Idade do membro mais jovem do casal em cada ponto, e o patrimônio dos cenários ruim, do meio e bom. */
  ages: number[]
  years: number[]
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
  /** Patrimônio do cenário do meio aos 80 anos (null se o horizonte não chega lá) e no fim. */
  medianAt80: number | null
  medianFinal: number
  computeMs: number
  /** O mercado já estava sorteado (só recortado para o horizonte do cenário). */
  marketReused: boolean
}

export interface SustainableResult {
  status: 'ok' | 'abaixo_do_minimo' | 'acima_do_maximo'
  target: number
  /** Gasto mensal total possível com a chance-alvo, em reais de hoje. */
  monthlySpending: number | null
  currentMonthlySpending: number
  computeMs: number
}

function medianAtAge(ages: number[], p50: number[], age: number): number | null {
  const i = ages.findIndex((a) => a >= age)
  return i === -1 ? null : p50[i]
}

export interface WhatIf {
  run(params: ReportScenarioParams): WhatIfRun
  sustainable(params: ReportScenarioParams, target?: number): SustainableResult
}

/** O "E se?" de um mês: guarda o mercado do horizonte máximo (por pesos, trajetórias e semente) e os recortes. */
export function createWhatIf(pkg: MonthPackage, ipca: IpcaSeries, paths = WHAT_IF_PATHS): WhatIf {
  const longMarkets = new Map<string, Market>()
  const slices = new Map<string, Market>()
  const inputFor = (params: ReportScenarioParams): { input: SimInput; seed: number } => {
    const m = buildMonthInputs({ ...pkg, ipca, scenario: toEngineScenario(params) })
    return { input: mainInput(m.input), seed: m.seed }
  }
  return {
    run(params) {
      const t0 = performance.now()
      const { input, seed } = inputFor(params)
      const plan = buildPlan(input)
      const weightsKey = JSON.stringify([input.cma.version, Array.from(plan.weightsPre), plan.weightsPost ? Array.from(plan.weightsPost) : null, paths, seed])
      let long = longMarkets.get(weightsKey)
      let marketReused = long !== undefined
      if (!long) {
        const max = inputFor({ ...params, horizonAge: MAX_HORIZON_AGE })
        long = marketFor(max.input, buildPlan(max.input), paths, seed)
        longMarkets.set(weightsKey, long)
      }
      let market: Market
      if (plan.T <= long.T) {
        const sliceKey = `${weightsKey}|${plan.T}`
        market = slices.get(sliceKey) ?? sliceMarket(long, plan.T)
        // Poucos horizontes por sessão; o limite evita guardar recortes sem uso.
        if (slices.size >= 6 && !slices.has(sliceKey)) slices.delete(slices.keys().next().value as string)
        slices.set(sliceKey, market)
      } else {
        // Plano mais longo que o horizonte máximo (meta de outra pessoa da família): sorteio direto.
        market = marketFor(input, plan, paths, seed)
        marketReused = false
      }
      const res = summarize(input, { paths, seed }, plan, runPaths(plan, market, { keepWealth: true }))
      const p = res.percentiles
      return {
        probability: res.successProbability,
        requiredReturn: res.requiredReturn.rate,
        requiredReturnStatus: res.requiredReturn.status,
        expectedReturn: res.expectedCompositeReturn,
        depletionAge: res.depletionAge,
        horizonAge: params.horizonAge ?? pkg.household.horizonAge,
        ages: res.ages,
        years: res.years,
        p10: p.p10,
        p25: p.p25,
        p50: p.p50,
        p75: p.p75,
        p90: p.p90,
        medianAt80: medianAtAge(res.ages, p.p50, 80),
        medianFinal: p.p50[p.p50.length - 1],
        computeMs: Math.round(performance.now() - t0),
        marketReused,
      }
    },
    sustainable(params, target = DEFAULT_TARGET_PROBABILITY) {
      const t0 = performance.now()
      const { input, seed } = inputFor(params)
      const r = sustainableSpending(input, { seed, target, confirmPaths: paths })
      return {
        status: r.status,
        target,
        monthlySpending: r.monthlySpending,
        currentMonthlySpending: r.currentMonthlySpending,
        computeMs: Math.round(performance.now() - t0),
      }
    },
  }
}
