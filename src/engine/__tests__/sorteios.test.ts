import { describe, expect, it } from 'vitest'
import cmaData from '../../data/premissas-ilustrativas-2026-10.json'
import { EngineInputError } from '../errors.ts'
import { cholesky, symmetricEigenvalues } from '../linalg.ts'
import { classParams, logMgfT, sampleClassReturns } from '../returns.ts'
import { Rng } from '../rng.ts'
import type { Cma } from '../types.ts'

const cma = cmaData as Cma
const codes = cma.classes.map((c) => c.code)

describe('gerador aleatório', () => {
  it('é reprodutível pela semente', () => {
    const a = new Rng(123)
    const b = new Rng(123)
    const c = new Rng(124)
    const xs = Array.from({ length: 5 }, () => a.nextUint32())
    expect(Array.from({ length: 5 }, () => b.nextUint32())).toEqual(xs)
    expect(Array.from({ length: 5 }, () => c.nextUint32())).not.toEqual(xs)
  })

  it('gera uniformes em (0, 1) e normais com média 0 e variância 1', () => {
    const rng = new Rng(7)
    const n = 200_000
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < n; i++) {
      const u = rng.nextFloat()
      expect(u > 0 && u < 1).toBe(true)
      const z = rng.normal()
      sum += z
      sumSq += z * z
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.01)
    expect(Math.abs(sumSq / n - 1)).toBeLessThan(0.01)
  })

  it('ln E[exp(sZ)] fica perto de s²/2 e é zero com s = 0', () => {
    expect(logMgfT(0, 5)).toBe(0)
    // Com 1 milhão de sorteios, o ruído da média amostral de Z pesa mais que o efeito das caudas
    // grossas, então só conferimos a ordem de grandeza.
    for (const s of [0.05, 0.1, 0.2226]) {
      expect(Math.abs(logMgfT(s, 5) / (s * s / 2) - 1)).toBeLessThan(0.1)
    }
  })
})

describe('T07 calibração dos sorteios', () => {
  const n = 200_000
  const K = codes.length
  const draws = sampleClassReturns(cma, n, 2026)

  const mean = new Float64Array(K)
  for (let i = 0; i < n; i++) for (let k = 0; k < K; k++) mean[k] += draws[i * K + k] / n
  const cov = Array.from({ length: K }, () => new Float64Array(K))
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < K; a++) {
      const da = draws[i * K + a] - mean[a]
      for (let b = 0; b <= a; b++) cov[a][b] += (da * (draws[i * K + b] - mean[b])) / (n - 1)
    }
  }
  const sd = (k: number) => Math.sqrt(cov[k][k])

  it.each(cma.classes.map((c, k) => [c.code, k] as const))('%s: média a ±0,3 p.p. de μ e volatilidade a ±10% de σ', (_code, k) => {
    const c = cma.classes[k]
    expect(Math.abs(mean[k] - c.mu)).toBeLessThan(0.003)
    expect(Math.abs(sd(k) / c.vol - 1)).toBeLessThan(0.1)
  })

  it('correlações a ±0,02 da matriz do comitê', () => {
    let worst = 0
    for (let a = 0; a < K; a++) {
      for (let b = 0; b < a; b++) {
        const rho = cov[a][b] / (sd(a) * sd(b))
        worst = Math.max(worst, Math.abs(rho - cma.correlation[a][b]))
      }
    }
    expect(worst).toBeLessThan(0.02)
  })
})

describe('T08 matriz de correlação', () => {
  it('a matriz do SPEC passa: simétrica e positiva definida (menor autovalor ≈ 0,27)', () => {
    expect(() => cholesky(cma.correlation, codes)).not.toThrow()
    const min = symmetricEigenvalues(cma.correlation)[0]
    expect(min).toBeGreaterThan(0.26)
    expect(min).toBeLessThan(0.28)
  })

  it('o fator de Cholesky reconstrói a matriz', () => {
    const K = codes.length
    const L = cholesky(cma.correlation, codes)
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < K; j++) {
        let v = 0
        for (let p = 0; p < K; p++) v += L[i * K + p] * L[j * K + p]
        expect(v).toBeCloseTo(cma.correlation[i][j], 12)
      }
    }
  })

  it('matriz não positiva definida gera erro claro', () => {
    const bad = [
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ]
    expect(() => cholesky(bad, ['A', 'B', 'C'])).toThrowError(EngineInputError)
    expect(() => cholesky(bad, ['A', 'B', 'C'])).toThrowError(/não é positiva definida/)
  })

  it('matriz assimétrica, com diagonal diferente de 1 ou ν fora de 3 a 30 também gera erro', () => {
    expect(() => cholesky([[1, 0.2], [0.3, 1]], ['A', 'B'])).toThrowError(/não é simétrica/)
    expect(() => cholesky([[1.1, 0], [0, 1]], ['A', 'B'])).toThrowError(/diagonal/)
    expect(() => classParams({ ...cma, nu: 2 })).toThrowError(/inteiro entre 3 e 30/)
    expect(() => classParams({ ...cma, nu: 5.5 })).toThrowError(/inteiro entre 3 e 30/)
  })
})
