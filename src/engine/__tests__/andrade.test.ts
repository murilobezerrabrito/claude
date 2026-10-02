import { describe, expect, it } from 'vitest'
import referenceData from '../../../reference/resultados_referencia.json'
import { compare, computeMetrics, type ReferenceFile } from '../../../scripts/referenceMetrics.ts'
import { DEFAULT_SEED } from '../simulate.ts'
import { andradeInput } from './helpers.ts'

const reference = referenceData as ReferenceFile

describe('T13 Família Andrade', () => {
  // 20.000 trajetórias aqui; o npm run reference usa as 50.000 da referência.
  const rows = compare(reference, computeMetrics(andradeInput(), 20_000, DEFAULT_SEED))

  it('calcula todas as métricas da tabela de referência', () => {
    expect(rows.map((r) => r.id)).toEqual(reference.metricas.map((m) => m.id))
  })

  it.each(rows.map((r) => [r.descricao, r] as const))('%s dentro da tolerância', (_name, r) => {
    expect(Math.abs(r.diferenca), `obtido ${r.obtido}, referência ${r.valor}`).toBeLessThanOrEqual(r.tolerancia + 1e-12)
  })
})
