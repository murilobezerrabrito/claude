// Formulário dos cenários do relatório: as linhas viram as hipóteses que o servidor confere e roda, cada problema volta
// para a sua linha, e os cenários do exemplo da Fase 1 saem com o nome automático. Contexto: a Família Andrade em
// outubro de 2026 (o snapshot do exemplo).

import { describe, expect, it } from 'vitest'
import snapshotData from '../../data/relatorios/andrade-2026-10.json'
import { scenarioIssues, scenarioName } from '../../report/scenarios.ts'
import type { ReportSnapshot } from '../../report/snapshot.ts'
import { availableKinds, issuesByRow, kindAllowed, newChange, scenarioFromChanges, SPENDING_OPTIONS, type ScenarioChange } from '../scenarioForm.ts'

const ctx = (snapshotData as unknown as ReportSnapshot).scenarioContext
const change = (over: Partial<ScenarioChange> & Pick<ScenarioChange, 'kind'>): ScenarioChange => ({ ...newChange(over.kind, ctx), ...over })

function check(changes: ScenarioChange[]) {
  const { params, rowOf } = scenarioFromChanges(changes)
  const issues = scenarioIssues(params, ctx)
  return { params, issues, byRow: issuesByRow(issues, rowOf), name: issues.length === 0 ? scenarioName(params, ctx) : null }
}

describe('cenários do relatório no console', () => {
  it('os três cenários do exemplo saem com o nome automático', () => {
    expect(check([change({ kind: 'retirementAge', value: '59' })])).toMatchObject({ params: { retirementAge: 59 }, name: 'Aposentar 3 anos antes (aos 59)' })
    expect(check([change({ kind: 'shockPreset', target: 'crise-2008' })])).toMatchObject({
      params: { shockPresetId: 'crise-2008' },
      name: 'Crise como a de 2008 no 1º ano',
    })
    expect(check([change({ kind: 'spendingMultiplier', value: '1.1' })])).toMatchObject({ params: { spendingMultiplier: 1.1 }, name: 'Gastar 10% a mais' })
  })

  it('valores no formato brasileiro, várias mudanças e o nome com todas', () => {
    const r = check([
      change({ kind: 'essentialMonthly', value: '50.000' }),
      change({ kind: 'extraFlow', target: 'resgate', value: '500.000,00', month: '3', year: '2028' }),
      change({ kind: 'propertySale', target: 'casa-praia', year: '2030' }),
    ])
    expect(r.issues).toEqual([])
    expect(r.params).toEqual({
      essentialMonthly: 50_000,
      extraFlows: [{ kind: 'resgate', amount: 500_000, year: 2028, month: 3 }],
      propertySales: [{ propertyId: 'casa-praia', year: 2030 }],
    })
    expect(r.name).toBe('Gasto essencial de R$ 50 mil por mês, resgate de R$ 500 mil em mar/2028 e imóvel Casa de praia vendido em 2030')
  })

  it('cada problema volta para a sua linha; os do cenário todo ficam à parte', () => {
    const r = check([
      change({ kind: 'propertySale', target: 'casa-praia', year: '2030' }),
      change({ kind: 'propertySale', target: 'sala', year: '2090' }),
      change({ kind: 'retirementAge', value: '' }),
      change({ kind: 'horizonAge', value: '95' }),
    ])
    expect([...r.byRow.rows.keys()].sort()).toEqual([1, 2, 3])
    expect(r.byRow.rows.get(1)).toEqual(['Use um ano de 2027 a 2071.'])
    expect(r.byRow.rows.get(2)).toEqual(['Use uma idade inteira de 52 a 75 anos.'])
    expect(r.byRow.rows.get(3)).toEqual(['É o horizonte do plano: escolha outro.'])
    expect(r.byRow.general).toEqual(['Use até 3 mudanças por cenário.'])
  })

  it('tipos de valor único entram uma vez; rendas, fluxos e imóveis podem repetir', () => {
    const changes = [change({ kind: 'retirementAge' }), change({ kind: 'extraFlow' })]
    expect(kindAllowed('retirementAge', changes)).toBe(false)
    expect(kindAllowed('retirementAge', changes, 0)).toBe(true)
    expect(kindAllowed('extraFlow', changes)).toBe(true)
  })

  it('o formulário oferece só o que o plano do mês tem', () => {
    expect(availableKinds(ctx)).toContain('retirementAge')
    expect(availableKinds({ ...ctx, planRetirementAge: 50 })).not.toContain('retirementAge')
    expect(availableKinds({ ...ctx, incomes: [], properties: [] })).not.toContain('income')
    expect(availableKinds({ ...ctx, incomes: [], properties: [] })).not.toContain('propertySale')
  })

  it('as opções do gasto total e do choque passam na conferência', () => {
    for (const o of SPENDING_OPTIONS) expect(check([change({ kind: 'spendingMultiplier', value: o.value })]).issues).toEqual([])
    for (const v of ['-0.05', '-0.1', '-0.15', '-0.2', '-0.25', '-0.3']) expect(check([change({ kind: 'firstYearShock', value: v })]).issues).toEqual([])
    expect(check([change({ kind: 'rulesEnabled' })])).toMatchObject({ params: { rulesEnabled: false }, name: 'Sem ajustes de gasto em anos ruins' })
  })
})
