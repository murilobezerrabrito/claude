import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { andradeReportArgs, EXAMPLE_SNAPSHOT_PATH } from '../../../scripts/reportExample.ts'
import { buildReportSnapshot, type ReportSnapshot } from '../snapshot.ts'

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
