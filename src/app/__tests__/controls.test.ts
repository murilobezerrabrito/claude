// Controles do "E se?" do app: o plano sem mudança é o cenário vazio, os cenários prontos e os extremos de cada faixa
// passam na mesma conferência do servidor (sem o limite de mudanças do relatório). Andrade, out/2026, como cliente AI.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_EXAMPLE_PATH } from '../../../scripts/appExample.ts'
import { scenarioIssues, scenarioName } from '../../report/scenarios.ts'
import { planValues, presets, ranges, toParams } from '../controls.ts'
import type { ClientMonthView } from '../types.ts'

const view = JSON.parse(readFileSync(new URL(`../../../${APP_EXAMPLE_PATH}`, import.meta.url), 'utf8')) as ClientMonthView
const ctx = view.snapshot.scenarioContext
const issues = (p: object) => scenarioIssues(p, ctx, { maxChanges: Infinity })

describe('controles do E se? no app', () => {
  it('sem mexer, é o plano oficial', () => {
    expect(toParams(planValues(ctx), ctx)).toEqual({})
  })

  it('cenários prontos: hipóteses válidas e o nome automático', () => {
    const names = presets(ctx).map((p) => {
      const params = toParams(p.apply(planValues(ctx)), ctx)
      expect(issues(params), p.id).toEqual([])
      return scenarioName(params, ctx).replace(/\u00a0/g, ' ')
    })
    expect(names).toEqual([
      'Aposentar 3 anos antes (aos 59)',
      'Imóvel Casa de praia vendido em 2027',
      'Crise como a de 2008 no 1º ano',
      'Inflação alta nos 5 primeiros anos',
      'Gastar 10% a mais',
    ])
  })

  it('os extremos de cada faixa passam na conferência, todos juntos', () => {
    const r = ranges(ctx)
    const income = ctx.incomes[0]
    for (const edge of ['min', 'max'] as const) {
      const v = {
        ...planValues(ctx),
        retirementAge: edge === 'min' ? r.retirementAge.min : r.retirementAge.max,
        essentialMonthly: r.essentialMonthly[edge],
        lifestyleMonthly: edge === 'min' ? 0 : r.lifestyleMonthly.max,
        incomes: { [income.name]: r.income(income.monthly)[edge] },
        flowAmount: r.flowAmount[edge],
        flowYear: r.flowYear.max,
        flowMonth: Number(ctx.lastMonth.slice(5, 7)),
        saleProperty: ctx.properties[0].id,
        saleYear: ctx.properties[0].lastYear,
        shock: r.shock.min,
        horizonAge: r.horizonAge[edge] === ctx.horizonAge ? 100 : r.horizonAge[edge],
        rulesEnabled: !ctx.rulesEnabled,
      }
      const params = toParams(v, ctx)
      expect(Object.keys(params).length).toBeGreaterThan(6)
      // A venda no último ano e o fluxo no último mês valem para o horizonte do plano; com outro horizonte, a conferência
      // usa o do cenário (85 encurta: só os itens dentro dele passam).
      if (params.horizonAge !== undefined && params.horizonAge < ctx.horizonAge) {
        expect(issues(params).map((i) => i.path).sort()).toEqual(['extraFlows.0.month', 'propertySales.0.year'])
      } else expect(issues(params), edge).toEqual([])
    }
  })

  it('gasto e renda iguais ao valor do plano no passo do controle não contam como mudança', () => {
    const v = planValues(ctx)
    expect(v.essentialMonthly % 1_000).toBe(0)
    expect(toParams({ ...v, essentialMonthly: v.essentialMonthly + 1_000 }, ctx)).toEqual({ essentialMonthly: v.essentialMonthly + 1_000 })
    expect(toParams({ ...v, flowAmount: -100_000 }, ctx).extraFlows).toEqual([{ kind: 'resgate', amount: 100_000, year: 2026, month: 11 }])
  })
})
