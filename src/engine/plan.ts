// Transforma o plano da família (formato de andrade.json) e as hipóteses do "E se?" em vetores anuais.
// Convenções (SPEC, "Dados de exemplo"): o ano civil do passo t é o ano da data de referência + t;
// anos de início e fim são inclusivos; valores em reais de hoje.

import { EngineInputError } from './errors.ts'
import { shockMatrix } from './shocks.ts'
import type { CashFlow, Person, PlanEvent, Profile, Scenario, SimInput, SpendingRules } from './types.ts'

const WEIGHT_SUM_TOL = 1e-6

export interface Plan {
  startYear: number
  /** Anos simulados (passos). */
  T: number
  /** Patrimônio financeiro simulado no início do ano 0. */
  W0: number
  /** Renda, aluguéis e dividendos por ano. */
  income: Float64Array
  /** Entradas de eventos e vendas de imóvel por ano. */
  inflows: Float64Array
  essential: Float64Array
  /** Estilo de vida planejado por ano (antes das regras de gasto flexível). */
  lifestyle: Float64Array
  /** Saídas de eventos por ano. */
  outflows: Float64Array
  /** Fluxo do ano sem o estilo de vida: renda + entradas − essencial − saídas. */
  base: Float64Array
  /** Primeiro passo já aposentado (T se a aposentadoria cai depois do horizonte). */
  retiredFrom: number
  retirementYear: number | null
  retirementAge: number | null
  legacy: number
  fee: number
  profileId: string
  weightsPre: Float64Array
  weightsPost: Float64Array | null
  /** Σ_k w_k δ_{t,k} por ano, com os pesos de antes e de depois da aposentadoria. */
  shockPre: Float64Array
  shockPost: Float64Array | null
  rules: SpendingRules
  /** Idade do membro mais jovem do casal em cada ponto (T + 1 pontos). */
  ages: number[]
  titularAges: number[]
  warnings: string[]
}

function birthYear(p: Person): number {
  const y = Number(p.birthDate.slice(0, 4))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate) || !Number.isInteger(y)) {
    throw new EngineInputError('data_invalida', `Data de nascimento inválida para ${p.name}: use AAAA-MM-DD.`)
  }
  return y
}

function requireAmount(value: number, what: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new EngineInputError('valor_invalido', `Valor inválido em ${what}: precisa ser um número maior ou igual a zero.`)
  }
}

/** Soma `amount` nos anos de `from` a `to` (inclusivos) que caem no horizonte. */
function addRange(arr: Float64Array, startYear: number, from: number, to: number, amount: number): void {
  const a = Math.max(from, startYear) - startYear
  const b = Math.min(to, startYear + arr.length - 1) - startYear
  for (let t = a; t <= b; t++) arr[t] += amount
}

function eventYears(ev: PlanEvent): number[] {
  if (!Number.isInteger(ev.year)) throw new EngineInputError('evento_invalido', `Ano inválido no evento "${ev.name}".`)
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

function weightVector(weights: Record<string, number>, codes: string[], profileName: string): Float64Array {
  const w = new Float64Array(codes.length)
  let sum = 0
  for (const [code, value] of Object.entries(weights)) {
    const k = codes.indexOf(code)
    if (k < 0) throw new EngineInputError('peso_classe_desconhecida', `O perfil ${profileName} tem peso para a classe ${code}, que não está nas premissas.`)
    if (!Number.isFinite(value) || value < 0) throw new EngineInputError('peso_invalido', `Peso inválido para ${code} no perfil ${profileName}.`)
    w[k] = value
    sum += value
  }
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOL) {
    throw new EngineInputError('pesos_nao_somam_1', `Os pesos do perfil ${profileName} somam ${(sum * 100).toFixed(2)}%, e precisam somar 100%.`)
  }
  return w
}

function validateRules(r: SpendingRules): void {
  const ok =
    r.lower > 0 && r.upper > r.lower && r.cut >= 0 && r.cut < 1 && r.raise >= 0 &&
    r.floor > 0 && r.floor <= 1 && r.cap >= 1 && Number.isInteger(r.noCutLastYears) && r.noCutLastYears >= 0 &&
    (r.mode === 'trajetoria_referencia' || r.mode === 'guyton_klinger')
  if (!ok) throw new EngineInputError('regras_invalidas', 'Parâmetros das regras de gasto flexível inválidos.')
}

/** Escala o vetor para que o ano 0 valha `target`, mantendo a proporção dos demais anos. */
function scaleToFirstYear(arr: Float64Array, target: number, what: string, warnings: string[]): void {
  requireAmount(target, what)
  const first = arr[0]
  if (first > 0) {
    const f = target / first
    for (let t = 0; t < arr.length; t++) arr[t] *= f
  } else {
    arr.fill(target)
    warnings.push(`O plano não tinha ${what} no primeiro ano; o valor do "E se?" foi aplicado a todos os anos.`)
  }
}

export function profileFor(profiles: Profile[], profileId: string): Profile {
  const profile = profiles.find((p) => p.id === profileId)
  if (!profile) throw new EngineInputError('perfil_desconhecido', `Perfil de alocação "${profileId}" não encontrado.`)
  return profile
}

export function buildPlan(input: SimInput): Plan {
  const { household: hd, cma, profiles } = input
  const sc: Scenario = input.scenario ?? {}
  const warnings: string[] = []
  const h = hd.household

  const startYear = Number(h.referenceDate.slice(0, 4))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(h.referenceDate)) {
    throw new EngineInputError('data_invalida', 'Data de referência das posições inválida: use AAAA-MM-DD.')
  }

  // Horizonte: até o membro mais jovem do casal completar a idade-limite.
  const couple = hd.people.filter((p) => p.role === 'titular' || p.role === 'conjuge')
  if (couple.length === 0) throw new EngineInputError('sem_titular', 'O plano precisa de um titular.')
  const titular = couple.find((p) => p.role === 'titular') ?? couple[0]
  const youngest = couple.reduce((a, b) => (b.birthDate > a.birthDate ? b : a))
  const age0 = startYear - birthYear(youngest)
  const titularAge0 = startYear - birthYear(titular)
  const lastYearFor = (person: Person, age: number, what: string): number => {
    if (!Number.isInteger(age)) throw new EngineInputError('horizonte_invalido', `A idade-limite de ${what} precisa ser um número inteiro.`)
    return birthYear(person) + age - 1
  }

  // Último ano simulado do plano oficial: o mais longo entre a idade-limite da família e a meta de padrão de vida (D-021).
  let planLastYear = lastYearFor(youngest, h.horizonAge, 'horizonte')
  for (const goal of hd.goals.filter((g) => g.kind === 'padrao_de_vida' && g.targetAge !== undefined)) {
    const person = goal.personId === undefined ? youngest : hd.people.find((p) => p.id === goal.personId)
    if (!person) throw new EngineInputError('meta_invalida', `A meta de padrão de vida cita a pessoa "${goal.personId}", que não está no plano.`)
    const goalLastYear = lastYearFor(person, goal.targetAge as number, 'meta de padrão de vida')
    if (goalLastYear !== planLastYear) {
      warnings.push(`A meta de padrão de vida (${person.name}, ${goal.targetAge} anos) não coincide com o horizonte da família; foi usado o mais longo.`)
      planLastYear = Math.max(planLastYear, goalLastYear)
    }
  }
  // O "E se?" muda a idade-limite do membro mais jovem do casal.
  const lastYear = sc.horizonAge === undefined ? planLastYear : lastYearFor(youngest, sc.horizonAge, 'horizonte')
  const T = lastYear - startYear + 1
  if (T < 1) throw new EngineInputError('horizonte_invalido', 'A idade-limite do horizonte já foi atingida.')
  /** Fluxos que cobrem o fim do horizonte do plano acompanham um horizonte mais longo no "E se?" (D-019). */
  const extendToHorizon = (to: number): number => (to >= planLastYear && lastYear > planLastYear ? Math.max(to, lastYear) : to)

  // Aposentadoria do titular. Sem idade informada, o titular já é considerado aposentado.
  const planRetirementAge = titular.retirementAge ?? null
  const retirementAge = sc.retirementAge ?? planRetirementAge
  if (retirementAge !== null && !Number.isInteger(retirementAge)) {
    throw new EngineInputError('aposentadoria_invalida', 'A idade de aposentadoria precisa ser um número inteiro.')
  }
  const retirementYear = retirementAge === null ? null : birthYear(titular) + retirementAge
  const planRetirementYear = planRetirementAge === null ? null : birthYear(titular) + planRetirementAge
  const retiredFrom = retirementYear === null ? 0 : Math.min(T, Math.max(0, retirementYear - startYear))

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

  // Vendas de imóvel do cenário.
  const sales = new Map<string, number>()
  for (const s of sc.propertySales ?? []) {
    const asset = hd.otherAssets.find((a) => a.id === s.propertyId)
    if (!asset || asset.kind !== 'imovel') throw new EngineInputError('imovel_desconhecido', `Imóvel "${s.propertyId}" não encontrado.`)
    if (!asset.canBeSold) throw new EngineInputError('imovel_nao_vendavel', `O imóvel "${asset.name}" está marcado como não vendável.`)
    if (!Number.isInteger(s.year) || s.year < startYear || s.year >= startYear + T) {
      throw new EngineInputError('venda_fora_do_horizonte', `O ano de venda de "${asset.name}" precisa estar entre ${startYear} e ${startYear + T - 1}.`)
    }
    sales.set(asset.id, s.year)
  }

  const income = new Float64Array(T)
  const inflows = new Float64Array(T)
  const essential = new Float64Array(T)
  const lifestyle = new Float64Array(T)
  const outflows = new Float64Array(T)

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
        addRange(income, startYear, cf.startYear, to, amount)
        break
      case 'aluguel': {
        // O aluguel de um imóvel vendido para a partir do ano da venda.
        const saleYear = cf.otherAssetId ? sales.get(cf.otherAssetId) : undefined
        if (saleYear !== undefined) to = Math.min(to, saleYear - 1)
        addRange(income, startYear, cf.startYear, to, amount)
        break
      }
      case 'gasto_essencial':
        addRange(essential, startYear, cf.startYear, to, amount)
        break
      case 'gasto_estilo':
        addRange(lifestyle, startYear, cf.startYear, to, amount)
        break
      default:
        throw new EngineInputError('fluxo_invalido', `Tipo de fluxo desconhecido em "${(cf as CashFlow).name}".`)
    }
  }

  if (sc.essentialMonthly !== undefined) scaleToFirstYear(essential, sc.essentialMonthly * 12, 'gasto essencial', warnings)
  if (sc.lifestyleMonthly !== undefined) scaleToFirstYear(lifestyle, sc.lifestyleMonthly * 12, 'gasto de estilo de vida', warnings)
  const k = sc.spendingMultiplier ?? 1
  if (!Number.isFinite(k) || k < 0) throw new EngineInputError('multiplicador_invalido', 'Multiplicador de gasto inválido.')
  if (k !== 1) {
    for (let t = 0; t < T; t++) {
      essential[t] *= k
      lifestyle[t] *= k
    }
  }

  for (const ev of [...hd.events, ...(sc.extraEvents ?? [])]) {
    requireAmount(ev.amountReal, ev.name)
    const target = ev.direction === 'entrada' ? inflows : outflows
    for (const y of eventYears(ev)) addRange(target, startYear, y, y, ev.amountReal)
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
    inflows[year - startYear] += value
  }

  const base = new Float64Array(T)
  for (let t = 0; t < T; t++) base[t] = income[t] + inflows[t] - essential[t] - outflows[t]

  // Carteira: pesos do perfil, taxa de gestão e choques.
  const profileId = sc.profileId ?? h.profileId
  const profile = profileFor(profiles, profileId)
  const codes = cma.classes.map((c) => c.code)
  const weightsPre = weightVector(profile.weightsPre, codes, profile.name)
  const weightsPost = profile.weightsPost ? weightVector(profile.weightsPost, codes, profile.name) : null
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

  const ages = Array.from({ length: T + 1 }, (_, t) => age0 + t)
  const titularAges = Array.from({ length: T + 1 }, (_, t) => titularAge0 + t)

  return {
    startYear,
    T,
    W0,
    income,
    inflows,
    essential,
    lifestyle,
    outflows,
    base,
    retiredFrom,
    retirementYear,
    retirementAge,
    legacy,
    fee: h.feeRate,
    profileId,
    weightsPre,
    weightsPost,
    shockPre,
    shockPost,
    rules,
    ages,
    titularAges,
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

/** Fluxo líquido do ano com o plano completo (sem regras de gasto flexível). */
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
