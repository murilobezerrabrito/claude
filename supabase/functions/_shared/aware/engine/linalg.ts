// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
import { EngineInputError } from './errors.ts'

const SYMMETRY_TOL = 1e-9
const PIVOT_MIN = 1e-12

/**
 * Confere a matriz de correlação: quadrada K×K, finita, simétrica, diagonal 1 e valores entre −1 e 1.
 * Lança EngineInputError com mensagem para o comitê.
 */
export function validateCorrelation(c: number[][], codes: string[]): void {
  const k = codes.length
  if (c.length !== k || c.some((row) => row.length !== k)) {
    throw new EngineInputError('correlacao_dimensao', `A matriz de correlação precisa ser ${k}×${k}, uma linha e uma coluna por classe.`)
  }
  for (let i = 0; i < k; i++) {
    if (Math.abs(c[i][i] - 1) > SYMMETRY_TOL) {
      throw new EngineInputError('correlacao_diagonal', `A diagonal da matriz de correlação precisa ser 1 (classe ${codes[i]}).`)
    }
    for (let j = 0; j < k; j++) {
      const v = c[i][j]
      if (!Number.isFinite(v) || v < -1 || v > 1) {
        throw new EngineInputError('correlacao_valor', `Correlação inválida entre ${codes[i]} e ${codes[j]}: precisa estar entre −1 e 1.`)
      }
      if (Math.abs(v - c[j][i]) > SYMMETRY_TOL) {
        throw new EngineInputError('correlacao_simetria', `A matriz de correlação não é simétrica: ${codes[i]} × ${codes[j]} difere de ${codes[j]} × ${codes[i]}.`)
      }
    }
  }
}

/**
 * Fator de Cholesky L (triangular inferior, linha a linha num Float64Array K×K) com L·Lᵀ = C.
 * Lança EngineInputError se a matriz não for positiva definida.
 */
export function cholesky(c: number[][], codes: string[]): Float64Array {
  validateCorrelation(c, codes)
  const k = codes.length
  const l = new Float64Array(k * k)
  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = c[i][j]
      for (let p = 0; p < j; p++) sum -= l[i * k + p] * l[j * k + p]
      if (i === j) {
        if (sum <= PIVOT_MIN) {
          throw new EngineInputError(
            'correlacao_nao_positiva_definida',
            `A matriz de correlação não é positiva definida (falhou na classe ${codes[i]}). Revise as correlações antes de aprovar a versão.`,
          )
        }
        l[i * k + i] = Math.sqrt(sum)
      } else {
        l[i * k + j] = sum / l[j * k + j]
      }
    }
  }
  return l
}

/** Autovalores de uma matriz simétrica pelo método de Jacobi, em ordem crescente. */
export function symmetricEigenvalues(m: number[][]): number[] {
  const n = m.length
  const a = m.map((row) => row.slice())
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j]
    if (off < 1e-22) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const cos = 1 / Math.sqrt(t * t + 1)
        const sin = t * cos
        for (let r = 0; r < n; r++) {
          const arp = a[r][p]
          const arq = a[r][q]
          a[r][p] = cos * arp - sin * arq
          a[r][q] = sin * arp + cos * arq
        }
        for (let r = 0; r < n; r++) {
          const apr = a[p][r]
          const aqr = a[q][r]
          a[p][r] = cos * apr - sin * aqr
          a[q][r] = sin * apr + cos * aqr
        }
      }
    }
  }
  return a.map((row, i) => row[i]).sort((x, y) => x - y)
}
