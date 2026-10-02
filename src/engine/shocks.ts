// Choques do cenário (SPEC, "Choques e testes de estresse"): somam pontos percentuais ao retorno real
// sorteado de cada classe nos anos indicados.

import { EngineInputError } from './errors.ts'
import type { Cma, Scenario } from './types.ts'

/** Classes fora do choque genérico do 1º ano (não são classes de risco). */
export const NON_RISK_CLASSES = ['POS']

/**
 * Choque genérico do 1º ano: o valor (0 a −30% no "E se?") vale inteiro para a classe mais volátil e,
 * nas demais classes de risco, na proporção da volatilidade de cada uma (D-007).
 */
export function firstYearShockDeltas(cma: Cma, shock: number): Float64Array {
  if (!Number.isFinite(shock) || shock > 0 || shock < -0.5) {
    throw new EngineInputError('choque_invalido', 'O choque do 1º ano precisa estar entre 0% e −50%.')
  }
  const K = cma.classes.length
  const out = new Float64Array(K)
  const risky = cma.classes.filter((c) => !NON_RISK_CLASSES.includes(c.code))
  const maxVol = Math.max(0, ...risky.map((c) => c.vol))
  if (shock === 0 || maxVol === 0) return out
  for (let k = 0; k < K; k++) {
    const c = cma.classes[k]
    if (!NON_RISK_CLASSES.includes(c.code)) out[k] = (shock * c.vol) / maxVol
  }
  return out
}

/** Matriz δ (T × K) com a soma dos choques do cenário. O ano 1 dos cenários prontos é o passo t = 0. */
export function shockMatrix(cma: Cma, T: number, sc: Scenario): Float64Array {
  const K = cma.classes.length
  const codes = cma.classes.map((c) => c.code)
  const delta = new Float64Array(T * K)
  for (const preset of sc.shocks ?? []) {
    if (!Number.isInteger(preset.fromYear) || !Number.isInteger(preset.toYear) || preset.fromYear < 1 || preset.toYear < preset.fromYear) {
      throw new EngineInputError('choque_invalido', `Anos inválidos no cenário de choque "${preset.name}".`)
    }
    for (const [code, value] of Object.entries(preset.deltas)) {
      const k = codes.indexOf(code)
      if (k < 0) throw new EngineInputError('choque_classe_desconhecida', `O choque "${preset.name}" cita a classe ${code}, que não está nas premissas.`)
      if (!Number.isFinite(value)) throw new EngineInputError('choque_invalido', `Valor inválido no choque "${preset.name}".`)
      for (let t = preset.fromYear - 1; t <= Math.min(preset.toYear - 1, T - 1); t++) delta[t * K + k] += value
    }
  }
  if (sc.firstYearShock) {
    const d = firstYearShockDeltas(cma, sc.firstYearShock)
    for (let k = 0; k < K; k++) delta[k] += d[k]
  }
  return delta
}
