// Benchmark pessoal (SPEC, "Benchmark pessoal"): o menor retorno real constante que sustenta o plano.
// Determinístico, com a mesma convenção de fluxo do motor: déficit no início do passo, superávit no fim, e o passo
// com m < 12 meses rendendo (1 + r)^(m/12) − 1. Sem frações de passo, todos os passos têm 12 meses.

import type { RequiredReturnResult } from './types.ts'

/** Um passo da convenção de fluxo, com fração de ano `frac`. Quem chama confere antes se W + F < 0 (falha). */
export function stepWealth(W: number, F: number, R: number, frac = 1): number {
  const g = frac === 1 ? 1 + R : (1 + R) ** frac
  return F >= 0 ? W * g + F : (W + F) * g
}

export interface Projection {
  /** Patrimônio no início de cada ano e no fim do horizonte (T + 1 pontos). */
  wealth: Float64Array
  /** Passo em que o patrimônio não cobriu o déficit; −1 se não falhou. */
  failedAt: number
}

/** Projeção sem sorteio com um retorno anual por passo. Depois de uma falha, o patrimônio fica em zero. */
export function projectWealth(W0: number, flows: Float64Array, rate: (t: number) => number, stepFrac?: Float64Array): Projection {
  const T = flows.length
  const wealth = new Float64Array(T + 1)
  let W = W0
  let failedAt = -1
  wealth[0] = W
  for (let t = 0; t < T; t++) {
    if (failedAt < 0) {
      if (W + flows[t] < 0) {
        failedAt = t
        W = 0
      } else {
        W = stepWealth(W, flows[t], rate(t), stepFrac ? stepFrac[t] : 1)
      }
    }
    wealth[t + 1] = W
  }
  return { wealth, failedAt }
}

/** r sustenta o plano: W_t + min(F_t, 0) ≥ 0 em todo t < T e W_T ≥ legado. */
export function sustains(W0: number, flows: Float64Array, r: number, legacy: number, stepFrac?: Float64Array): boolean {
  let W = W0
  for (let t = 0; t < flows.length; t++) {
    const F = flows[t]
    if (W + Math.min(F, 0) < 0) return false
    W = stepWealth(W, F, r, stepFrac ? stepFrac[t] : 1)
  }
  return W >= legacy
}

export type { RequiredReturnStatus } from './types.ts'
export type RequiredReturn = RequiredReturnResult

export const REQUIRED_RETURN_MIN = -0.05
export const REQUIRED_RETURN_MAX = 0.2
/** O SPEC pede 0,01 p.p.; o teste 3 pede ±0,001 p.p. A bisseção vai até 1e-7 (D-008). */
export const REQUIRED_RETURN_TOL = 1e-7

export function requiredReturn(W0: number, flows: Float64Array, legacy: number, stepFrac?: Float64Array): RequiredReturn {
  let lo = REQUIRED_RETURN_MIN
  let hi = REQUIRED_RETURN_MAX
  if (sustains(W0, flows, lo, legacy, stepFrac)) {
    return { status: 'folga_total', rate: null, message: 'Folga total: o plano se sustenta mesmo com retorno real negativo.' }
  }
  if (!sustains(W0, flows, hi, legacy, stepFrac)) {
    return { status: 'inviavel', rate: null, message: 'Plano inviável sem ajustes.' }
  }
  while (hi - lo > REQUIRED_RETURN_TOL) {
    const mid = (lo + hi) / 2
    if (sustains(W0, flows, mid, legacy, stepFrac)) hi = mid
    else lo = mid
  }
  return { status: 'ok', rate: hi, message: null }
}

/** Folga = retorno composto esperado do perfil, líquido de taxa, menos r*. Nunca use a média aritmética aqui. */
export function slack(expectedCompositeReturn: number, required: RequiredReturnResult): number | null {
  return required.rate === null ? null : expectedCompositeReturn - required.rate
}
