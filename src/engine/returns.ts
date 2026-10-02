// Geração dos retornos reais por classe (SPEC, "Geração dos retornos").
// Z = sqrt((ν−2)/ν) · L·G / sqrt(Q/ν), com um único Q ~ χ²_ν por vetor; r_k = exp(m_k + s_k · clip(Z_k, ±6)) − 1.

import { EngineInputError } from './errors.ts'
import { cholesky } from './linalg.ts'
import { Rng } from './rng.ts'
import type { Cma } from './types.ts'

export const Z_CLIP = 6
/** Sorteios usados para estimar ln E[exp(s·Z)] (SPEC: 1 milhão, semente fixa). */
export const MGF_DRAWS = 1_000_000
export const MGF_SEED = 20261002

export interface ClassParams {
  codes: string[]
  K: number
  nu: number
  /** Fator de Cholesky K×K, linha a linha. */
  L: Float64Array
  s: Float64Array
  m: Float64Array
}

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
  const L = cholesky(cma.correlation, codes)
  const s = new Float64Array(K)
  const m = new Float64Array(K)
  for (let k = 0; k < K; k++) {
    const { mu, vol } = cma.classes[k]
    s[k] = lognormalScale(mu, vol)
    m[k] = Math.log(1 + mu) - logMgfT(s[k], cma.nu)
  }
  return { codes, K, nu: cma.nu, L, s, m }
}

/**
 * Sorteia um vetor de retornos por classe (sem choque) em `out`.
 * Ordem fixa dos sorteios: K normais de G e depois ν normais de Q.
 */
function drawClassReturns(p: ClassParams, rng: Rng, g: Float64Array, out: Float64Array): void {
  const { K, nu, L, s, m } = p
  for (let k = 0; k < K; k++) g[k] = rng.normal()
  let q = 0
  for (let j = 0; j < nu; j++) {
    const n = rng.normal()
    q += n * n
  }
  const scale = Math.sqrt((nu - 2) / q)
  for (let k = 0; k < K; k++) {
    let z = 0
    const row = k * K
    for (let j = 0; j <= k; j++) z += L[row + j] * g[j]
    z *= scale
    if (z > Z_CLIP) z = Z_CLIP
    else if (z < -Z_CLIP) z = -Z_CLIP
    out[k] = Math.exp(m[k] + s[k] * z) - 1
  }
}

/**
 * Sorteia o mercado de todas as trajetórias. Os sorteios não dependem do plano da família nem do horizonte,
 * então cenários e bisseções com a mesma semente usam exatamente os mesmos números (números aleatórios comuns).
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
  const g = new Float64Array(K)
  const r = new Float64Array(K)
  const grossPre = new Float64Array(paths * T)
  const grossPost = weightsPost ? new Float64Array(paths * T) : null
  for (let i = 0; i < paths; i++) {
    // Uma sequência por trajetória: o ano t da trajetória i é o mesmo para qualquer horizonte.
    rng.reseed(seed, i + 1)
    for (let t = 0; t < T; t++) {
      drawClassReturns(p, rng, g, r)
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
 * n vetores de retornos por classe (n × K), sorteados pelo mesmo esquema do mercado: blocos de `yearsPerPath`
 * vetores, cada bloco numa sequência própria do gerador (uma "trajetória"). Para a calibração (teste 7).
 */
export function sampleClassReturns(cma: Cma, n: number, seed: number, yearsPerPath = 45): Float64Array {
  const p = classParams(cma)
  const rng = new Rng(seed)
  const g = new Float64Array(p.K)
  const r = new Float64Array(p.K)
  const out = new Float64Array(n * p.K)
  for (let i = 0; i < n; i++) {
    if (i % yearsPerPath === 0) rng.reseed(seed, i / yearsPerPath + 1)
    drawClassReturns(p, rng, g, r)
    out.set(r, i * p.K)
  }
  return out
}
