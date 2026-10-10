// Famílias por canal (SPEC, "Console interno"): chance, variação no mês, faixa, o filtro "precisam de atenção" e a
// ordenação da lista. Funções puras, testadas em __tests__/families.test.ts.

import { probabilityBand, type ProbabilityBand } from '../engine/metrics.ts'
import type { FamilyOverviewRow } from '../lib/apiTypes.ts'

/**
 * Chance em décimos de ponto, como no relatório (0,6195 → 620, "62,0%"). O relatório arredonda a contagem inteira de
 * trajetórias (meio para cima); aqui, a fração vem do banco, e 0,5005 × 1000 dá 500,4999… em ponto flutuante. Arredondar
 * antes a 1e-7 tira esse erro e devolve o mesmo número do relatório (501).
 */
export const tenths = (p: number) => Math.round(Math.round(p * 1e7) / 1e4)

/** Variação da chance no mês em décimos de ponto, a partir dos números já arredondados (o que aparece fecha a conta). */
export function variationTenths(f: FamilyOverviewRow): number | null {
  if (!f.latest || f.previous_probability === null) return null
  return tenths(f.latest.probability) - tenths(f.previous_probability)
}

export const bandOf = (f: FamilyOverviewRow): ProbabilityBand | null => (f.latest ? probabilityBand(f.latest.probability) : null)

/**
 * Limites do filtro "precisam de atenção" (SPEC): abaixo de 70%, queda de mais de 5 p.p. no mês, ou 99% ou mais. A
 * queda é medida em décimos de ponto, o número que aparece na tela (e sem o erro de arredondamento binário).
 */
export const ATTENTION = { below: 0.7, dropTenths: 50, atLeast: 0.99 } as const

export type AttentionReason = 'abaixo_de_70' | 'queda_no_mes' | 'acima_de_99'

export const ATTENTION_LABELS: Record<AttentionReason, string> = {
  abaixo_de_70: 'Chance abaixo de 70%',
  queda_no_mes: 'Queda de mais de 5 p.p. no mês',
  acima_de_99: '99% ou mais: talvez conservador demais',
}

/** Por que a família precisa de atenção (vazio quando não precisa, quando ainda não tem rodada ou quando está encerrada). */
export function attentionReasons(f: FamilyOverviewRow): AttentionReason[] {
  if (!f.latest || f.status === 'encerrada') return []
  const p = f.latest.probability
  const out: AttentionReason[] = []
  if (p < ATTENTION.below) out.push('abaixo_de_70')
  const variation = variationTenths(f)
  if (variation !== null && -variation > ATTENTION.dropTenths) out.push('queda_no_mes')
  if (p >= ATTENTION.atLeast) out.push('acima_de_99')
  return out
}

export type SortKey = 'familia' | 'chance' | 'variacao' | 'folga' | 'posicoes'

const sortValue: Record<SortKey, (f: FamilyOverviewRow) => number | string | null> = {
  familia: (f) => f.code,
  chance: (f) => f.latest?.probability ?? null,
  variacao: (f) => variationTenths(f),
  folga: (f) => f.latest?.slack ?? null,
  posicoes: (f) => f.latest?.ref_date ?? null,
}

/** Ordena pela coluna escolhida; quem não tem o número fica sempre no fim, e o código desempata. */
export function sortFamilies(rows: readonly FamilyOverviewRow[], key: SortKey, ascending: boolean): FamilyOverviewRow[] {
  const value = sortValue[key]
  return [...rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1
    } else if (va !== vb) {
      const c = va < vb ? -1 : 1
      return ascending ? c : -c
    }
    return a.code.localeCompare(b.code)
  })
}
