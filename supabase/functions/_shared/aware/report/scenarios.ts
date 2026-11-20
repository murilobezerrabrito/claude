// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Cenários "E se?" da conversa do mês (SPEC, "Conteúdo do relatório", página 6, e "Controles"): até três por relatório,
// escolhidos pela gestão, com os controles do SPEC menos a alocação (perfil ou pesos), para o relatório não sugerir
// alocação (D-070). Cada cenário roda com as 10.000 trajetórias e os mesmos sorteios da rodada oficial (D-036). O nome
// é automático: o comentário da gestão continua o único texto livre do relatório.

import { buildPlan, DEFAULT_EVENT_MONTH } from '../engine/plan.ts'
import { simulate } from '../engine/simulate.ts'
import type { PlanEvent, RequiredReturnStatus, Scenario, ShockPreset } from '../engine/types.ts'
import { formatMonthLabel } from '../lib/format.ts'
import type { IpcaSeries } from './inflation.ts'
import { buildMonthInputs } from './monthInputs.ts'
import { mainInput, OFFICIAL_PATHS, type MonthPackage } from './officialRun.ts'

/** Até três cenários por relatório (página 6). */
export const MAX_REPORT_SCENARIOS = 3
/** Até três mudanças por cenário, para o nome caber na página 6. */
export const MAX_SCENARIO_CHANGES = 3

/** Cenários prontos de choque (SPEC, "Choques e testes de estresse"); os mesmos de src/data/choques.json (teste). */
export const SHOCK_PRESETS: readonly ShockPreset[] = [
  {
    id: 'crise-2008',
    name: 'Crise como a de 2008',
    fromYear: 1,
    toYear: 1,
    deltas: { POS: 0, INF: -0.05, PRE: -0.03, CRED: -0.06, MM: -0.08, ACOES: -0.35, FII: -0.2, INTL: 0.05 },
  },
  {
    id: 'inflacao-alta',
    name: 'Inflação alta',
    fromYear: 1,
    toYear: 5,
    deltas: { POS: 0, INF: -0.01, PRE: -0.04, CRED: -0.01, MM: -0.01, ACOES: -0.03, FII: -0.02, INTL: 0.01 },
  },
  {
    id: 'decada-perdida',
    name: 'Década perdida',
    fromYear: 1,
    toYear: 10,
    deltas: { POS: 0, INF: -0.005, PRE: 0, CRED: -0.005, MM: -0.01, ACOES: -0.03, FII: -0.02, INTL: 0 },
  },
]

/** Hipóteses de um cenário do relatório: os controles do SPEC, sem perfil nem pesos. Valores em reais de hoje. */
export interface ReportScenarioParams {
  retirementAge?: number
  /** Gasto essencial mensal (o do primeiro mês simulado, D-032). */
  essentialMonthly?: number
  /** Gasto de estilo de vida mensal (o do primeiro mês simulado, D-032). */
  lifestyleMonthly?: number
  /** Gasto total (essencial e estilo de vida) multiplicado: 1,1 é gastar 10% a mais. */
  spendingMultiplier?: number
  /** Renda mensal por fonte (pelo nome da renda no plano). */
  incomes?: { name: string; monthly: number }[]
  /** Aportes e resgates pontuais, com valor positivo, no mês escolhido. */
  extraFlows?: { kind: 'aporte' | 'resgate'; amount: number; year: number; month: number }[]
  propertySales?: { propertyId: string; year: number }[]
  /** Choque genérico no 1º ano, de −5% a −30%, de 5 em 5 pontos. */
  firstYearShock?: number
  /** Cenário pronto de choque (SHOCK_PRESETS). */
  shockPresetId?: string
  horizonAge?: number
  rulesEnabled?: boolean
}

/** O que o plano tem no mês do relatório, para as faixas dos controles e o nome do cenário. */
export interface ScenarioContext {
  refMonth: string
  /** Idade do titular no mês do relatório, em anos completos. */
  titularAge: number
  /** Idade de aposentadoria do titular no plano; null sem aposentadoria no plano. */
  planRetirementAge: number | null
  /** Gastos do primeiro mês simulado (D-032). */
  essentialMonthly: number
  lifestyleMonthly: number
  /** Rendas do plano em vigor no mês do relatório, por nome. */
  incomes: { name: string; monthly: number }[]
  /** Patrimônio simulado na data de referência. */
  wealth: number
  /** Imóveis que podem ser vendidos, com os anos possíveis da venda no plano (em julho, como no motor). */
  properties: { id: string; name: string; firstYear: number; lastYear: number }[]
  /** Último mês simulado no plano (AAAA-MM): aportes e resgates depois dele não entrariam no cálculo. */
  lastMonth: string
  /** Mês de nascimento do membro mais jovem do casal (AAAA-MM): o horizonte do cenário conta a partir dele. */
  youngestBirthMonth: string
  horizonAge: number
  rulesEnabled: boolean
}

export interface ScenarioIssue {
  /** Campo com problema ("retirementAge", "incomes.0.monthly"); vazio no cenário como um todo. */
  path: string
  message: string
}

const STEP_MONTHLY = 1_000
const STEP_INCOME = 5_000
const STEP_FLOW = 50_000
const MAX_RETIREMENT_AGE = 75
const HORIZON_RANGE = { min: 85, max: 105 }
const SPENDING_MULTIPLIER = { min: 0.5, max: 2 }
const KEYS: readonly (keyof ReportScenarioParams)[] = [
  'retirementAge', 'essentialMonthly', 'lifestyleMonthly', 'spendingMultiplier', 'incomes', 'extraFlows', 'propertySales',
  'firstYearShock', 'shockPresetId', 'horizonAge', 'rulesEnabled',
]

const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1

/** O contexto dos controles a partir do pacote do mês (o mesmo da rodada oficial gravada). */
export function scenarioContext(pkg: MonthPackage, ipca: IpcaSeries): ScenarioContext {
  const month = buildMonthInputs({ ...pkg, ipca })
  const plan = buildPlan(month.input)
  const refMonth = pkg.closing.refDate.slice(0, 7)
  const refYear = Number(refMonth.slice(0, 4))
  const people = month.input.household.people
  const titular = people.find((p) => p.role === 'titular') ?? people[0]
  const titularAge = Math.floor((monthIndex(refMonth) - monthIndex(titular.birthDate.slice(0, 7))) / 12)
  const couple = people.filter((p) => p.role === 'titular' || p.role === 'conjuge')
  const youngest = (couple.length > 0 ? couple : people).reduce((a, b) => (b.birthDate > a.birthDate ? b : a))
  const incomes = new Map<string, number>()
  for (const cf of month.input.household.cashFlows) {
    if (cf.kind === 'renda' && cf.startYear <= refYear && cf.endYear >= refYear && !incomes.has(cf.name)) incomes.set(cf.name, cf.annualAmountReal / 12)
  }
  // Anos de venda como no motor: em julho, depois do primeiro mês simulado e até o último.
  const lastMonth = plan.firstMonth + plan.stepMonths.reduce((a, b) => a + b, 0) - 1
  const yearOf = (idx: number) => Math.floor(idx / 12)
  const monthOf = (idx: number) => (idx % 12) + 1
  const firstYear = yearOf(plan.firstMonth) + (monthOf(plan.firstMonth) > DEFAULT_EVENT_MONTH ? 1 : 0)
  const lastYear = yearOf(lastMonth) - (monthOf(lastMonth) < DEFAULT_EVENT_MONTH ? 1 : 0)
  return {
    refMonth,
    titularAge,
    planRetirementAge: plan.retirementAge,
    essentialMonthly: plan.firstMonthEssential,
    lifestyleMonthly: plan.firstMonthLifestyle,
    incomes: [...incomes].map(([name, monthly]) => ({ name, monthly })),
    wealth: plan.W0,
    properties: month.input.household.otherAssets
      .filter((a) => a.kind === 'imovel' && a.canBeSold === true)
      .map((a) => ({ id: a.id, name: a.name, firstYear, lastYear })),
    lastMonth: monthOfIndex(lastMonth),
    youngestBirthMonth: youngest.birthDate.slice(0, 7),
    horizonAge: pkg.household.horizonAge,
    rulesEnabled: pkg.planVersion.snapshot.rules.enabled,
  }
}

const monthOfIndex = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`

/**
 * Último mês simulado no cenário: o do plano ou, com outro horizonte, o mês em que o membro mais jovem do casal chega à
 * idade-limite (como no motor).
 */
function scenarioLastMonth(ctx: ScenarioContext, horizonAge: unknown): number {
  const valid = isNumber(horizonAge) && Number.isInteger(horizonAge) && horizonAge >= HORIZON_RANGE.min && horizonAge <= HORIZON_RANGE.max
  return valid ? monthIndex(ctx.youngestBirthMonth) + horizonAge * 12 : monthIndex(ctx.lastMonth)
}

// Entre "R$" e o número, e antes de "mil" e "mi", o espaço que não quebra a linha (D-036).
const NBSP = ' '
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const multipleOf = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9
const money = (v: number) => `R$${NBSP}${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`

/**
 * Confere o cenário com as faixas e os passos do SPEC ("Controles") e o que o plano tem no mês. Devolve os problemas
 * em português, por campo; lista vazia é cenário válido. O console e o servidor usam a mesma conferência; o app do
 * cliente AI, sem o limite de mudanças (que é do nome na página 6 do relatório).
 */
export function scenarioIssues(raw: unknown, ctx: ScenarioContext, opts: { maxChanges?: number } = {}): ScenarioIssue[] {
  const maxChanges = opts.maxChanges ?? MAX_SCENARIO_CHANGES
  const issues: ScenarioIssue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return [{ path: '', message: 'Cenário inválido.' }]
  const p = raw as Record<string, unknown>
  for (const key of Object.keys(p)) if (!KEYS.includes(key as keyof ReportScenarioParams)) add(key, `Controle desconhecido: ${key}.`)
  const present = KEYS.filter((k) => p[k] !== undefined)
  if (present.length === 0) add('', 'Escolha ao menos uma mudança.')
  const changes = present.reduce((n, k) => n + (Array.isArray(p[k]) ? (p[k] as unknown[]).length : 1), 0)
  if (changes > maxChanges) add('', `Use até ${maxChanges} mudanças por cenário.`)

  if (p.retirementAge !== undefined) {
    const v = p.retirementAge
    if (ctx.planRetirementAge === null) add('retirementAge', 'O plano não tem idade de aposentadoria.')
    else if (ctx.planRetirementAge <= ctx.titularAge) add('retirementAge', 'No plano, o titular já se aposentou.')
    else if (!isNumber(v) || !Number.isInteger(v) || v < ctx.titularAge || v > MAX_RETIREMENT_AGE) {
      add('retirementAge', `Use uma idade inteira de ${ctx.titularAge} a ${MAX_RETIREMENT_AGE} anos.`)
    } else if (v === ctx.planRetirementAge) add('retirementAge', 'É a idade do plano: escolha outra.')
  }
  const monthly = (key: 'essentialMonthly' | 'lifestyleMonthly', current: number, maxFactor: number, minFactor: number, what: string) => {
    const v = p[key]
    if (v === undefined) return
    if (current <= 0) add(key, `O plano não tem ${what} no primeiro mês.`)
    else if (!isNumber(v) || v < current * minFactor - 1e-6 || v > current * maxFactor + 1e-6 || !multipleOf(v, STEP_MONTHLY)) {
      add(key, `Use de ${money(Math.ceil((current * minFactor) / STEP_MONTHLY) * STEP_MONTHLY)} a ${money(Math.floor((current * maxFactor) / STEP_MONTHLY) * STEP_MONTHLY)} por mês, de R$ 1 mil em R$ 1 mil.`)
    } else if (Math.abs(v - current) < 0.5) add(key, 'É o valor do plano: escolha outro.')
  }
  monthly('essentialMonthly', ctx.essentialMonthly, 2, 0.2, 'gasto essencial')
  monthly('lifestyleMonthly', ctx.lifestyleMonthly, 3, 0, 'gasto de estilo de vida')
  if (p.spendingMultiplier !== undefined) {
    const v = p.spendingMultiplier
    if (!isNumber(v) || v < SPENDING_MULTIPLIER.min || v > SPENDING_MULTIPLIER.max || !multipleOf(v, 0.05) || Math.abs(v - 1) < 1e-9) {
      add('spendingMultiplier', 'Use de 50% a 200% do gasto do plano, de 5 em 5 pontos, diferente de 100%.')
    }
  }
  if (p.incomes !== undefined) {
    if (!Array.isArray(p.incomes) || p.incomes.length === 0) add('incomes', 'Lista de rendas inválida.')
    else {
      const seen = new Set<string>()
      p.incomes.forEach((item: unknown, i) => {
        const it = (item ?? {}) as { name?: unknown; monthly?: unknown }
        const plan = ctx.incomes.find((x) => x.name === it.name)
        if (!plan) add(`incomes.${i}.name`, 'Escolha uma renda do plano.')
        else if (seen.has(plan.name)) add(`incomes.${i}.name`, 'Essa renda já está no cenário.')
        else if (!isNumber(it.monthly) || it.monthly < 0 || it.monthly > plan.monthly * 2 + 1e-6 || !multipleOf(it.monthly, STEP_INCOME)) {
          add(`incomes.${i}.monthly`, `Use de R$ 0 a ${money(Math.floor((plan.monthly * 2) / STEP_INCOME) * STEP_INCOME)} por mês, de R$ 5 mil em R$ 5 mil.`)
        }
        if (plan) seen.add(plan.name)
      })
    }
  }
  const lastIdx = scenarioLastMonth(ctx, p.horizonAge)
  // Ano de venda como no motor: em julho, até o último mês simulado.
  const lastSaleYear = Math.floor(lastIdx / 12) - ((lastIdx % 12) + 1 < DEFAULT_EVENT_MONTH ? 1 : 0)
  if (p.extraFlows !== undefined) {
    if (!Array.isArray(p.extraFlows) || p.extraFlows.length === 0) add('extraFlows', 'Lista de aportes e resgates inválida.')
    else {
      p.extraFlows.forEach((item: unknown, i) => {
        const it = (item ?? {}) as { kind?: unknown; amount?: unknown; year?: unknown; month?: unknown }
        if (it.kind !== 'aporte' && it.kind !== 'resgate') add(`extraFlows.${i}.kind`, 'Escolha aporte ou resgate.')
        const max = it.kind === 'resgate' ? ctx.wealth * 0.5 : ctx.wealth
        if (!isNumber(it.amount) || it.amount <= 0 || it.amount > max + 1e-6 || !multipleOf(it.amount, STEP_FLOW)) {
          add(`extraFlows.${i}.amount`, `Use de R$ 50 mil a ${money(Math.floor(max / STEP_FLOW) * STEP_FLOW)}, de R$ 50 mil em R$ 50 mil.`)
        }
        const ok = isNumber(it.year) && Number.isInteger(it.year) && isNumber(it.month) && Number.isInteger(it.month) && it.month >= 1 && it.month <= 12
        const idx = ok ? monthIndex(`${String(it.year)}-${String(it.month).padStart(2, '0')}`) : NaN
        if (!ok || idx <= monthIndex(ctx.refMonth) || idx > lastIdx) {
          add(`extraFlows.${i}.month`, `Escolha um mês depois de ${formatMonthLabel(ctx.refMonth)} e até ${formatMonthLabel(monthOfIndex(lastIdx))} (fim do horizonte).`)
        }
      })
    }
  }
  if (p.propertySales !== undefined) {
    if (!Array.isArray(p.propertySales) || p.propertySales.length === 0) add('propertySales', 'Lista de imóveis inválida.')
    else {
      const seen = new Set<string>()
      p.propertySales.forEach((item: unknown, i) => {
        const it = (item ?? {}) as { propertyId?: unknown; year?: unknown }
        const prop = ctx.properties.find((x) => x.id === it.propertyId)
        if (!prop) add(`propertySales.${i}.propertyId`, 'Escolha um imóvel que pode ser vendido.')
        else if (seen.has(prop.id)) add(`propertySales.${i}.propertyId`, 'Esse imóvel já está no cenário.')
        else if (!isNumber(it.year) || !Number.isInteger(it.year) || it.year < prop.firstYear || it.year > lastSaleYear) {
          add(`propertySales.${i}.year`, `Use um ano de ${prop.firstYear} a ${lastSaleYear}.`)
        }
        if (prop) seen.add(prop.id)
      })
    }
  }
  if (p.firstYearShock !== undefined) {
    const v = p.firstYearShock
    if (!isNumber(v) || v > -0.05 + 1e-9 || v < -0.3 - 1e-9 || !multipleOf(v, 0.05)) add('firstYearShock', 'Use um choque de −5% a −30%, de 5 em 5 pontos.')
    if (p.shockPresetId !== undefined) add('firstYearShock', 'Use o choque no 1º ano ou um cenário pronto, não os dois.')
  }
  if (p.shockPresetId !== undefined && !SHOCK_PRESETS.some((s) => s.id === p.shockPresetId)) add('shockPresetId', 'Cenário pronto desconhecido.')
  if (p.horizonAge !== undefined) {
    const v = p.horizonAge
    if (!isNumber(v) || !Number.isInteger(v) || v < HORIZON_RANGE.min || v > HORIZON_RANGE.max) {
      add('horizonAge', `Use uma idade inteira de ${HORIZON_RANGE.min} a ${HORIZON_RANGE.max} anos.`)
    } else if (v === ctx.horizonAge) add('horizonAge', 'É o horizonte do plano: escolha outro.')
  }
  if (p.rulesEnabled !== undefined) {
    if (typeof p.rulesEnabled !== 'boolean') add('rulesEnabled', 'Escolha com ou sem ajustes de gasto.')
    else if (p.rulesEnabled === ctx.rulesEnabled) add('rulesEnabled', 'É o que o plano já usa: escolha o contrário.')
  }
  return issues
}

/** Valor em reais no nome, exato nos passos do SPEC: "R$ 30 mil", "R$ 1,25 mi", "R$ 1,234 mi". */
function moneyName(v: number): string {
  if (v >= 999_500) {
    const decimals = multipleOf(v, 100_000) ? 1 : multipleOf(v, 10_000) ? 2 : 3
    return `R$${NBSP}${(v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${NBSP}mi`
  }
  return v >= 1_000 ? `R$${NBSP}${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}${NBSP}mil` : money(v)
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function presetPeriod(p: ShockPreset): string {
  if (p.fromYear === 1 && p.toYear === 1) return 'no 1º ano'
  if (p.fromYear === 1) return `nos ${p.toYear} primeiros anos`
  return `do ano ${p.fromYear} ao ano ${p.toYear}`
}

/**
 * Nome automático do cenário, em português e sem recomendação: "Aposentar 3 anos antes (aos 59) e gastar 10% a mais".
 * Espera um cenário já conferido.
 */
export function scenarioName(p: ReportScenarioParams, ctx: ScenarioContext): string {
  const parts: string[] = []
  if (p.retirementAge !== undefined && ctx.planRetirementAge !== null) {
    const diff = p.retirementAge - ctx.planRetirementAge
    const years = Math.abs(diff) === 1 ? '1 ano' : `${Math.abs(diff)} anos`
    parts.push(`Aposentar ${years} ${diff < 0 ? 'antes' : 'depois'} (aos ${p.retirementAge})`)
  }
  if (p.essentialMonthly !== undefined) parts.push(`Gasto essencial de ${moneyName(p.essentialMonthly)} por mês`)
  if (p.lifestyleMonthly !== undefined) {
    parts.push(p.lifestyleMonthly === 0 ? 'Sem gasto de estilo de vida' : `Estilo de vida de ${moneyName(p.lifestyleMonthly)} por mês`)
  }
  if (p.spendingMultiplier !== undefined) {
    const pct = Math.round(Math.abs(p.spendingMultiplier - 1) * 100)
    parts.push(`Gastar ${pct}% a ${p.spendingMultiplier > 1 ? 'mais' : 'menos'}`)
  }
  for (const i of p.incomes ?? []) parts.push(i.monthly === 0 ? `Sem ${lower(i.name)}` : `${i.name} de ${moneyName(i.monthly)} por mês`)
  for (const f of p.extraFlows ?? []) {
    const when = formatMonthLabel(`${f.year}-${String(f.month).padStart(2, '0')}`)
    parts.push(`${f.kind === 'aporte' ? 'Aporte' : 'Resgate'} de ${moneyName(f.amount)} em ${when}`)
  }
  for (const s of p.propertySales ?? []) {
    const prop = ctx.properties.find((x) => x.id === s.propertyId)
    parts.push(`Imóvel ${prop ? prop.name : s.propertyId} vendido em ${s.year}`)
  }
  if (p.firstYearShock !== undefined) parts.push(`Choque de −${Math.round(Math.abs(p.firstYearShock) * 100)}% no 1º ano`)
  if (p.shockPresetId !== undefined) {
    const preset = SHOCK_PRESETS.find((s) => s.id === p.shockPresetId)
    if (preset) parts.push(`${preset.name} ${presetPeriod(preset)}`)
  }
  if (p.horizonAge !== undefined) parts.push(`Horizonte até os ${p.horizonAge} anos`)
  if (p.rulesEnabled !== undefined) parts.push(`${p.rulesEnabled ? 'Com' : 'Sem'} ajustes de gasto em anos ruins`)
  if (parts.length === 0) return 'Plano sem mudança'
  const [first, ...rest] = parts
  if (rest.length === 0) return first
  return `${[first, ...rest.slice(0, -1).map(lower)].join(', ')} e ${lower(rest[rest.length - 1])}`
}

/** O cenário no formato do motor. */
export function toEngineScenario(p: ReportScenarioParams): Scenario {
  const s: Scenario = {}
  if (p.retirementAge !== undefined) s.retirementAge = p.retirementAge
  if (p.essentialMonthly !== undefined) s.essentialMonthly = p.essentialMonthly
  if (p.lifestyleMonthly !== undefined) s.lifestyleMonthly = p.lifestyleMonthly
  if (p.spendingMultiplier !== undefined) s.spendingMultiplier = p.spendingMultiplier
  if (p.incomes !== undefined) s.incomes = p.incomes.map((i) => ({ name: i.name, monthly: i.monthly }))
  if (p.extraFlows !== undefined) {
    s.extraEvents = p.extraFlows.map(
      (f): PlanEvent => ({
        name: f.kind === 'aporte' ? 'Aporte do cenário' : 'Resgate do cenário',
        direction: f.kind === 'aporte' ? 'entrada' : 'saida',
        amountReal: f.amount,
        year: f.year,
        month: f.month,
        recurrence: 'unica',
      }),
    )
  }
  if (p.propertySales !== undefined) s.propertySales = p.propertySales.map((x) => ({ propertyId: x.propertyId, year: x.year }))
  if (p.firstYearShock !== undefined) s.firstYearShock = p.firstYearShock
  if (p.shockPresetId !== undefined) {
    const preset = SHOCK_PRESETS.find((x) => x.id === p.shockPresetId)
    if (preset) s.shocks = [{ ...preset, deltas: { ...preset.deltas } }]
  }
  if (p.horizonAge !== undefined) s.horizonAge = p.horizonAge
  if (p.rulesEnabled !== undefined) s.rulesEnabled = p.rulesEnabled
  return s
}

export interface ScenarioRun {
  probability: number
  requiredReturn: number | null
  requiredReturnStatus: RequiredReturnStatus
  inputsHash: string
  seed: number
  paths: number
}

/** Roda o cenário sobre o pacote do mês, com a semente da família e as trajetórias da rodada oficial (D-036). */
export function runScenario(pkg: MonthPackage, ipca: IpcaSeries, scenario: Scenario, paths = OFFICIAL_PATHS): ScenarioRun {
  const m = buildMonthInputs({ ...pkg, ipca, scenario })
  const res = simulate(mainInput(m.input), { paths, seed: m.seed })
  return {
    probability: res.successProbability,
    requiredReturn: res.requiredReturn.rate,
    requiredReturnStatus: res.requiredReturn.status,
    inputsHash: res.inputsHash,
    seed: m.seed,
    paths,
  }
}
