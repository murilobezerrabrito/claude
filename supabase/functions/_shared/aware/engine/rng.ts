// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Gerador de números aleatórios com semente: xoshiro128** (Blackman e Vigna), estado inicial por splitmix32.
// Uniformes com 53 bits de precisão; normais por Box-Muller, usando os dois valores de cada par.
// Sequências (streams): cada par (semente, sequência) começa num estado próprio.
// Sorteios alinhados (SPEC, "Motor no ciclo mensal", item 2; D-030): cada trajetória tem um gerador por fluxo
// (um por classe, pela chave do código, e um por componente de Q), com estado de 128 bits derivado da semente,
// da trajetória e do fluxo (`pathKeys`, `streamMix`, `qStreamMix` e `reseedMixed`). O ano t usa sempre o t-ésimo
// sorteio de cada fluxo, então nada além da semente muda os sorteios.

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k))
}

/** Finalizador do MurmurHash3: bijeção em 32 bits que espalha os bits. */
function fmix32(x: number): number {
  let h = x >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

const GOLDEN = 0x9e3779b9

// Constantes ímpares distintas por palavra do estado (dígitos de constantes conhecidas de hash).
const SEED_SALT = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f]
const PATH_MUL = [0x165667b1, 0xd3a2646d, 0xfd7046c5, 0xb55a4f09]
const STREAM_SALT = [0x21f0aaad, 0x735a2d97, 0x5bd1e995, 0xcc9e2d51]
// STREAM_SALT[j] ^ Q_SALT[j] é diferente em cada palavra, então um fluxo de Q nunca coincide com o de uma classe.
const Q_SALT = [0x7feb352d, 0x846ca68b, 0x68e31da5, 0x1b56c4e9]

/** Chave de 32 bits de um texto (FNV-1a seguido de fmix32), estável entre execuções e versões. */
export function textKey(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return fmix32(h)
}

/** Quatro palavras que identificam a trajetória `path` da semente `seed`. */
export function pathKeys(seed: number, path: number, out: Uint32Array): void {
  for (let j = 0; j < 4; j++) out[j] = fmix32(fmix32((seed ^ SEED_SALT[j]) >>> 0) ^ Math.imul(path + 1, PATH_MUL[j]))
}

/** Grava em `out[offset..offset+3]` a mistura do fluxo de chave `key` (o `textKey` do código da classe). */
export function streamMix(key: number, out: Uint32Array, offset = 0): void {
  for (let j = 0; j < 4; j++) out[offset + j] = fmix32((key ^ STREAM_SALT[j]) >>> 0)
}

/** Grava em `out[offset..offset+3]` a mistura do fluxo da j-ésima normal de Q. */
export function qStreamMix(j: number, out: Uint32Array, offset = 0): void {
  for (let w = 0; w < 4; w++) out[offset + w] = fmix32((j ^ Q_SALT[w]) >>> 0)
}

/** k-ésima saída do splitmix32 a partir do estado `state`: mix(state + k·φ mod 2³²). Sem estado próprio. */
function splitmix32(state: number, k: number): number {
  let z = (state + Math.imul(k, GOLDEN)) | 0
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
  return (z ^ (z >>> 15)) >>> 0
}

export class Rng {
  private s0 = 0
  private s1 = 0
  private s2 = 0
  private s3 = 0
  private spare = 0
  private hasSpare = false

  constructor(seed: number, stream = 0) {
    this.reseed(seed, stream)
  }

  /** Reinicia o gerador na sequência `stream` da semente, sem criar um objeto novo. */
  reseed(seed: number, stream = 0): void {
    if (!Number.isInteger(seed)) throw new RangeError('A semente precisa ser um inteiro.')
    if (!Number.isInteger(stream) || stream < 0) throw new RangeError('A sequência precisa ser um inteiro maior ou igual a zero.')
    this.hasSpare = false
    // splitmix32 espalha a semente pelos 128 bits de estado (nunca todo zero).
    let state = seed >>> 0
    if (stream > 0) state = (state ^ fmix32(stream ^ 0x5bd1e995)) >>> 0
    this.s0 = splitmix32(state, 1)
    this.s1 = splitmix32(state, 2)
    this.s2 = splitmix32(state, 3)
    this.s3 = splitmix32(state, 4)
  }

  /**
   * Reinicia o gerador no fluxo dado por `mix[offset..offset+3]` (`streamMix` ou `qStreamMix`) da trajetória
   * dada por `keys` (`pathKeys`): cada palavra do estado depende da semente, da trajetória e do fluxo.
   * Sem criar objetos.
   */
  reseedMixed(keys: Uint32Array, mix: Uint32Array, offset: number): void {
    this.hasSpare = false
    this.s0 = fmix32(keys[0] ^ mix[offset])
    this.s1 = fmix32(keys[1] ^ mix[offset + 1])
    this.s2 = fmix32(keys[2] ^ mix[offset + 2])
    this.s3 = fmix32(keys[3] ^ mix[offset + 3])
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1 // xoshiro não aceita estado todo zero
  }

  /** Inteiro sem sinal de 32 bits. */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0
    const t = this.s1 << 9
    this.s2 ^= this.s0
    this.s3 ^= this.s1
    this.s1 ^= this.s2
    this.s0 ^= this.s3
    this.s2 ^= t
    this.s3 = rotl(this.s3, 11)
    return result
  }

  /** Uniforme em (0, 1), com 53 bits. */
  nextFloat(): number {
    const a = this.nextUint32() >>> 5 // 27 bits
    const b = this.nextUint32() >>> 6 // 26 bits
    return (a * 67108864 + b + 0.5) / 9007199254740992
  }

  /** Normal padrão por Box-Muller. */
  normal(): number {
    if (this.hasSpare) {
      this.hasSpare = false
      return this.spare
    }
    const r = Math.sqrt(-2 * Math.log(this.nextFloat()))
    const theta = 2 * Math.PI * this.nextFloat()
    this.spare = r * Math.sin(theta)
    this.hasSpare = true
    return r * Math.cos(theta)
  }
}
