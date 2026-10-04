// Transforma o plano da família (formato de andrade.json) e as hipóteses do "E se?" em vetores por passo.
// Passo de 12 meses (SPEC, "Motor no ciclo mensal", item 3): a data de referência é o último dia do mês de
// competência; o passo t cobre os 12 meses seguintes à data de referência mais t anos; o último termina no mês em
// que o membro mais jovem do casal atinge a idade-limite e pode ter m < 12 meses. Fluxos e eventos anuais entram
// pro rata pelos meses do seu ano civil que caem no passo; evento único e cada ocorrência de "a cada N anos" entram
// no seu mês (sem mês, julho). Anos de início e fim são inclusivos; valores em reais de hoje.

import { EngineInputError } from './errors.ts'
import { shockMatrix } from './shocks.ts'
import type { CashFlow, Person, PlanEvent, Profile, Scenario, SimInput, SpendingRules } from './types.ts'

const WEIGHT_SUM_TOL = 1e-6
/** Mês dos eventos sem mês e das vendas de imóvel (julho). */
export const DEFAULT_EVENT_MONTH = 7

export interface Plan {
  /** Ano civil da data de referência das posições. */
  startYear: number
  /** Primeiro mês simulado, em meses corridos (ano × 12 + mês − 1): o mês seguinte ao da data de referência. */
  firstMonth: number
  /** Passos simulados. */
  T: number
  /** Meses de cada passo: 12, exceto talvez o último. */
  stepMonths: Int32Array
  /** Fração de ano de cada passo (meses ÷ 12); o retorno do passo é (1 + R)^fração − 1. */
  stepFrac: Float64Array
  /** Patrimônio financeiro simulado na data de referência. */
  W0: number
  /** Renda, aluguéis e dividendos por passo. */
  income: Float64Array
  /** Entradas de eventos e vendas de imóvel por passo. */
  inflows: Float64Array
  essential: Float64Array
  /** Estilo de vida planejado por passo (antes das regras de gasto flexível). */
  lifestyle: Float64Array
  /** Saídas de eventos por passo. */
  outflows: Float64Array
  /** Fluxo do passo sem o estilo de vida: renda + entradas − essencial − saídas. */
  base: Float64Array
  /** Fluxo líquido do plano completo no primeiro mês simulado (a ponte o usa na passagem do tempo). */
  firstMonthFlow: number
  /** Gasto essencial e de estilo de vida do primeiro mês simulado: o gasto mensal "atual" do "E se?" (D-032). */
  firstMonthEssential: number
  firstMonthLifestyle: number
  /** Primeiro passo já aposentado: a aposentadoria foi antes do início do passo (T se cai depois do horizonte). */
  retiredFrom: number
  retirementYear: number | null
  retirementAge: number | null
  legacy: number
  fee: number
  /** De onde vêm os pesos: perfil de alocação ou pesos explícitos por classe (carteira atual). */
  weightsSource: WeightsSource
  /** Perfil simulado; null com pesos explícitos. */
  profileId: string | null
  weightsPre: Float64Array
  weightsPost: Float64Array | null
  /** Σ_k w_k δ_{t,k} por passo, com os pesos de antes e de depois da aposentadoria. */
  shockPre: Float64Array
  shockPost: Float64Array | null
  rules: SpendingRules
  /** Idade do membro mais jovem do casal em cada ponto (T + 1 pontos: a data de referência e o fim de cada passo). */
  ages: number[]
  titularAges: number[]
  /** Ano civil de cada ponto. */
  years: number[]
  warnings: string[]
}

interface CalendarDate {
  year: number
  month: number
  day: number
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]

/** Meses corridos: ano × 12 + mês − 1. */
export const monthIndex = (year: number, month: number) => year * 12 + month - 1
const yearOf = (index: number) => Math.floor(index / 12)
const monthOf = (index: number) => index - yearOf(index) * 12 + 1

function parseDate(text: string, what: string): CalendarDate {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(text)
  const year = Number(text.slice(0, 4))
  const month = Number(text.slice(5, 7))
  const day = Number(text.slice(8, 10))
  if (!ok || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new EngineInputError('data_invalida', `Data inválida em ${what}: use AAAA-MM-DD.`)
  }
  return { year, month, day }
}

const birthOf = (p: Person) => parseDate(p.birthDate, `data de nascimento de ${p.name}`)

/** Idade completa no último dia do mês `index`. */
function ageAtMonthEnd(birth: CalendarDate, index: number): number {
  return yearOf(index) - birth.year - (monthOf(index) < birth.month ? 1 : 0)
}

function requireAmount(value: number, what: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new EngineInputError('valor_invalido', `Valor inválido em ${what}: precisa ser um número maior ou igual a zero.`)
  }
}

/** Faixa de meses: o início (meses corridos) e quantos meses. */
interface Range {
  start: number
  len: number
}

/** Meses da faixa que caem nos anos civis de `from` a `to` (inclusivos). */
function overlapMonths(r: Range, from: number, to: number): number {
  const lo = Math.max(r.start, monthIndex(from, 1))
  const hi = Math.min(r.start + r.len - 1, monthIndex(to, 12))
  return hi >= lo ? hi - lo + 1 : 0
}

/** Soma o valor anual `amount` pro rata pelos meses dos anos de `from` a `to` que caem em cada faixa. */
function addYears(arr: Float64Array, ranges: Range[], from: number, to: number, amount: number): void {
  for (let t = 0; t < ranges.length; t++) {
    const n = overlapMonths(ranges[t], from, to)
    if (n > 0) arr[t] += (amount * n) / 12
  }
}

/** Soma `amount` em toda faixa que contém o mês `index`. */
function addAtMonth(arr: Float64Array, ranges: Range[], index: number, amount: number): void {
  for (let t = 0; t < ranges.length; t++) {
    if (index >= ranges[t].start && index < ranges[t].start + ranges[t].len) arr[t] += amount
  }
}

function eventYears(ev: PlanEvent): number[] {
  if (!Number.isInteger(ev.year)) throw new EngineInputError('evento_invalido', `Ano inválido no evento "${ev.name}".`)
  if (ev.month !== undefined && (!Number.isInteger(ev.month) || ev.month < 1 || ev.month > 12)) {
    throw new EngineInputError('evento_invalido', `Mês inválido no evento "${ev.name}": use de 1 a 12.`)
  }
  if (ev.recurrence === 'unica') return [ev.year]
  if (ev.endYear === undefined || !Number.isInteger(ev.endYear) || ev.endYear < ev.year) {
    throw new EngineInputError('evento_invalido', `O evento "${ev.name}" é recorrente e precisa de um ano de fim válido.`)
  }
  const step = ev.recurrence === 'anual' ? 1 : ev.everyN
  if (step === undefined || !Number.isInteger(step) || step < 1) {
    throw new EngineInputError('evento_invalido', `O evento "${ev.name}" precisa de um intervalo N inteiro de pelo menos 1 ano.`)
  }
  const years: number[] = []
  for (let y = ev.year; y <= ev.endYear; y += step) years.push(y)
  return years
}

/** Pesos por classe na ordem das premissas. `owner` diz de quem são os pesos ("do perfil Moderado"). */
function weightVector(weights: Record<string, number>, codes: string[], owner: string): Float64Array {
  const w = new Float64Array(codes.length)
  let sum = 0
  for (const [code, value] of Object.entries(weights)) {
    const k = codes.indexOf(code)
    if (k < 0) throw new EngineInputError('peso_classe_desconhecida', `Os pesos ${owner} têm a classe ${code}, que não está nas premissas.`)
    if (!Number.isFinite(value) || value < 0) throw new EngineInputError('peso_invalido', `Peso inválido para ${code} nos pesos ${owner}.`)
    w[k] = value
    sum += value
  }
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOL) {
    throw new EngineInputError('pesos_nao_somam_1', `Os pesos ${owner} somam ${(sum * 100).toFixed(2)}%, e precisam somar 100%.`)
  }
  return w
}

export type WeightsSource = 'perfil' | 'pesos'

interface PortfolioWeights {
  weightsSource: WeightsSource
  profileId: string | null
  weightsPre: Float64Array
  weightsPost: Float64Array | null
}

/**
 * Pesos da carteira no motor. Ordem: pesos ou perfil do cenário ("E se?"), depois os pesos explícitos da família
 * (carteira atual), depois o perfil da família. Pesos explícitos não têm conjunto depois da aposentadoria.
 */
function portfolioWeights(input: SimInput, sc: Scenario, codes: string[]): PortfolioWeights {
  const h = input.household.household
  if (sc.weights !== undefined && sc.profileId !== undefined) {
    throw new EngineInputError('carteira_ambigua', 'O cenário informa um perfil e pesos explícitos ao mesmo tempo: escolha só um.')
  }
  const explicit = sc.weights ?? (sc.profileId === undefined ? h.weights : undefined)
  if (explicit !== undefined) {
    return { weightsSource: 'pesos', profileId: null, weightsPre: weightVector(explicit, codes, 'da carteira informada'), weightsPost: null }
  }
  const profile = profileFor(input.profiles, sc.profileId ?? h.profileId)
  return {
    weightsSource: 'perfil',
    profileId: profile.id,
    weightsPre: weightVector(profile.weightsPre, codes, `do perfil ${profile.name}`),
    weightsPost: profile.weightsPost ? weightVector(profile.weightsPost, codes, `do perfil ${profile.name}`) : null,
  }
}

function validateRules(r: SpendingRules): void {
  const ok =
    r.lower > 0 && r.upper > r.lower && r.cut >= 0 && r.cut < 1 && r.raise >= 0 &&
    r.floor > 0 && r.floor <= 1 && r.cap >= 1 && Number.isInteger(r.noCutLastYears) && r.noCutLastYears >= 0 &&
    (r.mode === 'trajetoria_referencia' || r.mode === 'guyton_klinger')
  if (!ok) throw new EngineInputError('regras_invalidas', 'Parâmetros das regras de gasto flexível inválidos.')
}

/**
 * Gasto mensal do "E se?" ("do atual" = o do primeiro mês simulado, D-032): escala o vetor para que o primeiro mês
 * (a última faixa) valha `monthly`, mantendo a proporção dos demais. Sem esse gasto no primeiro mês, o valor vale para
 * todos os meses.
 */
function scaleToFirstMonth(arr: Float64Array, ranges: Range[], monthly: number, what: string, warnings: string[]): void {
  requireAmount(monthly, what)
  const first = arr[arr.length - 1]
  if (first > 0) {
    const f = monthly / first
    for (let t = 0; t < arr.length; t++) arr[t] *= f
  } else {
    for (let t = 0; t < arr.length; t++) arr[t] = monthly * ranges[t].len
    warnings.push(`O plano não tinha ${what} no primeiro mês; o valor do "E se?" foi aplicado a todos os meses.`)
  }
}

export function profileFor(profiles: Profile[], profileId: string): Profile {
  const profile = profiles.find((p) => p.id === profileId)
  if (!profile) throw new EngineInputError('perfil_desconhecido', `Perfil de alocação "${profileId}" não encontrado.`)
  return profile
}

export function buildPlan(input: SimInput): Plan {
  const { household: hd, cma } = input
  const sc: Scenario = input.scenario ?? {}
  const warnings: string[] = []
  const h = hd.household

  // Data de referência: último dia do mês de competência. O primeiro mês simulado é o seguinte.
  const ref = parseDate(h.referenceDate, 'data de referência das posições')
  if (ref.day !== daysInMonth(ref.year, ref.month)) {
    throw new EngineInputError('data_referencia_invalida', 'A data de referência das posições precisa ser o último dia do mês (ex.: 2026-09-30).')
  }
  const startYear = ref.year
  const firstMonth = monthIndex(ref.year, ref.month) + 1

  // Horizonte: até o mês em que o membro mais jovem do casal completa a idade-limite.
  const couple = hd.people.filter((p) => p.role === 'titular' || p.role === 'conjuge')
  if (couple.length === 0) throw new EngineInputError('sem_titular', 'O plano precisa de um titular.')
  const titular = couple.find((p) => p.role === 'titular') ?? couple[0]
  const youngest = couple.reduce((a, b) => (b.birthDate > a.birthDate ? b : a))
  const youngestBirth = birthOf(youngest)
  const titularBirth = birthOf(titular)
  const lastMonthFor = (person: Person, age: number, what: string): number => {
    if (!Number.isInteger(age)) throw new EngineInputError('horizonte_invalido', `A idade-limite de ${what} precisa ser um número inteiro.`)
    const b = birthOf(person)
    return monthIndex(b.year + age, b.month)
  }

  // Último mês do plano oficial: o mais longo entre a idade-limite da família e a meta de padrão de vida (D-021).
  let planLastMonth = lastMonthFor(youngest, h.horizonAge, 'horizonte')
  for (const goal of hd.goals.filter((g) => g.kind === 'padrao_de_vida' && g.targetAge !== undefined)) {
    const person = goal.personId === undefined ? youngest : hd.people.find((p) => p.id === goal.personId)
    if (!person) throw new EngineInputError('meta_invalida', `A meta de padrão de vida cita a pessoa "${goal.personId}", que não está no plano.`)
    const goalLastMonth = lastMonthFor(person, goal.targetAge as number, 'meta de padrão de vida')
    if (goalLastMonth !== planLastMonth) {
      warnings.push(`A meta de padrão de vida (${person.name}, ${goal.targetAge} anos) não coincide com o horizonte da família; foi usado o mais longo.`)
      planLastMonth = Math.max(planLastMonth, goalLastMonth)
    }
  }
  // O "E se?" muda a idade-limite do membro mais jovem do casal.
  const lastMonth = sc.horizonAge === undefined ? planLastMonth : lastMonthFor(youngest, sc.horizonAge, 'horizonte')
  const months = lastMonth - firstMonth + 1
  if (months < 1) throw new EngineInputError('horizonte_invalido', 'A idade-limite do horizonte já foi atingida.')
  const T = Math.ceil(months / 12)
  const stepMonths = new Int32Array(T)
  const stepFrac = new Float64Array(T)
  const ranges: Range[] = []
  for (let t = 0; t < T; t++) {
    stepMonths[t] = Math.min(12, months - 12 * t)
    stepFrac[t] = stepMonths[t] / 12
    ranges.push({ start: firstMonth + 12 * t, len: stepMonths[t] })
  }
  // Uma faixa a mais, só com o primeiro mês, para o fluxo do plano no mês (usado na ponte).
  ranges.push({ start: firstMonth, len: 1 })
  const R = ranges.length

  const planLastYear = yearOf(planLastMonth)
  const lastYear = yearOf(lastMonth)
  /** Fluxos que cobrem o fim do horizonte do plano acompanham um horizonte mais longo no "E se?" (D-019). */
  const extendToHorizon = (to: number): number => (to >= planLastYear && lastYear > planLastYear ? Math.max(to, lastYear) : to)

  // Aposentadoria do titular, no mês do aniversário. Sem idade informada, o titular já é considerado aposentado.
  const planRetirementAge = titular.retirementAge ?? null
  const retirementAge = sc.retirementAge ?? planRetirementAge
  if (retirementAge !== null && !Number.isInteger(retirementAge)) {
    throw new EngineInputError('aposentadoria_invalida', 'A idade de aposentadoria precisa ser um número inteiro.')
  }
  const retirementYear = retirementAge === null ? null : titularBirth.year + retirementAge
  const planRetirementYear = planRetirementAge === null ? null : titularBirth.year + planRetirementAge
  let retiredFrom = 0
  if (retirementYear !== null) {
    // Aposentado no passo t só se a aposentadoria foi antes do início do passo.
    const retirementMonth = monthIndex(retirementYear, titularBirth.month)
    retiredFrom = retirementMonth < firstMonth ? 0 : Math.min(T, Math.floor((retirementMonth - firstMonth) / 12) + 1)
  }

  // Patrimônio financeiro simulado: carteira CADM + bens declarados que entram na simulação (ex.: VGBL).
  let W0 = 0
  for (const [code, value] of Object.entries(hd.cadmPositionsByClass)) {
    requireAmount(value, `posição CADM ${code}`)
    W0 += value
  }
  for (const a of hd.otherAssets) {
    if (a.inSimulation) {
      requireAmount(a.value, a.name)
      W0 += a.value
    }
  }

  // Vendas de imóvel do cenário, em julho do ano escolhido.
  const sales = new Map<string, number>()
  const firstSaleYear = yearOf(firstMonth) + (monthOf(firstMonth) > DEFAULT_EVENT_MONTH ? 1 : 0)
  const lastSaleYear = yearOf(lastMonth) - (monthOf(lastMonth) < DEFAULT_EVENT_MONTH ? 1 : 0)
  for (const s of sc.propertySales ?? []) {
    const asset = hd.otherAssets.find((a) => a.id === s.propertyId)
    if (!asset || asset.kind !== 'imovel') throw new EngineInputError('imovel_desconhecido', `Imóvel "${s.propertyId}" não encontrado.`)
    if (!asset.canBeSold) throw new EngineInputError('imovel_nao_vendavel', `O imóvel "${asset.name}" está marcado como não vendável.`)
    if (!Number.isInteger(s.year) || s.year < firstSaleYear || s.year > lastSaleYear) {
      throw new EngineInputError('venda_fora_do_horizonte', `O ano de venda de "${asset.name}" precisa estar entre ${firstSaleYear} e ${lastSaleYear}.`)
    }
    sales.set(asset.id, s.year)
  }

  // Vetores por faixa: os T passos e, no fim, o primeiro mês.
  const income = new Float64Array(R)
  const inflows = new Float64Array(R)
  const essential = new Float64Array(R)
  const lifestyle = new Float64Array(R)
  const outflows = new Float64Array(R)

  const incomeOverride = new Map((sc.incomes ?? []).map((i) => [i.name, i.monthly * 12]))
  for (const cf of hd.cashFlows) addCashFlow(cf)

  function addCashFlow(cf: CashFlow): void {
    let amount = cf.annualAmountReal
    requireAmount(amount, cf.name)
    if (!Number.isInteger(cf.startYear) || !Number.isInteger(cf.endYear)) {
      throw new EngineInputError('fluxo_invalido', `Anos inválidos no fluxo "${cf.name}".`)
    }
    let to = extendToHorizon(cf.endYear)
    switch (cf.kind) {
      case 'renda':
      case 'dividendos':
        // Renda que termina no ano anterior à aposentadoria acompanha a idade escolhida no "E se?" (D-006).
        if (planRetirementYear !== null && retirementYear !== null && to === planRetirementYear - 1) to = retirementYear - 1
        if (cf.kind === 'renda' && incomeOverride.has(cf.name)) {
          amount = incomeOverride.get(cf.name) as number
          requireAmount(amount, cf.name)
        }
        addYears(income, ranges, cf.startYear, to, amount)
        break
      case 'aluguel': {
        // O aluguel de um imóvel vendido para a partir do ano da venda.
        const saleYear = cf.otherAssetId ? sales.get(cf.otherAssetId) : undefined
        if (saleYear !== undefined) to = Math.min(to, saleYear - 1)
        addYears(income, ranges, cf.startYear, to, amount)
        break
      }
      case 'gasto_essencial':
        addYears(essential, ranges, cf.startYear, to, amount)
        break
      case 'gasto_estilo':
        addYears(lifestyle, ranges, cf.startYear, to, amount)
        break
      default:
        throw new EngineInputError('fluxo_invalido', `Tipo de fluxo desconhecido em "${(cf as CashFlow).name}".`)
    }
  }

  if (sc.essentialMonthly !== undefined) scaleToFirstMonth(essential, ranges, sc.essentialMonthly, 'gasto essencial', warnings)
  if (sc.lifestyleMonthly !== undefined) scaleToFirstMonth(lifestyle, ranges, sc.lifestyleMonthly, 'gasto de estilo de vida', warnings)
  const k = sc.spendingMultiplier ?? 1
  if (!Number.isFinite(k) || k < 0) throw new EngineInputError('multiplicador_invalido', 'Multiplicador de gasto inválido.')
  if (k !== 1) {
    for (let t = 0; t < R; t++) {
      essential[t] *= k
      lifestyle[t] *= k
    }
  }

  for (const ev of [...hd.events, ...(sc.extraEvents ?? [])]) {
    requireAmount(ev.amountReal, ev.name)
    const target = ev.direction === 'entrada' ? inflows : outflows
    const years = eventYears(ev)
    if (ev.recurrence === 'anual') {
      // Evento anual: pro rata, como os fluxos.
      addYears(target, ranges, ev.year, ev.endYear as number, ev.amountReal)
      continue
    }
    // Evento único e cada ocorrência de "a cada N anos": no seu mês (sem mês, julho).
    // Data já passada (D-031): já aconteceu e está no patrimônio, então sai do cálculo. A exceção é a ocorrência sem
    // mês no ano do primeiro mês simulado, com julho já passado: a data é incerta, e a saída entra no primeiro mês
    // (a entrada sai), com aviso para a conferência informar o mês.
    for (const y of years) {
      const index = monthIndex(y, ev.month ?? DEFAULT_EVENT_MONTH)
      if (index >= firstMonth) {
        addAtMonth(target, ranges, index, ev.amountReal)
      } else if (ev.month === undefined && y === yearOf(firstMonth)) {
        if (ev.direction === 'saida') addAtMonth(target, ranges, firstMonth, ev.amountReal)
        warnings.push(
          `O evento "${ev.name}" não tem mês e julho de ${y} já passou: ` +
            `${ev.direction === 'saida' ? 'a saída foi contada no primeiro mês simulado' : 'a entrada ficou fora do cálculo'}. Informe o mês na conferência.`,
        )
      }
    }
  }

  for (const [id, year] of sales) {
    const asset = hd.otherAssets.find((a) => a.id === id)
    if (!asset) continue
    const value = asset.netSaleValue
    if (value === undefined) {
      // Sem o valor líquido de custos e impostos, a venda não entra (D-015): o valor declarado superestimaria a entrada.
      throw new EngineInputError(
        'venda_sem_valor_liquido',
        `Para simular a venda de "${asset.name}", o banker precisa informar o valor líquido de custos e impostos.`,
      )
    }
    requireAmount(value, asset.name)
    addAtMonth(inflows, ranges, monthIndex(year, DEFAULT_EVENT_MONTH), value)
  }

  const base = new Float64Array(T)
  for (let t = 0; t < T; t++) base[t] = income[t] + inflows[t] - essential[t] - outflows[t]
  const firstMonthFlow = income[T] + inflows[T] - essential[T] - lifestyle[T] - outflows[T]

  // Carteira: pesos (perfil ou explícitos), taxa de gestão e choques.
  const { weightsSource, profileId, weightsPre, weightsPost } = portfolioWeights(input, sc, cma.classes.map((c) => c.code))
  if (!Number.isFinite(h.feeRate) || h.feeRate < 0 || h.feeRate >= 0.1) {
    throw new EngineInputError('taxa_invalida', 'Taxa de gestão inválida: precisa estar entre 0% e 10% ao ano.')
  }
  const delta = shockMatrix(cma, T, sc)
  const shockPre = weightedShocks(delta, weightsPre, T)
  const shockPost = weightsPost ? weightedShocks(delta, weightsPost, T) : null

  const rules: SpendingRules = { ...hd.rules, enabled: sc.rulesEnabled ?? hd.rules.enabled, mode: sc.rulesMode ?? hd.rules.mode }
  validateRules(rules)

  // Legado: o maior entre o do cadastro da família e o da meta, com aviso se divergirem (D-021).
  const legacyGoals = hd.goals.filter((g) => g.kind === 'legado' && g.amount !== undefined).map((g) => g.amount as number)
  const planLegacyCandidates = [...(h.legacyMin === undefined ? [] : [h.legacyMin]), ...legacyGoals]
  for (const v of planLegacyCandidates) requireAmount(v, 'legado mínimo')
  const planLegacy = Math.max(0, ...planLegacyCandidates)
  if (new Set(planLegacyCandidates).size > 1) {
    warnings.push('O legado mínimo do cadastro não coincide com a meta de legado; foi usado o maior.')
  }
  const legacy = sc.legacyMin ?? planLegacy
  requireAmount(legacy, 'legado mínimo')

  // Pontos: a data de referência e o fim de cada passo.
  const pointMonths = Array.from({ length: T + 1 }, (_, t) => firstMonth - 1 + Math.min(12 * t, months))
  const ages = pointMonths.map((m) => ageAtMonthEnd(youngestBirth, m))
  const titularAges = pointMonths.map((m) => ageAtMonthEnd(titularBirth, m))
  const years = pointMonths.map(yearOf)

  return {
    startYear,
    firstMonth,
    T,
    stepMonths,
    stepFrac,
    W0,
    income: income.slice(0, T),
    inflows: inflows.slice(0, T),
    essential: essential.slice(0, T),
    lifestyle: lifestyle.slice(0, T),
    outflows: outflows.slice(0, T),
    base,
    firstMonthFlow,
    firstMonthEssential: essential[T],
    firstMonthLifestyle: lifestyle[T],
    retiredFrom,
    retirementYear,
    retirementAge,
    legacy,
    fee: h.feeRate,
    weightsSource,
    profileId,
    weightsPre,
    weightsPost,
    shockPre,
    shockPost,
    rules,
    ages,
    titularAges,
    years,
    warnings,
  }
}

function weightedShocks(delta: Float64Array, w: Float64Array, T: number): Float64Array {
  const K = w.length
  const out = new Float64Array(T)
  for (let t = 0; t < T; t++) {
    let sum = 0
    for (let k = 0; k < K; k++) sum += w[k] * delta[t * K + k]
    out[t] = sum
  }
  return out
}

/** Fluxo líquido do passo com o plano completo (sem regras de gasto flexível). */
export function fullPlanFlows(plan: Plan): Float64Array {
  const f = new Float64Array(plan.T)
  for (let t = 0; t < plan.T; t++) f[t] = plan.base[t] - plan.lifestyle[t]
  return f
}

/** Ordem dos perfis para conferir o suitability. */
export const PROFILE_ORDER = ['conservador', 'moderado', 'arrojado'] as const

/** true quando o perfil simulado está acima do perfil de investidor (suitability) do cliente. */
export function isAboveSuitability(profileId: string, suitability: string | undefined): boolean {
  if (!suitability) return false
  const p = PROFILE_ORDER.indexOf(profileId as (typeof PROFILE_ORDER)[number])
  const s = PROFILE_ORDER.indexOf(suitability as (typeof PROFILE_ORDER)[number])
  // Perfil ou suitability fora da lista: na dúvida, trata como acima.
  if (p < 0 || s < 0) return true
  return p > s
}
