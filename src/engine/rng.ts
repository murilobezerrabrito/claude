// Gerador de números aleatórios com semente: xoshiro128** (Blackman e Vigna), estado inicial por splitmix32.
// Uniformes com 53 bits de precisão; normais por Box-Muller, usando os dois valores de cada par.

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k))
}

export class Rng {
  private s0 = 0
  private s1 = 0
  private s2 = 0
  private s3 = 0
  private spare = 0
  private hasSpare = false

  constructor(seed: number) {
    if (!Number.isInteger(seed)) throw new RangeError('A semente precisa ser um inteiro.')
    // splitmix32 espalha a semente pelos 128 bits de estado (nunca todo zero).
    let state = seed >>> 0
    const next = (): number => {
      state = (state + 0x9e3779b9) | 0
      let z = state
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
      return (z ^ (z >>> 15)) >>> 0
    }
    this.s0 = next()
    this.s1 = next()
    this.s2 = next()
    this.s3 = next()
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
