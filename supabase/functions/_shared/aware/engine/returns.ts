// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Geração dos retornos reais por classe (SPEC, "Geração dos retornos").
// Z = sqrt((ν−2)/ν) · L·G / sqrt(Q/ν), com um único Q ~ χ²_ν por vetor; r_k = exp(m_k + s_k · clip(Z_k, ±6)) − 1.

import { EngineInputError } from './errors.ts'
import { cholesky, validateCorrelation } from './linalg.ts'
import { pathKeys, qStreamMix, Rng, streamMix, textKey } from './rng.ts'
import type { Cma } from './types.ts'

export const Z_CLIP = 6
/** Sorteios usados para estimar ln E[exp(s·Z)] (SPEC: 1 milhão, semente fixa). */
export const MGF_DRAWS = 1_000_000
export const MGF_SEED = 20261002

export interface ClassParams {
  codes: string[]
  K: number
  nu: number
  /** Ordem canônica (por código): `order[c]` é a posição na lista das premissas da c-ésima classe em ordem de código. */
  order: Int32Array
  /** Fator de Cholesky K×K, linha a linha, na ordem canônica. */
  L: Float64Array
  s: Float64Array
  m: Float64Array
  /** Mistura do fluxo de G de cada classe (K × 4), derivada do código da classe. */
  streams: Uint32Array
}

/** Mistura dos fluxos das normais de Q, uma por componente (ν vai até 30). */
const Q_STREAMS = new Uint32Array(30 * 4)
for (let j = 0; j < 30; j++) qStreamMix(j, Q_STREAMS, j * 4)

export interface Market {
  paths: number
  T: number
  /** Σ_k w_k (exp(m_k + s_k Z_k) − 1) por trajetória e ano (paths × T), antes de choques e taxa. Pesos de antes da aposentadoria. */
  grossPre: Float64Array
  /** O mesmo com os pesos de depois da aposentadoria, quando o perfil os define. */
  grossPost: Float64Array | null
  /** Pesos usados no sorteio (o mercado só serve para planos com os mesmos pesos). */
  weightsPre: Float64Array
  weightsPost: Float64Array | null
  /** Média de ln(1 + gross) sobre todas as trajetórias e anos: base do retorno composto esperado. */
  meanLogPre: number
  meanLogPost: number | null
}

export function validateNu(nu: number): void {
  if (!Number.isInteger(nu) || nu < 3 || nu > 30) {
    throw new EngineInputError('nu_invalido', `Os graus de liberdade (ν) precisam ser um inteiro entre 3 e 30; recebido ${nu}.`)
  }
}

/** s_k = sqrt(ln(1 + σ²/(1+μ)²)). */
export function lognormalScale(mu: number, vol: number): number {
  return Math.sqrt(Math.log(1 + (vol / (1 + mu)) ** 2))
}

/** Uma t-Student padronizada (variância 1) e cortada em ±6, a partir de um RNG. */
function standardizedT(rng: Rng, nu: number): number {
  const g = rng.normal()
  let q = 0
  for (let j = 0; j < nu; j++) {
    const n = rng.normal()
    q += n * n
  }
  const z = g * Math.sqrt((nu - 2) / q)
  return z > Z_CLIP ? Z_CLIP : z < -Z_CLIP ? -Z_CLIP : z
}

const tSampleCache = new Map<number, Float64Array>()
const logMgfCache = new Map<string, number>()

function tSample(nu: number): Float64Array {
  let sample = tSampleCache.get(nu)
  if (!sample) {
    const rng = new Rng(MGF_SEED)
    sample = new Float64Array(MGF_DRAWS)
    for (let i = 0; i < MGF_DRAWS; i++) sample[i] = standardizedT(rng, nu)
    tSampleCache.set(nu, sample)
  }
  return sample
}

/**
 * ln E[exp(s·Z)] para Z t-Student padronizada e cortada em ±6, estimado com 1 milhão de sorteios
 * de semente fixa e guardado em cache. Com distribuição normal, valeria s²/2.
 */
export function logMgfT(s: number, nu: number): number {
  validateNu(nu)
  if (s === 0) return 0
  const key = `${nu}:${s}`
  const cached = logMgfCache.get(key)
  if (cached !== undefined) return cached
  const sample = tSample(nu)
  let sum = 0
  for (let i = 0; i < sample.length; i++) sum += Math.exp(s * sample[i])
  const value = Math.log(sum / sample.length)
  logMgfCache.set(key, value)
  return value
}

/** Parâmetros por classe: valida ν e a correlação, calcula Cholesky, s_k e m_k. */
export function classParams(cma: Cma): ClassParams {
  validateNu(cma.nu)
  const codes = cma.classes.map((c) => c.code)
  if (new Set(codes).size !== codes.length) {
    throw new EngineInputError('classe_duplicada', 'Há códigos de classe repetidos nas premissas.')
  }
  for (const c of cma.classes) {
    if (!Number.isFinite(c.mu) || c.mu <= -1 || !Number.isFinite(c.vol) || c.vol < 0) {
      throw new EngineInputError('premissa_invalida', `Retorno ou volatilidade inválidos na classe ${c.code}.`)
    }
  }
  const K = codes.length
  validateCorrelation(cma.correlation, codes)
  // Cholesky na ordem dos códigos, e não na da lista: só reordenar as classes não muda nenhum retorno (D-030).
  const order = Int32Array.from(codes.map((_, k) => k).sort((a, b) => (codes[a] < codes[b] ? -1 : 1)))
  const sorted = Array.from(order, (k) => codes[k])
  const L = cholesky(Array.from(order, (a) => Array.from(order, (b) => cma.correlation[a][b])), sorted)
  const s = new Float64Array(K)
  const m = new Float64Array(K)
  const streams = new Uint32Array(K * 4)
  const keys = codes.map(textKey)
  if (new Set(keys).size !== K) throw new EngineInputError('classe_duplicada', 'Dois códigos de classe geram a mesma chave de sorteio: troque um deles.')
  for (let k = 0; k < K; k++) {
    const { mu, vol } = cma.classes[k]
    s[k] = lognormalScale(mu, vol)
    m[k] = Math.log(1 + mu) - logMgfT(s[k], cma.nu)
    streamMix(keys[k], streams, k * 4)
  }
  return { codes, K, nu: cma.nu, order, L, s, m, streams }
}

/**
 * Sorteios da trajetória dada por `pk` (`pathKeys`) para os anos 0 a T − 1. Sorteios alinhados (D-030): G da
 * classe k no ano t é o t-ésimo sorteio do fluxo do código da classe, e a j-ésima normal de Q no ano t é o t-ésimo
 * sorteio do fluxo j de Q. Mudar o horizonte, a ordem ou o número de classes, ou o ν, não desloca nenhum outro
 * sorteio. Grava G em `g` (T × K), Q em `q` (T) e, se pedido, as normais de Q em `qn` (T × ν).
 */
export function drawPath(p: ClassParams, rng: Rng, pk: Uint32Array, T: number, g: Float64Array, q: Float64Array, qn: Float64Array | null = null): void {
  const { K, nu, streams } = p
  for (let k = 0; k < K; k++) {
    rng.reseedMixed(pk, streams, k * 4)
    for (let t = 0; t < T; t++) g[t * K + k] = rng.normal()
  }
  q.fill(0, 0, T)
  for (let j = 0; j < nu; j++) {
    rng.reseedMixed(pk, Q_STREAMS, j * 4)
    for (let t = 0; t < T; t++) {
      const n = rng.normal()
      if (qn) qn[t * nu + j] = n
      q[t] += n * n
    }
  }
}

/**
 * Retornos por classe, sem choque, do ano cujos G começam em `g[offset]` e cujo Q vale `q`. G e `out` seguem a ordem
 * da lista das premissas; a correlação é aplicada na ordem canônica.
 */
export function classReturns(p: ClassParams, g: Float64Array, offset: number, q: number, out: Float64Array): void {
  const { K, nu, order, L, s, m } = p
  const scale = Math.sqrt((nu - 2) / q)
  for (let c = 0; c < K; c++) {
    let z = 0
    const row = c * K
    for (let j = 0; j <= c; j++) z += L[row + j] * g[offset + order[j]]
    z *= scale
    const k = order[c]
    if (z > Z_CLIP) z = Z_CLIP
    else if (z < -Z_CLIP) z = -Z_CLIP
    out[k] = Math.exp(m[k] + s[k] * z) - 1
  }
}

/** Sorteios crus (G e as normais de Q) e retornos por classe do ano `year` da trajetória `path`, para conferência e testes. */
export function yearDraws(p: ClassParams, seed: number, path: number, year: number): { g: Float64Array; qn: Float64Array; r: Float64Array } {
  const T = year + 1
  const pk = new Uint32Array(4)
  pathKeys(seed, path, pk)
  const g = new Float64Array(T * p.K)
  const q = new Float64Array(T)
  const qn = new Float64Array(T * p.nu)
  drawPath(p, new Rng(seed), pk, T, g, q, qn)
  const r = new Float64Array(p.K)
  classReturns(p, g, year * p.K, q[year], r)
  return { g: g.slice(year * p.K), qn: qn.slice(year * p.nu), r }
}

/**
 * Sorteia o mercado de todas as trajetórias. Os sorteios não dependem do plano da família, dos pesos, das
 * premissas nem do horizonte, então cenários, bisseções e os passos da ponte com a mesma semente usam exatamente
 * os mesmos números (números aleatórios comuns).
 */
export function generateMarket(
  p: ClassParams,
  weightsPre: Float64Array,
  weightsPost: Float64Array | null,
  paths: number,
  T: number,
  seed: number,
): Market {
  const { K } = p
  const rng = new Rng(seed)
  const g = new Float64Array(T * K)
  const q = new Float64Array(T)
  const r = new Float64Array(K)
  const pk = new Uint32Array(4)
  const grossPre = new Float64Array(paths * T)
  const grossPost = weightsPost ? new Float64Array(paths * T) : null
  for (let i = 0; i < paths; i++) {
    // O ano t da trajetória i usa sempre os mesmos sorteios, para qualquer horizonte.
    pathKeys(seed, i, pk)
    drawPath(p, rng, pk, T, g, q)
    for (let t = 0; t < T; t++) {
      classReturns(p, g, t * K, q[t], r)
      let pre = 0
      for (let k = 0; k < K; k++) pre += weightsPre[k] * r[k]
      grossPre[i * T + t] = pre
      if (grossPost && weightsPost) {
        let post = 0
        for (let k = 0; k < K; k++) post += weightsPost[k] * r[k]
        grossPost[i * T + t] = post
      }
    }
  }
  return {
    paths,
    T,
    grossPre,
    grossPost,
    weightsPre,
    weightsPost,
    meanLogPre: meanLog1p(grossPre),
    meanLogPost: grossPost ? meanLog1p(grossPost) : null,
  }
}

function meanLog1p(values: Float64Array): number {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += Math.log1p(values[i])
  return sum / values.length
}

/**
 * n vetores de retornos por classe (n × K), sorteados exatamente como no mercado: o vetor i é o ano
 * i mod `yearsPerPath` da trajetória ⌊i / `yearsPerPath`⌋. Para a calibração (teste 7).
 */
export function sampleClassReturns(cma: Cma, n: number, seed: number, yearsPerPath = 45): Float64Array {
  const p = classParams(cma)
  const rng = new Rng(seed)
  const g = new Float64Array(yearsPerPath * p.K)
  const q = new Float64Array(yearsPerPath)
  const r = new Float64Array(p.K)
  const pk = new Uint32Array(4)
  const out = new Float64Array(n * p.K)
  for (let i = 0; i < n; i++) {
    const t = i % yearsPerPath
    if (t === 0) {
      pathKeys(seed, i / yearsPerPath, pk)
      drawPath(p, rng, pk, yearsPerPath, g, q)
    }
    classReturns(p, g, t * p.K, q[t], r)
    out.set(r, i * p.K)
  }
  return out
}
