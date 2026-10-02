// Tipos de entrada e saída do motor. Valores em reais de hoje; taxas e retornos reais em fração decimal.

/** Classe de ativo com as premissas do comitê (retorno real aritmético e volatilidade anuais). */
export interface AssetClass {
  code: string
  name: string
  benchmark?: string
  mu: number
  vol: number
}

/** Versão das premissas do comitê (capital market assumptions). */
export interface Cma {
  version: string
  label?: string
  status?: string
  /** Graus de liberdade da t-Student, inteiro de 3 a 30, comum a todas as classes. */
  nu: number
  classes: AssetClass[]
  /** Matriz de correlação K×K, na ordem de `classes`. */
  correlation: number[][]
}

/** Perfil de alocação: pesos-alvo por código de classe (somam 1). */
export interface Profile {
  id: string
  name: string
  weightsPre: Record<string, number>
  /** Pesos depois da aposentadoria (opcional na v1). */
  weightsPost?: Record<string, number>
}

export type Sex = 'M' | 'F'
export type PersonRole = 'titular' | 'conjuge' | 'filho'

export interface Person {
  id: string
  name: string
  birthDate: string
  sex: Sex
  role: PersonRole
  retirementAge?: number
}

export type OtherAssetKind = 'previdencia' | 'imovel' | 'empresa' | 'exterior'

export interface OtherAsset {
  id: string
  kind: OtherAssetKind
  name: string
  value: number
  classCode?: string
  /** Entra no patrimônio financeiro simulado (ex.: VGBL). */
  inSimulation?: boolean
  canBeSold?: boolean
  /** Valor líquido de custos e impostos numa venda, informado pelo banker. */
  netSaleValue?: number
  annualIncome?: number
}

export type CashFlowKind = 'renda' | 'dividendos' | 'aluguel' | 'gasto_essencial' | 'gasto_estilo'

export interface CashFlow {
  kind: CashFlowKind
  name: string
  annualAmountReal: number
  startYear: number
  endYear: number
  otherAssetId?: string
}

export type EventRecurrence = 'unica' | 'anual' | 'a_cada_n'

export interface PlanEvent {
  name: string
  direction: 'entrada' | 'saida'
  amountReal: number
  year: number
  recurrence: EventRecurrence
  everyN?: number
  endYear?: number
}

export interface Goal {
  kind: 'padrao_de_vida' | 'legado'
  personId?: string
  targetAge?: number
  amount?: number
}

export type RulesMode = 'trajetoria_referencia' | 'guyton_klinger'

/** Regras de gasto flexível (só o estilo de vida, a partir da aposentadoria). */
export interface SpendingRules {
  enabled: boolean
  mode: RulesMode
  /** Gatilho inferior (0,8 = 80% da referência; no Guyton-Klinger, 80% da taxa de saque inicial). */
  lower: number
  /** Gatilho superior (1,2). */
  upper: number
  /** Corte multiplicativo (0,1 = −10% do nível atual). */
  cut: number
  /** Aumento multiplicativo (0,1 = +10% do nível atual). */
  raise: number
  /** Piso em fração do estilo de vida inicial. */
  floor: number
  /** Teto em fração do estilo de vida inicial. */
  cap: number
  /** Anos finais do horizonte sem cortes. */
  noCutLastYears: number
}

/** Plano oficial da família, no formato de `src/data/andrade.json`. */
export interface HouseholdData {
  household: {
    id: string
    name: string
    bankerId?: string
    /** Data de referência das posições (AAAA-MM-DD); o ano dela é o ano 0. */
    referenceDate: string
    profileId: string
    suitability?: string
    feeRate: number
    horizonAge: number
    legacyMin?: number
  }
  people: Person[]
  cadmPositionsByClass: Record<string, number>
  otherAssets: OtherAsset[]
  cashFlows: CashFlow[]
  events: PlanEvent[]
  goals: Goal[]
  rules: SpendingRules
}

/** Choque somado ao retorno real sorteado de cada classe, em fração (−0,35 = −35 p.p.). */
export interface ShockPreset {
  id: string
  name: string
  /** Ano 1 é o primeiro ano simulado. */
  fromYear: number
  toYear: number
  deltas: Record<string, number>
}

/** Hipóteses do "E se?", aplicadas numa cópia do plano oficial. */
export interface Scenario {
  retirementAge?: number
  /** Gasto essencial mensal no ano 0; os demais anos mantêm a proporção do plano. */
  essentialMonthly?: number
  /** Gasto de estilo de vida mensal no ano 0; os demais anos mantêm a proporção do plano. */
  lifestyleMonthly?: number
  /** Multiplicador do gasto total (essencial + estilo de vida). Usado em "gastar 10% a mais" e no gasto sustentável. */
  spendingMultiplier?: number
  /** Renda mensal por fonte (pelo nome do fluxo de renda). */
  incomes?: { name: string; monthly: number }[]
  /** Aportes ou resgates pontuais, somados aos eventos do plano. */
  extraEvents?: PlanEvent[]
  propertySales?: { propertyId: string; year: number }[]
  profileId?: string
  /** Choque genérico do 1º ano (0 a −0,30): inteiro na classe mais volátil, proporcional à volatilidade nas demais classes de risco. */
  firstYearShock?: number
  shocks?: ShockPreset[]
  horizonAge?: number
  rulesEnabled?: boolean
  rulesMode?: RulesMode
  /** Legado mínimo; `0` desliga a meta. */
  legacyMin?: number
}

/** Tudo o que o motor precisa para um cálculo. */
export interface SimInput {
  household: HouseholdData
  cma: Cma
  profiles: Profile[]
  scenario?: Scenario
}

export interface SimOptions {
  /** Trajetórias (padrão 5.000; mínimo 1.000). */
  paths: number
  /** Semente inteira de 32 bits. */
  seed: number
  /** Guarda o multiplicador do estilo de vida por trajetória e ano (testes e diagnóstico). */
  collectLifestyle?: boolean
}

export interface Percentiles {
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
}

export interface SimResult {
  engineVersion: string
  cmaVersion: string
  inputsHash: string
  seed: number
  paths: number
  /** Ano civil do índice 0. */
  startYear: number
  /** Número de anos simulados; as séries têm T + 1 pontos (início do ano 0 até o fim do horizonte). */
  T: number
  years: number[]
  /** Idade do membro mais jovem do casal, que define o horizonte, em cada ponto. */
  ages: number[]
  titularAges: number[]
  retirementYear: number | null
  successProbability: number
  /** null quando não há meta de legado. */
  legacyProbability: number | null
  /** Retorno composto realizado na simulação: exp(média de ln(1 + R)) − 1, com choques e taxa. */
  compositeReturn: number
  /** Retorno composto esperado do perfil, líquido de taxa e sem choques (usado na folga e na trajetória de referência). */
  expectedCompositeReturn: number
  percentiles: Percentiles
  /** Benchmark pessoal com o legado do cenário (determinístico, plano completo, sem regras de gasto flexível). */
  requiredReturn: RequiredReturnResult
  /** Folga = retorno composto esperado do perfil (líquido de taxa) − benchmark pessoal; null sem r* numérico. */
  slack: number | null
  /**
   * Idade (do mais jovem do casal) no ano em que o cenário ruim (P10) deixa de cobrir o déficit: o último ano
   * antes de o P10 chegar a zero. null = não esgota.
   */
  depletionAge: number | null
  /** Com regras ligadas: % das trajetórias com algum corte. null com regras desligadas. */
  cutProbability: number | null
  /** Mediana do maior corte entre as trajetórias com corte, em fração do estilo de vida inicial. */
  medianMaxCut: number | null
  /** Mediana do número de anos com corte entre as trajetórias com corte. */
  medianCutYears: number | null
  /** Multiplicador do estilo de vida por trajetória e ano (paths × T), só com `collectLifestyle`. */
  lifestyleMultipliers?: Float64Array
  warnings: string[]
}

export type RequiredReturnStatus = 'ok' | 'folga_total' | 'inviavel'

export interface RequiredReturnResult {
  status: RequiredReturnStatus
  /** r* em fração (0,0298 = IPCA + 2,98%); null quando o plano se sustenta até com −5% ou nem 20% basta. */
  rate: number | null
  message: string | null
}
