// Resumos estatísticos das trajetórias.

/** Quantil com interpolação linear (o padrão do NumPy) de um vetor já ordenado. */
export function quantileSorted(sorted: Float64Array, p: number): number {
  const n = sorted.length
  if (n === 0) return Number.NaN
  const h = (n - 1) * p
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, n - 1)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

export function median(values: Float64Array): number {
  return quantileSorted(Float64Array.from(values).sort(), 0.5)
}

export const PERCENTILE_LEVELS = { p10: 0.1, p25: 0.25, p50: 0.5, p75: 0.75, p90: 0.9 } as const

/** Percentis do patrimônio em cada ponto, a partir da matriz paths × (T + 1). */
export function wealthPercentiles(wealth: Float64Array, paths: number, T: number) {
  const out = { p10: [] as number[], p25: [] as number[], p50: [] as number[], p75: [] as number[], p90: [] as number[] }
  const col = new Float64Array(paths)
  for (let t = 0; t <= T; t++) {
    for (let i = 0; i < paths; i++) col[i] = wealth[i * (T + 1) + t]
    col.sort()
    out.p10.push(quantileSorted(col, PERCENTILE_LEVELS.p10))
    out.p25.push(quantileSorted(col, PERCENTILE_LEVELS.p25))
    out.p50.push(quantileSorted(col, PERCENTILE_LEVELS.p50))
    out.p75.push(quantileSorted(col, PERCENTILE_LEVELS.p75))
    out.p90.push(quantileSorted(col, PERCENTILE_LEVELS.p90))
  }
  return out
}

/** Faixas da probabilidade de sucesso (SPEC, "Faixas da probabilidade"); limites são parâmetros do comitê. */
export type ProbabilityBand = 'folga_grande' | 'no_caminho' | 'atencao' | 'em_risco'

export const DEFAULT_BANDS = { blue: 0.99, green: 0.85, yellow: 0.7 }
export const DEFAULT_TARGET_PROBABILITY = 0.9

export function probabilityBand(p: number, bands = DEFAULT_BANDS): ProbabilityBand {
  if (p >= bands.blue) return 'folga_grande'
  if (p >= bands.green) return 'no_caminho'
  if (p >= bands.yellow) return 'atencao'
  return 'em_risco'
}
