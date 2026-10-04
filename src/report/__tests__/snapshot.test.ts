import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { andradeReportArgs, EXAMPLE_SNAPSHOT_PATH } from '../../../scripts/reportExample.ts'
import type { Person } from '../../engine/types.ts'
import { buildReportSnapshot, trajectoryMarkers, type ReportSnapshot } from '../snapshot.ts'

const frozen = JSON.parse(readFileSync(new URL(`../../../${EXAMPLE_SNAPSHOT_PATH}`, import.meta.url), 'utf8')) as ReportSnapshot
const recalculado = JSON.parse(JSON.stringify(buildReportSnapshot(andradeReportArgs()))) as ReportSnapshot

describe('números congelados do relatório de exemplo (Andrade, out/2026)', () => {
  it('o recálculo dá exatamente os números gravados; se o motor mudar, rode npm run report:snapshot e revise', () => {
    expect(recalculado).toEqual(frozen)
  })

  it('o snapshot traz a rodada, a ponte, a rentabilidade, a carteira, a trajetória, os cenários e os textos', () => {
    expect(frozen.refMonth).toBe('2026-10')
    expect(frozen.run.paths).toBe(10_000)
    expect(frozen.bridge.kind).toBe('ponte')
    expect(frozen.performance.month?.real).toBeCloseTo(-0.0249, 4)
    expect(frozen.portfolio.classes.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 12)
    expect(frozen.trajectory.realized.map((r) => r.month)).toEqual(['2026-09', '2026-10'])
    expect(frozen.scenarios.map((s) => s.id)).toEqual(['aposentar-3-anos-antes', 'crise-2008', 'gastar-10-mais'])
    expect(frozen.comment.example).toBe(true)
    expect(frozen.texts.footer).toContain('out/2026')
  })
})

describe('marcos da trajetória (página 5)', () => {
  const people: Person[] = [
    { id: 't', name: 'Titular', birthDate: '1974-03-15', sex: 'M', role: 'titular', retirementAge: 62 },
    { id: 'c', name: 'Cônjuge', birthDate: '1976-08-02', sex: 'F', role: 'conjuge' },
  ]
  // Out/2026: a cônjuge tem 50 anos e 2 meses; o horizonte vai até os 95.
  const base = { people, fromAge: 50 + 2 / 12, toAge: 95 }

  it('evento único ainda neste ano entra; evento e aposentadoria já passados ficam de fora', () => {
    const m = trajectoryMarkers({
      ...base,
      retirementYear: 2036,
      events: [
        { name: 'Viagem de dezembro', direction: 'saida', amountReal: 1, year: 2026, month: 12, recurrence: 'unica' },
        { name: 'Reforma passada', direction: 'saida', amountReal: 1, year: 2026, month: 3, recurrence: 'unica' },
        { name: 'Faculdade', direction: 'saida', amountReal: 1, year: 2027, endYear: 2030, recurrence: 'anual' },
      ],
    })
    expect(m.map((x) => x.label)).toEqual(['Viagem de dezembro', 'Aposentadoria'])
    expect(m[0].age).toBeCloseTo(50 + 4 / 12, 12)
    expect(m[1].age).toBeCloseTo(59 + 7 / 12, 12) // março de 2036
    expect(trajectoryMarkers({ ...base, retirementYear: 2020, events: [] })).toEqual([])
  })
})
