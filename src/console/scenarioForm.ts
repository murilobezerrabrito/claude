// Formulário dos cenários da conversa do mês (SPEC, "Controles", sem a alocação; D-070): até três mudanças por cenário,
// cada uma numa linha. As linhas viram as hipóteses do cenário (ReportScenarioParams) e a conferência do servidor
// (scenarioIssues) roda antes do envio, com cada problema na linha a que pertence. Sem React.

import { formatMoneyExact, formatMonthLabel } from '../lib/format.ts'
import { parseDecimalBr, parseIntBr } from '../lib/planForm.ts'
import { SHOCK_PRESETS, type ReportScenarioParams, type ScenarioContext, type ScenarioIssue } from '../report/scenarios.ts'

export type ChangeKind =
  | 'retirementAge'
  | 'essentialMonthly'
  | 'lifestyleMonthly'
  | 'spendingMultiplier'
  | 'income'
  | 'extraFlow'
  | 'propertySale'
  | 'firstYearShock'
  | 'shockPreset'
  | 'horizonAge'
  | 'rulesEnabled'

/** Uma mudança do cenário, como digitada: os campos que o tipo usa (os outros ficam vazios). */
export interface ScenarioChange {
  kind: ChangeKind
  /** Idade, valor em reais, percentual do gasto ou choque. */
  value: string
  /** Renda (nome), imóvel (id), aporte ou resgate, cenário pronto, com ou sem ajustes. */
  target: string
  /** Mês do aporte ou resgate (1 a 12). */
  month: string
  /** Ano do aporte, do resgate ou da venda. */
  year: string
}

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  retirementAge: 'Idade de aposentadoria',
  essentialMonthly: 'Gasto essencial por mês',
  lifestyleMonthly: 'Gasto de estilo de vida por mês',
  spendingMultiplier: 'Gasto total',
  income: 'Renda mensal',
  extraFlow: 'Aporte ou resgate pontual',
  propertySale: 'Venda de imóvel',
  firstYearShock: 'Choque no 1º ano',
  shockPreset: 'Cenário pronto de choque',
  horizonAge: 'Horizonte',
  rulesEnabled: 'Ajustes de gasto em anos ruins',
}

/** Mudanças que podem aparecer mais de uma vez (uma por renda, fluxo ou imóvel). */
const REPEATABLE: readonly ChangeKind[] = ['income', 'extraFlow', 'propertySale']

/** As mudanças que o plano do mês permite (sem aposentadoria futura no plano, por exemplo, a idade não aparece). */
export function availableKinds(ctx: ScenarioContext): ChangeKind[] {
  const out: ChangeKind[] = []
  if (ctx.planRetirementAge !== null && ctx.planRetirementAge > ctx.titularAge) out.push('retirementAge')
  if (ctx.essentialMonthly > 0) out.push('essentialMonthly')
  if (ctx.lifestyleMonthly > 0) out.push('lifestyleMonthly')
  out.push('spendingMultiplier')
  if (ctx.incomes.length > 0) out.push('income')
  out.push('extraFlow')
  if (ctx.properties.length > 0) out.push('propertySale')
  out.push('firstYearShock', 'shockPreset', 'horizonAge', 'rulesEnabled')
  return out
}

/** Pode entrar mais uma mudança deste tipo (os tipos de valor único entram uma vez). */
export function kindAllowed(kind: ChangeKind, changes: readonly ScenarioChange[], ownIndex: number | null = null): boolean {
  if (REPEATABLE.includes(kind)) return true
  return !changes.some((c, i) => c.kind === kind && i !== ownIndex)
}

/** Mudança nova: os campos de texto vazios (o plano aparece como dica) e as escolhas na primeira opção. */
export function newChange(kind: ChangeKind, ctx: ScenarioContext): ScenarioChange {
  const base: ScenarioChange = { kind, value: '', target: '', month: '', year: '' }
  const refYear = Number(ctx.refMonth.slice(0, 4))
  switch (kind) {
    case 'spendingMultiplier':
      return { ...base, value: '1.1' }
    case 'income':
      return { ...base, target: ctx.incomes[0]?.name ?? '' }
    case 'extraFlow':
      return { ...base, target: 'aporte', month: '1', year: String(refYear + 1) }
    case 'propertySale':
      return { ...base, target: ctx.properties[0]?.id ?? '', year: String(ctx.properties[0]?.firstYear ?? refYear + 1) }
    case 'firstYearShock':
      return { ...base, value: '-0.2' }
    case 'shockPreset':
      return { ...base, target: SHOCK_PRESETS[0].id }
    case 'rulesEnabled':
      return { ...base, target: ctx.rulesEnabled ? 'sem' : 'com' }
    default:
      return base
  }
}

/** Opções do gasto total: de 50% a 200% do plano, de 5 em 5 pontos, sem o 100%. */
export const SPENDING_OPTIONS: { value: string; label: string }[] = Array.from({ length: 31 }, (_, i) => 50 + i * 5)
  .filter((pct) => pct !== 100)
  .map((pct) => ({ value: String(pct / 100), label: `${pct}% do plano (gastar ${Math.abs(pct - 100)}% a ${pct > 100 ? 'mais' : 'menos'})` }))

/** Opções do choque no 1º ano: de −5% a −30%, de 5 em 5 pontos. */
export const SHOCK_OPTIONS: { value: string; label: string }[] = [5, 10, 15, 20, 25, 30].map((p) => ({ value: String(-p / 100), label: `−${p}%` }))

/** O que o plano tem hoje, como dica ao lado do campo. */
export function planHint(c: ScenarioChange, ctx: ScenarioContext): string | null {
  switch (c.kind) {
    case 'retirementAge':
      return ctx.planRetirementAge === null ? null : `No plano: aos ${ctx.planRetirementAge} (o titular tem ${ctx.titularAge}).`
    case 'essentialMonthly':
      return `No plano: ${formatMoneyExact(ctx.essentialMonthly)} por mês. De R$ 1 mil em R$ 1 mil.`
    case 'lifestyleMonthly':
      return `No plano: ${formatMoneyExact(ctx.lifestyleMonthly)} por mês. De R$ 1 mil em R$ 1 mil.`
    case 'income': {
      const inc = ctx.incomes.find((i) => i.name === c.target)
      return inc ? `No plano: ${formatMoneyExact(inc.monthly)} por mês. De R$ 5 mil em R$ 5 mil.` : null
    }
    case 'extraFlow':
      return `Depois de ${formatMonthLabel(ctx.refMonth)}, de R$ 50 mil em R$ 50 mil.`
    case 'propertySale': {
      const p = ctx.properties.find((x) => x.id === c.target)
      return p ? `Em julho, de ${p.firstYear} a ${p.lastYear}.` : null
    }
    case 'horizonAge':
      return `No plano: até os ${ctx.horizonAge}. De 85 a 105 anos.`
    case 'rulesEnabled':
      return `No plano: ${ctx.rulesEnabled ? 'com' : 'sem'} ajustes.`
    default:
      return null
  }
}

/** Número digitado; vazio ou inválido vira NaN, e a conferência recusa com a mensagem do campo. */
const money = (s: string) => parseDecimalBr(s) ?? NaN
const int = (s: string) => parseIntBr(s) ?? NaN

/**
 * As linhas como hipóteses do cenário, e a linha de cada campo (para mostrar o problema da conferência onde ele está).
 */
export function scenarioFromChanges(changes: readonly ScenarioChange[]): { params: ReportScenarioParams; rowOf: (path: string) => number | null } {
  const params: ReportScenarioParams = {}
  const rows = new Map<string, number>()
  changes.forEach((c, row) => {
    switch (c.kind) {
      case 'retirementAge':
        params.retirementAge = int(c.value)
        rows.set('retirementAge', row)
        break
      case 'essentialMonthly':
        params.essentialMonthly = money(c.value)
        rows.set('essentialMonthly', row)
        break
      case 'lifestyleMonthly':
        params.lifestyleMonthly = money(c.value)
        rows.set('lifestyleMonthly', row)
        break
      case 'spendingMultiplier':
        params.spendingMultiplier = Number(c.value)
        rows.set('spendingMultiplier', row)
        break
      case 'income':
        params.incomes = [...(params.incomes ?? []), { name: c.target, monthly: money(c.value) }]
        rows.set(`incomes.${params.incomes.length - 1}`, row)
        break
      case 'extraFlow':
        params.extraFlows = [
          ...(params.extraFlows ?? []),
          { kind: c.target === 'resgate' ? 'resgate' : 'aporte', amount: money(c.value), year: int(c.year), month: int(c.month) },
        ]
        rows.set(`extraFlows.${params.extraFlows.length - 1}`, row)
        break
      case 'propertySale':
        params.propertySales = [...(params.propertySales ?? []), { propertyId: c.target, year: int(c.year) }]
        rows.set(`propertySales.${params.propertySales.length - 1}`, row)
        break
      case 'firstYearShock':
        params.firstYearShock = Number(c.value)
        rows.set('firstYearShock', row)
        break
      case 'shockPreset':
        params.shockPresetId = c.target
        rows.set('shockPresetId', row)
        break
      case 'horizonAge':
        params.horizonAge = int(c.value)
        rows.set('horizonAge', row)
        break
      case 'rulesEnabled':
        params.rulesEnabled = c.target === 'com'
        rows.set('rulesEnabled', row)
        break
    }
  })
  const rowOf = (path: string): number | null => {
    if (rows.has(path)) return rows.get(path)!
    const m = /^(incomes|extraFlows|propertySales)\.(\d+)/.exec(path)
    return m ? (rows.get(`${m[1]}.${m[2]}`) ?? null) : null
  }
  return { params, rowOf }
}

/** Os problemas da conferência por linha; os do cenário como um todo (sem linha) ficam em `general`. */
export function issuesByRow(issues: readonly ScenarioIssue[], rowOf: (path: string) => number | null): { rows: Map<number, string[]>; general: string[] } {
  const rows = new Map<number, string[]>()
  const general: string[] = []
  for (const issue of issues) {
    const row = issue.path === '' ? null : rowOf(issue.path)
    if (row === null) general.push(issue.message)
    else rows.set(row, [...(rows.get(row) ?? []), issue.message])
  }
  return { rows, general }
}

