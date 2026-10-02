import { describe, expect, it } from 'vitest'
import { simulate } from '../simulate.ts'
import { andradeInput } from './helpers.ts'

describe('T14 desempenho', () => {
  it('5.000 trajetórias × 45 anos × 8 classes em menos de 2 s (limite da integração contínua), com o cache frio', () => {
    const input = andradeInput()
    const start = performance.now()
    const res = simulate(input, { paths: 5000, seed: 14 })
    const ms = performance.now() - start
    console.info(`T14: ${res.paths} trajetórias × ${res.T} anos × ${input.cma.classes.length} classes em ${ms.toFixed(0)} ms`)
    expect(res.T).toBe(45)
    expect(input.cma.classes).toHaveLength(8)
    expect(ms).toBeLessThan(2000)
  })
})
