// Benchmark pessoal (SPEC, "Benchmark pessoal"): o menor retorno real constante que sustenta o plano.
// Determinístico, com a mesma convenção de fluxo do motor: déficit no início do ano, superávit no fim.

/** Um ano da convenção de fluxo. Quem chama confere antes se W + F < 0 (falha). */
export function stepWealth(W: number, F: number, R: number): number {
  return F >= 0 ? W * (1 + R) + F : (W + F) * (1 + R)
}

export interface Projection {
  /** Patrimônio no início de cada ano e no fim do horizonte (T + 1 pontos). */
  wealth: Float64Array
  /** Passo em que o patrimônio não cobriu o déficit; −1 se não falhou. */
  failedAt: number
}

/** Projeção sem sorteio com um retorno por ano. Depois de uma falha, o patrimônio fica em zero. */
export function projectWealth(W0: number, flows: Float64Array, rate: (t: number) => number): Projection {
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
        W = stepWealth(W, flows[t], rate(t))
      }
    }
    wealth[t + 1] = W
  }
  return { wealth, failedAt }
}

/** r sustenta o plano: W_t + min(F_t, 0) ≥ 0 em todo t < T e W_T ≥ legado. */
export function sustains(W0: number, flows: Float64Array, r: number, legacy: number): boolean {
  let W = W0
  for (let t = 0; t < flows.length; t++) {
    const F = flows[t]
    if (W + Math.min(F, 0) < 0) return false
    W = stepWealth(W, F, r)
  }
  return W >= legacy
}

export type RequiredReturnStatus = 'ok' | 'folga_total' | 'inviavel'

export interface RequiredReturn {
  status: RequiredReturnStatus
  /** r* em fração (0,0298 = IPCA + 2,98%); null quando o plano se sustenta até com −5% ou nem 20% basta. */
  rate: number | null
  message: string | null
}

export const REQUIRED_RETURN_MIN = -0.05
export const REQUIRED_RETURN_MAX = 0.2
/** O SPEC pede 0,01 p.p.; o teste 3 pede ±0,001 p.p. A bisseção vai até 1e-7 (D-008). */
export const REQUIRED_RETURN_TOL = 1e-7

export function requiredReturn(W0: number, flows: Float64Array, legacy: number): RequiredReturn {
  let lo = REQUIRED_RETURN_MIN
  let hi = REQUIRED_RETURN_MAX
  if (sustains(W0, flows, lo, legacy)) {
    return { status: 'folga_total', rate: null, message: 'Folga total: o plano se sustenta mesmo com retorno real negativo.' }
  }
  if (!sustains(W0, flows, hi, legacy)) {
    return { status: 'inviavel', rate: null, message: 'Plano inviável sem ajustes.' }
  }
  while (hi - lo > REQUIRED_RETURN_TOL) {
    const mid = (lo + hi) / 2
    if (sustains(W0, flows, mid, legacy)) hi = mid
    else lo = mid
  }
  return { status: 'ok', rate: hi, message: null }
}
