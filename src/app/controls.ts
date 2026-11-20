// Controles do "E se?" do app (SPEC, "Controles" e "3. E se?"): faixas e passos a partir do plano do mês, os cenários
// prontos em botões e as hipóteses do cenário só com o que difere do plano. O perfil não aparece: no app AI, só a
// carteira atual (D-071). Sem React.

import type { ReportScenarioParams, ScenarioContext } from '../report/scenarios.ts'

export interface ControlValues {
  /** null quando o plano não tem aposentadoria futura do titular (o controle some). */
  retirementAge: number | null
  essentialMonthly: number
  lifestyleMonthly: number
  /** Gasto total em relação ao plano (1 = 100%). */
  spendingMultiplier: number
  /** Renda mensal por nome da renda. */
  incomes: Record<string, number>
  /** Aporte (positivo) ou resgate (negativo) pontual; 0 = nenhum. */
  flowAmount: number
  flowYear: number
  flowMonth: number
  /** Imóvel vendido no cenário ('' = nenhum) e o ano da venda. */
  saleProperty: string
  saleYear: number
  /** Choque no 1º ano, de 0 a −0,30. */
  shock: number
  /** Cenário pronto de choque (no lugar do choque genérico). */
  shockPresetId: string | null
  horizonAge: number
  rulesEnabled: boolean
}

export interface Range {
  min: number
  max: number
  step: number
}

const STEP_MONTHLY = 1_000
const STEP_INCOME = 5_000
const STEP_FLOW = 50_000
const floorTo = (v: number, step: number) => Math.floor(v / step + 1e-9) * step
const ceilTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step
/** Valores do plano arredondados ao passo do controle (o controle mostra o valor do passo mais próximo). */
const roundTo = (v: number, step: number) => Math.round(v / step) * step

export function ranges(ctx: ScenarioContext) {
  const refYear = Number(ctx.refMonth.slice(0, 4))
  return {
    retirementAge: { min: ctx.titularAge, max: 75, step: 1 },
    essentialMonthly: { min: ceilTo(ctx.essentialMonthly * 0.2, STEP_MONTHLY), max: floorTo(ctx.essentialMonthly * 2, STEP_MONTHLY), step: STEP_MONTHLY },
    lifestyleMonthly: { min: 0, max: floorTo(ctx.lifestyleMonthly * 3, STEP_MONTHLY), step: STEP_MONTHLY },
    income: (monthly: number): Range => ({ min: 0, max: floorTo(monthly * 2, STEP_INCOME), step: STEP_INCOME }),
    flowAmount: { min: -floorTo(ctx.wealth * 0.5, STEP_FLOW), max: floorTo(ctx.wealth, STEP_FLOW), step: STEP_FLOW },
    flowYear: { min: refYear, max: Number(ctx.lastMonth.slice(0, 4)), step: 1 },
    shock: { min: -0.3, max: 0, step: 0.05 },
    horizonAge: { min: 85, max: 105, step: 1 },
  }
}

/** Os controles com os valores do plano oficial. */
export function planValues(ctx: ScenarioContext): ControlValues {
  const refYear = Number(ctx.refMonth.slice(0, 4))
  const refMonth = Number(ctx.refMonth.slice(5, 7))
  const futureRetirement = ctx.planRetirementAge !== null && ctx.planRetirementAge > ctx.titularAge
  return {
    retirementAge: futureRetirement ? ctx.planRetirementAge : null,
    essentialMonthly: roundTo(ctx.essentialMonthly, STEP_MONTHLY),
    lifestyleMonthly: roundTo(ctx.lifestyleMonthly, STEP_MONTHLY),
    spendingMultiplier: 1,
    incomes: Object.fromEntries(ctx.incomes.map((i) => [i.name, roundTo(i.monthly, STEP_INCOME)])),
    flowAmount: 0,
    flowYear: refMonth === 12 ? refYear + 1 : refYear,
    flowMonth: refMonth === 12 ? 1 : refMonth + 1,
    saleProperty: '',
    saleYear: ctx.properties[0]?.firstYear ?? refYear + 1,
    shock: 0,
    shockPresetId: null,
    horizonAge: ctx.horizonAge,
    rulesEnabled: ctx.rulesEnabled,
  }
}

/**
 * As hipóteses do cenário: só o que difere do plano oficial (sem nada, é o próprio plano). Gastos e rendas iguais ao
 * valor do plano arredondado ao passo contam como "sem mudança".
 */
export function toParams(v: ControlValues, ctx: ScenarioContext): ReportScenarioParams {
  const plan = planValues(ctx)
  const p: ReportScenarioParams = {}
  if (v.retirementAge !== null && v.retirementAge !== plan.retirementAge) p.retirementAge = v.retirementAge
  if (v.essentialMonthly !== plan.essentialMonthly) p.essentialMonthly = v.essentialMonthly
  if (v.lifestyleMonthly !== plan.lifestyleMonthly) p.lifestyleMonthly = v.lifestyleMonthly
  if (Math.abs(v.spendingMultiplier - 1) > 1e-9) p.spendingMultiplier = v.spendingMultiplier
  const incomes = ctx.incomes.filter((i) => v.incomes[i.name] !== undefined && v.incomes[i.name] !== plan.incomes[i.name])
  if (incomes.length > 0) p.incomes = incomes.map((i) => ({ name: i.name, monthly: v.incomes[i.name] }))
  if (v.flowAmount !== 0) {
    p.extraFlows = [{ kind: v.flowAmount > 0 ? 'aporte' : 'resgate', amount: Math.abs(v.flowAmount), year: v.flowYear, month: v.flowMonth }]
  }
  if (v.saleProperty !== '') p.propertySales = [{ propertyId: v.saleProperty, year: v.saleYear }]
  if (v.shockPresetId !== null) p.shockPresetId = v.shockPresetId
  else if (v.shock < -1e-9) p.firstYearShock = Math.round(v.shock * 100) / 100
  if (v.horizonAge !== plan.horizonAge) p.horizonAge = v.horizonAge
  if (v.rulesEnabled !== plan.rulesEnabled) p.rulesEnabled = v.rulesEnabled
  return p
}

export interface Preset {
  id: string
  label: string
  apply: (v: ControlValues) => ControlValues
}

/** Cenários prontos em botões (SPEC, "3. E se?"), só os que o plano permite. */
export function presets(ctx: ScenarioContext): Preset[] {
  const plan = planValues(ctx)
  const out: Preset[] = []
  if (plan.retirementAge !== null && plan.retirementAge - 3 >= ctx.titularAge) {
    out.push({ id: 'aposentar-antes', label: 'Aposentar 3 anos antes', apply: (v) => ({ ...v, retirementAge: (plan.retirementAge as number) - 3 }) })
  }
  const property = ctx.properties[0]
  if (property) {
    out.push({ id: 'vender-imovel', label: 'Vender um imóvel', apply: (v) => ({ ...v, saleProperty: property.id, saleYear: property.firstYear }) })
  }
  out.push(
    { id: 'crise-2008', label: 'Crise como a de 2008', apply: (v) => ({ ...v, shockPresetId: 'crise-2008', shock: 0 }) },
    { id: 'inflacao-alta', label: 'Inflação alta por 5 anos', apply: (v) => ({ ...v, shockPresetId: 'inflacao-alta', shock: 0 }) },
    { id: 'gastar-mais', label: 'Gastar 10% a mais', apply: (v) => ({ ...v, spendingMultiplier: 1.1 }) },
  )
  return out
}
