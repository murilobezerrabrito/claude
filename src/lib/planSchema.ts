// Esquema da versão do plano (`plan_versions.snapshot`, tipo PlanSnapshot de src/report): as mesmas regras que o
// motor confere ao montar o plano (src/engine/plan.ts) e as restrições das tabelas do banco, com mensagens em
// português para quem preenche. O editor do console valida com ele antes de gravar, e o banco confere de novo
// (save_plan_version). Fica fora de src/engine, que não tem dependências.

import { z } from 'zod'
import { MAX_MONEY } from '../import/values.ts'
import { brazilToday } from '../market/calendar.ts'
import type { PlanSnapshot } from '../report/types.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Data AAAA-MM-DD que existe no calendário (também antes do ano 100, que o Date.UTC levaria para 19xx). */
export function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(0)
  dt.setUTCFullYear(y, m - 1, d)
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Hoje no horário de Brasília (AAAA-MM-DD), como o banco confere (America/Sao_Paulo). */
export { brazilToday }

const YEARS = { min: 1900, max: 2200 }
/** Nascimento a partir de 1900, como o banco confere. */
const FIRST_BIRTH = '1900-01-01'
/** Teto dos gatilhos e do teto das regras (500%) e do aumento (100%): acima disso, é erro de digitação (D-068). */
export const RULES_MAX = { upper: 5, raise: 1, cap: 5 } as const

const notBlank = (s: string) => s.trim() !== ''

const amount = (what: string) =>
  z
    .number({ error: `Informe ${what} em reais.` })
    .min(0, `${what[0].toUpperCase()}${what.slice(1)} não pode ser negativo.`)
    .lt(MAX_MONEY, `${what[0].toUpperCase()}${what.slice(1)} é grande demais.`)
const optionalAmount = (what: string) => amount(what).optional()
const year = (what: string) =>
  z.number({ error: `Informe ${what}.` }).refine(Number.isInteger, `Use um ano inteiro em ${what}.`).min(YEARS.min, `Ano fora do intervalo em ${what}.`).max(YEARS.max, `Ano fora do intervalo em ${what}.`)
const text = (what: string) => z.string({ error: `Informe ${what}.` }).trim().min(1, `Informe ${what}.`)

const LISTS = ['people', 'otherAssets', 'cashFlows', 'events', 'goals'] as const

/** Objeto com as cinco listas e as regras: o mínimo para conferir as regras entre campos. */
function hasPlanShape(v: unknown): boolean {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return LISTS.every((k) => Array.isArray(o[k])) && o.rules !== null && typeof o.rules === 'object'
}

export interface PlanSchemaOptions {
  /** Classes das premissas vigentes: o bem que entra na simulação precisa de uma delas. */
  classes?: readonly string[]
  /** Hoje (AAAA-MM-DD), para recusar nascimento no futuro; sem ele, hoje no horário de Brasília. */
  today?: string
}

const MAX_ITEMS = 200

/** Esquema da versão do plano. Saída: o plano limpo (sem campos desconhecidos), pronto para gravar. */
export function planSnapshotSchema(opts: PlanSchemaOptions = {}) {
  const today = opts.today ?? brazilToday()
  const id = z.string().refine(notBlank, 'Identificador vazio.')

  const person = z.object({
    id,
    name: text('o nome'),
    birthDate: z
      .string({ error: 'Informe a data de nascimento.' })
      .refine(isValidIsoDate, 'Data de nascimento inválida: use dia, mês e ano.')
      .refine((d) => d <= today, 'A data de nascimento está no futuro.')
      .refine((d) => d >= FIRST_BIRTH, 'A data de nascimento é antes de 1900.'),
    sex: z.enum(['M', 'F'], { error: 'Escolha o sexo.' }),
    role: z.enum(['titular', 'conjuge', 'filho'], { error: 'Escolha o papel na família.' }),
    retirementAge: z
      .number({ error: 'Informe a idade de aposentadoria.' })
      .refine(Number.isInteger, 'Use uma idade inteira.')
      .min(30, 'A idade de aposentadoria vai de 30 a 100 anos.')
      .max(100, 'A idade de aposentadoria vai de 30 a 100 anos.')
      .optional(),
  })

  const otherAsset = z.object({
    id,
    kind: z.enum(['previdencia', 'imovel', 'empresa', 'exterior'], { error: 'Escolha o tipo do bem.' }),
    name: text('o nome do bem'),
    value: amount('o valor'),
    classCode: z.string().refine(notBlank, 'Escolha a classe.').optional(),
    inSimulation: z.boolean().optional(),
    canBeSold: z.boolean().optional(),
    netSaleValue: optionalAmount('o valor líquido de venda'),
    annualIncome: optionalAmount('a renda anual'),
  })

  const cashFlow = z.object({
    kind: z.enum(['renda', 'dividendos', 'aluguel', 'gasto_essencial', 'gasto_estilo'], { error: 'Escolha o tipo.' }),
    name: text('o nome'),
    annualAmountReal: amount('o valor anual'),
    startYear: year('o ano de início'),
    endYear: year('o ano de fim'),
    otherAssetId: z.string().refine(notBlank, 'Escolha o bem.').optional(),
  })

  const event = z.object({
    name: text('o nome do evento'),
    direction: z.enum(['entrada', 'saida'], { error: 'Escolha entrada ou saída.' }),
    amountReal: amount('o valor'),
    year: year('o ano'),
    month: z.number({ error: 'Informe o mês.' }).refine(Number.isInteger, 'Use um mês de 1 a 12.').min(1, 'Use um mês de 1 a 12.').max(12, 'Use um mês de 1 a 12.').optional(),
    recurrence: z.enum(['unica', 'anual', 'a_cada_n'], { error: 'Escolha a recorrência.' }),
    everyN: z.number({ error: 'Informe o intervalo.' }).refine(Number.isInteger, 'Use um intervalo inteiro de anos.').min(1, 'O intervalo é de pelo menos 1 ano.').max(200, 'Intervalo grande demais.').optional(),
    endYear: year('o ano de fim').optional(),
  })

  const goal = z.object({
    kind: z.enum(['padrao_de_vida', 'legado'], { error: 'Tipo de meta desconhecido.' }),
    personId: z.string().refine(notBlank, 'Escolha a pessoa da meta.').optional(),
    targetAge: z
      .number({ error: 'Informe a idade.' })
      .refine(Number.isInteger, 'Use uma idade inteira.')
      .min(60, 'A idade da meta vai de 60 a 110 anos.')
      .max(110, 'A idade da meta vai de 60 a 110 anos.')
      .optional(),
    amount: optionalAmount('o legado'),
  })

  const fraction = (what: string) => z.number({ error: `Informe ${what}.` })
  const rules = z.object({
    enabled: z.boolean(),
    mode: z.enum(['trajetoria_referencia', 'guyton_klinger'], { error: 'Escolha o modo das regras.' }),
    lower: fraction('o gatilho inferior').gt(0, 'O gatilho inferior precisa ser maior que zero.'),
    upper: fraction('o gatilho superior').max(RULES_MAX.upper, 'O gatilho superior vai até 500%.'),
    cut: fraction('o corte').min(0, 'O corte vai de 0% a menos de 100%.').lt(1, 'O corte vai de 0% a menos de 100%.'),
    raise: fraction('o aumento').min(0, 'O aumento não pode ser negativo.').max(RULES_MAX.raise, 'O aumento vai até 100%.'),
    floor: fraction('o piso').gt(0, 'O piso vai de mais de 0% a 100% do estilo de vida inicial.').max(1, 'O piso vai de mais de 0% a 100% do estilo de vida inicial.'),
    cap: fraction('o teto').min(1, 'O teto é de pelo menos 100% do estilo de vida inicial.').max(RULES_MAX.cap, 'O teto vai até 500% do estilo de vida inicial.'),
    noCutLastYears: z
      .number({ error: 'Informe os anos finais sem corte.' })
      .refine(Number.isInteger, 'Use um número inteiro de anos.')
      .min(0, 'Os anos sem corte não podem ser negativos.')
      .max(200, 'Anos sem corte demais.'),
  })

  return z
    .object({
      legacyMin: optionalAmount('o legado mínimo'),
      people: z.array(person).max(MAX_ITEMS, 'Mais de 200 itens.'),
      otherAssets: z.array(otherAsset).max(MAX_ITEMS, 'Mais de 200 itens.'),
      cashFlows: z.array(cashFlow).max(MAX_ITEMS, 'Mais de 200 itens.'),
      events: z.array(event).max(MAX_ITEMS, 'Mais de 200 itens.'),
      goals: z.array(goal).max(MAX_ITEMS, 'Mais de 200 itens.'),
      rules,
    })
    .superRefine(
      (plan, ctx) => {
        // Roda mesmo com erros de campo (para mostrar tudo de uma vez), então os valores podem ainda estar inválidos.
        const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })
        const p = plan as unknown as Record<string, unknown>
        const rows = (k: string) => (p[k] as unknown[]).map((x) => (x !== null && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
        const people = rows('people')
        const assets = rows('otherAssets')

        const titulares = people.filter((x) => x.role === 'titular').length
        if (titulares !== 1) issue(['people'], titulares === 0 ? 'O plano precisa de um titular.' : 'O plano tem um titular só.')
        if (people.filter((x) => x.role === 'conjuge').length > 1) issue(['people'], 'O plano tem no máximo um cônjuge.')
        const personIds = new Set<unknown>()
        people.forEach((x, i) => {
          if (personIds.has(x.id)) issue(['people', i, 'id'], 'Pessoa repetida.')
          personIds.add(x.id)
        })

        const assetIds = new Set<unknown>()
        assets.forEach((a, i) => {
          if (assetIds.has(a.id)) issue(['otherAssets', i, 'id'], 'Bem repetido.')
          assetIds.add(a.id)
          const classCode = typeof a.classCode === 'string' ? a.classCode : ''
          if (a.inSimulation === true && !classCode.trim()) issue(['otherAssets', i, 'classCode'], 'O bem que entra na simulação precisa de uma classe.')
          if (classCode.trim() && opts.classes && !opts.classes.includes(classCode)) {
            issue(['otherAssets', i, 'classCode'], `A classe ${classCode} não está nas premissas vigentes.`)
          }
        })

        rows('cashFlows').forEach((c, i) => {
          const from = num(c.startYear)
          const to = num(c.endYear)
          if (from !== null && to !== null && to < from) issue(['cashFlows', i, 'endYear'], 'O ano de fim vem antes do ano de início.')
          if (c.otherAssetId !== undefined && !assetIds.has(c.otherAssetId)) issue(['cashFlows', i, 'otherAssetId'], 'O bem ligado a este fluxo não está no plano.')
        })

        rows('events').forEach((e, i) => {
          if (e.recurrence === 'anual' || e.recurrence === 'a_cada_n') {
            const year = num(e.year)
            const to = num(e.endYear)
            if (e.endYear === undefined) issue(['events', i, 'endYear'], 'O evento recorrente precisa de um ano de fim.')
            else if (year !== null && to !== null && to < year) issue(['events', i, 'endYear'], 'O ano de fim vem antes do primeiro ano.')
          }
          if (e.recurrence === 'a_cada_n' && e.everyN === undefined) issue(['events', i, 'everyN'], 'Informe a cada quantos anos.')
        })

        rows('goals').forEach((g, i) => {
          if (g.kind === 'padrao_de_vida') {
            if (!g.personId) issue(['goals', i, 'personId'], 'Escolha a pessoa da meta.')
            else if (!personIds.has(g.personId)) issue(['goals', i, 'personId'], 'A pessoa da meta não está no plano.')
            if (g.targetAge === undefined) issue(['goals', i, 'targetAge'], 'Informe até que idade.')
          } else if (g.kind === 'legado' && g.amount === undefined) issue(['goals', i, 'amount'], 'Informe o legado.')
        })

        const rules = p.rules as Record<string, unknown>
        const lower = num(rules.lower)
        const upper = num(rules.upper)
        if (lower !== null && upper !== null && !(upper > lower)) issue(['rules', 'upper'], 'O gatilho superior precisa ser maior que o inferior.')
      },
      // Só falta a estrutura (as listas e as regras) para não rodar.
      { when: (payload) => hasPlanShape(payload.value) },
    )
}

/** Confere uma versão do plano (por exemplo, a que veio do banco) e devolve as mensagens, vazio quando está boa. */
export function planSnapshotIssues(snapshot: unknown, opts: PlanSchemaOptions = {}): { path: string; message: string }[] {
  const r = planSnapshotSchema(opts).safeParse(snapshot)
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

export type ValidPlanSnapshot = z.output<ReturnType<typeof planSnapshotSchema>>

// O esquema e o tipo de src/report andam juntos: a saída do esquema é um PlanSnapshot.
const _sameShape: (p: ValidPlanSnapshot) => PlanSnapshot = (p) => p
void _sameShape
