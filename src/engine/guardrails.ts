// Gasto flexível (SPEC, "Gasto flexível"). As regras ajustam só o estilo de vida, a partir da aposentadoria.
// Régua padrão: a trajetória de referência (patrimônio projetado sem sorteio, com o retorno composto esperado
// do perfil e o plano completo). Alternativa: Guyton-Klinger, pela taxa de saque.

import { projectWealth } from './requiredReturn.ts'
import type { SpendingRules } from './types.ts'

/** Trajetória de referência: T + 1 pontos, com o retorno composto esperado antes e depois da aposentadoria. */
export function referencePath(W0: number, flows: Float64Array, ratePre: number, ratePost: number, retiredFrom: number): Float64Array {
  return projectWealth(W0, flows, (t) => (t >= retiredFrom ? ratePost : ratePre)).wealth
}

/** Estado das regras numa trajetória. Um objeto por cálculo, reaproveitado entre trajetórias. */
export interface GuardrailState {
  /** Multiplicador do estilo de vida planejado (1 = plano). */
  mult: number
  /** Taxa de saque inicial (Guyton-Klinger); NaN até o primeiro ano aposentado. */
  wr0: number
  /** A regra de corte disparou neste ano. */
  cut: boolean
}

export function resetGuardrails(st: GuardrailState): void {
  st.mult = 1
  st.wr0 = Number.NaN
  st.cut = false
}

/**
 * Ajusta o multiplicador do estilo de vida no início do ano t (já aposentado).
 * `base` é o fluxo do ano sem o estilo de vida; `planned`, o estilo de vida planejado do ano.
 */
export function applyGuardrails(
  rules: SpendingRules,
  st: GuardrailState,
  W: number,
  ref: number,
  t: number,
  T: number,
  base: number,
  planned: number,
): void {
  st.cut = false
  if (W <= 0) return
  const cutAllowed = t < T - rules.noCutLastYears
  let next = st.mult
  if (rules.mode === 'trajetoria_referencia') {
    // Sem referência positiva (a própria referência esgotou), não há régua: nada muda.
    if (ref > 0) {
      if (W < rules.lower * ref) {
        if (cutAllowed) {
          next = st.mult * (1 - rules.cut)
          st.cut = true
        }
      } else if (W > rules.upper * ref) {
        next = st.mult * (1 + rules.raise)
      }
    }
  } else {
    // Guyton-Klinger: taxa de saque = déficit do ano ÷ patrimônio no início do ano.
    const wr = Math.max(0, -(base - planned * st.mult)) / W
    if (Number.isNaN(st.wr0)) {
      st.wr0 = wr
      return
    }
    if (wr > rules.upper * st.wr0) {
      if (cutAllowed) {
        next = st.mult * (1 - rules.cut)
        st.cut = true
      }
    } else if (wr < rules.lower * st.wr0) {
      next = st.mult * (1 + rules.raise)
    }
  }
  st.mult = Math.min(rules.cap, Math.max(rules.floor, next))
}
