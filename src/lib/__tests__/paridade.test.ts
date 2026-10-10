import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyOps, buildPlanCasesSql, loadPlanCases, OUTPUT } from '../../../scripts/planCases.ts'
import { planSnapshotIssues } from '../planSchema.ts'

const data = loadPlanCases()

describe('paridade entre o esquema do console e a conferência do banco (casos de src/data/plano)', () => {
  it.each(data.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const issues = planSnapshotIssues(applyOps(data.base, c.ops), { classes: data.classes, today: '2026-10-10' })
    expect([...new Set(issues.map((i) => i.path))].sort()).toEqual([...c.paths].sort())
  })

  it('o teste pgTAP gerado está em dia (npm run db:plan-cases)', () => {
    expect(readFileSync(new URL(`../../../${OUTPUT}`, import.meta.url), 'utf8')).toBe(buildPlanCasesSql(data))
  })
})
