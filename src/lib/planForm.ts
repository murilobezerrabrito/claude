// Formulário do editor do plano (console, etapa 3c): o plano em campos de texto, como a pessoa digita (valores em
// reais no formato brasileiro, percentuais das regras em %), e a conversão de ida e volta para a versão do plano
// (PlanSnapshot). Os nomes dos campos são os mesmos da versão do plano, para que as mensagens do esquema caiam no
// campo certo. O legado aparece num campo só: o legado mínimo e a meta de legado gravam o mesmo valor (D-067).

import type { PersonRole, OtherAssetKind, CashFlowKind, EventRecurrence, RulesMode, Sex } from '../engine/types.ts'
import type { PlanSnapshot } from '../report/types.ts'

export interface PersonForm {
  id: string
  name: string
  /** "dd/mm/aaaa", como a pessoa digita (o seletor de data do navegador segue o idioma do sistema, D-057). */
  birthDate: string
  sex: Sex | ''
  role: PersonRole
  retirementAge: string
}

export interface OtherAssetForm {
  id: string
  kind: OtherAssetKind
  name: string
  value: string
  annualIncome: string
  canBeSold: boolean
  netSaleValue: string
  inSimulation: boolean
  classCode: string
}

export interface CashFlowForm {
  kind: CashFlowKind
  name: string
  annualAmountReal: string
  startYear: string
  endYear: string
  otherAssetId: string
}

export interface EventForm {
  name: string
  direction: 'entrada' | 'saida'
  amountReal: string
  year: string
  month: string
  recurrence: EventRecurrence
  everyN: string
  endYear: string
}

/** Meta de padrão de vida (a de legado sai do campo "legado mínimo"). */
export interface LifeGoalForm {
  personId: string
  targetAge: string
}

export interface RulesForm {
  enabled: boolean
  mode: RulesMode
  /** Percentuais: 80 = 80%. */
  lower: string
  upper: string
  cut: string
  raise: string
  floor: string
  cap: string
  noCutLastYears: string
}

export interface PlanForm {
  legacyMin: string
  people: PersonForm[]
  otherAssets: OtherAssetForm[]
  cashFlows: CashFlowForm[]
  events: EventForm[]
  /** Só as metas de padrão de vida, na ordem da versão do plano; a de legado vai no fim, na conversão. */
  goals: LifeGoalForm[]
  rules: RulesForm
}

/**
 * Valor em reais digitado no formato brasileiro: "1.234.567,89", "1234567,89", "1.500" (mil e quinhentos) ou
 * "1500.5". Ponto com grupos de três dígitos é separador de milhar só quando o primeiro grupo não começa com zero
 * ("0.500" é meio). Vazio dá undefined; o que não é número dá NaN (o esquema recusa com a mensagem do campo).
 */
export function parseDecimalBr(input: string): number | undefined {
  const s = input.replace(/R\$|\s/g, '')
  if (s === '') return undefined
  if (s.includes(',')) {
    if (!/^-?([1-9]\d{0,2}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) return NaN
    return Number(s.replace(/\./g, '').replace(',', '.'))
  }
  if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''))
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  return NaN
}

/** Percentual digitado ("80", "7,5" ou "7.5"): sem separador de milhar, ponto e vírgula são a casa decimal. */
export function parsePercentBr(input: string): number | undefined {
  const s = input.replace(/%|\s/g, '').replace(',', '.')
  if (s === '') return undefined
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

/** Inteiro digitado (ano, idade, mês): vazio dá undefined; o resto que não é inteiro dá NaN. */
export function parseIntBr(input: string): number | undefined {
  const s = input.trim()
  if (s === '') return undefined
  return /^-?\d+$/.test(s) ? Number(s) : NaN
}

/** "1974-03-15" → "15/03/1974". */
export const isoToBrDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso)

/** "15/03/1974" (ou "5/3/1974") → "1974-03-15"; vazio dá undefined; o resto volta como foi digitado (o esquema recusa). */
export function brDateToIso(input: string): string | undefined {
  const s = input.trim()
  if (s === '') return undefined
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s
}

const brl = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

/** Valor em reais para o campo: "1.204.800,00". */
export const moneyField = (v: number | undefined) => (v === undefined ? '' : brl.format(v))
const intField = (v: number | undefined) => (v === undefined ? '' : String(v))
/** Fração para o campo em %: 0,8 → "80". */
const pctField = (v: number) => pct.format(Math.round(v * 1e8) / 1e6)
const fromPct = (s: string) => {
  const v = parsePercentBr(s)
  return v === undefined || Number.isNaN(v) ? v : Math.round(v * 1e6) / 1e8
}
const omitEmpty = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T

/** Legado do plano: o maior entre o legado mínimo e as metas de legado, como o motor usa. */
export function planLegacy(p: PlanSnapshot): number | undefined {
  const values = [...(p.legacyMin === undefined ? [] : [p.legacyMin]), ...p.goals.filter((g) => g.kind === 'legado' && g.amount !== undefined).map((g) => g.amount as number)]
  return values.length === 0 ? undefined : Math.max(...values)
}

export function snapshotToForm(p: PlanSnapshot): PlanForm {
  return {
    legacyMin: moneyField(planLegacy(p)),
    people: p.people.map((x) => ({ id: x.id, name: x.name, birthDate: isoToBrDate(x.birthDate), sex: x.sex, role: x.role, retirementAge: intField(x.retirementAge) })),
    otherAssets: p.otherAssets.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      value: moneyField(a.value),
      annualIncome: moneyField(a.annualIncome),
      canBeSold: a.canBeSold ?? false,
      netSaleValue: moneyField(a.netSaleValue),
      inSimulation: a.inSimulation ?? false,
      classCode: a.classCode ?? '',
    })),
    cashFlows: p.cashFlows.map((c) => ({
      kind: c.kind,
      name: c.name,
      annualAmountReal: moneyField(c.annualAmountReal),
      startYear: intField(c.startYear),
      endYear: intField(c.endYear),
      otherAssetId: c.otherAssetId ?? '',
    })),
    events: p.events.map((e) => ({
      name: e.name,
      direction: e.direction,
      amountReal: moneyField(e.amountReal),
      year: intField(e.year),
      month: intField(e.month),
      recurrence: e.recurrence,
      everyN: intField(e.everyN),
      endYear: intField(e.endYear),
    })),
    goals: p.goals.filter((g) => g.kind === 'padrao_de_vida').map((g) => ({ personId: g.personId ?? '', targetAge: intField(g.targetAge) })),
    rules: {
      enabled: p.rules.enabled,
      mode: p.rules.mode,
      lower: pctField(p.rules.lower),
      upper: pctField(p.rules.upper),
      cut: pctField(p.rules.cut),
      raise: pctField(p.rules.raise),
      floor: pctField(p.rules.floor),
      cap: pctField(p.rules.cap),
      noCutLastYears: intField(p.rules.noCutLastYears),
    },
  }
}

/**
 * Formulário para a versão do plano, sem validar (o esquema valida depois): campos vazios saem, números inválidos
 * viram NaN. O legado vira o legado mínimo e uma meta de legado com o mesmo valor, no fim das metas; sem legado
 * (vazio ou zero), nenhum dos dois.
 */
export function formToSnapshot(f: PlanForm): unknown {
  const legacy = parseDecimalBr(f.legacyMin)
  const hasLegacy = legacy !== undefined && !(legacy === 0)
  return {
    ...(hasLegacy ? { legacyMin: legacy } : {}),
    people: f.people.map((x) =>
      omitEmpty({ id: x.id, name: x.name, birthDate: brDateToIso(x.birthDate), sex: x.sex === '' ? undefined : x.sex, role: x.role, retirementAge: parseIntBr(x.retirementAge) }),
    ),
    otherAssets: f.otherAssets.map((a) =>
      omitEmpty({
        id: a.id,
        kind: a.kind,
        name: a.name,
        value: parseDecimalBr(a.value),
        ...(a.classCode ? { classCode: a.classCode } : {}),
        // Falso e ausente valem o mesmo no motor: só o verdadeiro vai para a versão do plano.
        ...(a.inSimulation ? { inSimulation: true } : {}),
        ...(a.canBeSold ? { canBeSold: true, netSaleValue: parseDecimalBr(a.netSaleValue) } : {}),
        annualIncome: parseDecimalBr(a.annualIncome),
      }),
    ),
    cashFlows: f.cashFlows.map((c) =>
      omitEmpty({
        kind: c.kind,
        name: c.name,
        annualAmountReal: parseDecimalBr(c.annualAmountReal),
        startYear: parseIntBr(c.startYear),
        endYear: parseIntBr(c.endYear),
        otherAssetId: c.otherAssetId,
      }),
    ),
    events: f.events.map((e) =>
      omitEmpty({
        name: e.name,
        direction: e.direction,
        amountReal: parseDecimalBr(e.amountReal),
        year: parseIntBr(e.year),
        month: parseIntBr(e.month),
        recurrence: e.recurrence,
        everyN: e.recurrence === 'a_cada_n' ? parseIntBr(e.everyN) : undefined,
        endYear: e.recurrence === 'unica' ? undefined : parseIntBr(e.endYear),
      }),
    ),
    goals: [
      ...f.goals.map((g) => omitEmpty({ kind: 'padrao_de_vida' as const, personId: g.personId, targetAge: parseIntBr(g.targetAge) })),
      ...(hasLegacy ? [{ kind: 'legado' as const, amount: legacy }] : []),
    ],
    rules: {
      enabled: f.rules.enabled,
      mode: f.rules.mode,
      lower: fromPct(f.rules.lower),
      upper: fromPct(f.rules.upper),
      cut: fromPct(f.rules.cut),
      raise: fromPct(f.rules.raise),
      floor: fromPct(f.rules.floor),
      cap: fromPct(f.rules.cap),
      noCutLastYears: parseIntBr(f.rules.noCutLastYears),
    },
  }
}

/** Plano novo: só o titular, sem fluxos nem eventos, com as regras de gasto flexível padrão do SPEC, ligadas. */
export function emptyPlanForm(newId: () => string): PlanForm {
  return {
    legacyMin: '',
    people: [{ id: newId(), name: '', birthDate: '', sex: '', role: 'titular', retirementAge: '' }],
    otherAssets: [],
    cashFlows: [],
    events: [],
    goals: [],
    rules: { enabled: true, mode: 'trajetoria_referencia', lower: '80', upper: '120', cut: '10', raise: '10', floor: '50', cap: '130', noCutLastYears: '15' },
  }
}
