// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Tipos do ciclo mensal (SPEC, "Modelo de dados"): cadastro da família, versões do plano e fechamentos do mês.
// Valores do plano em reais do mês-base da versão; posições e movimentos em reais da data de referência.

import type { CashFlow, Goal, OtherAsset, Person, PlanEvent, SpendingRules } from '../engine/types.ts'

export type Channel = 'cadm' | 'ai'

/** De onde vêm os pesos da carteira no motor: os pesos-alvo do perfil (CADM) ou a carteira atual (AI). */
export type HouseholdWeightsSource = 'perfil' | 'carteira_atual'

/** Cadastro da família (tabela `households`): canal e regras do motor por família. */
export interface HouseholdRecord {
  id: string
  name: string
  channel: Channel
  bankerId?: string
  profileId: string
  weightsSource: HouseholdWeightsSource
  suitability?: string
  feeRate: number
  horizonAge: number
  /** Semente da família, a mesma todos os meses (D-030). */
  seed: number
}

/** O que uma versão do plano guarda (`plan_versions.snapshot`): tudo o que a família declara. */
export interface PlanSnapshot {
  /** Legado mínimo: fica na versão do plano, e não no cadastro, porque é um valor em reais do mês-base (D-033). */
  legacyMin?: number
  people: Person[]
  otherAssets: OtherAsset[]
  cashFlows: CashFlow[]
  events: PlanEvent[]
  goals: Goal[]
  rules: SpendingRules
}

/** Versão do plano (tabela `plan_versions`). */
export interface PlanVersion {
  id: string
  /** Mês-base dos valores (AAAA-MM). */
  baseMonth: string
  snapshot: PlanSnapshot
  createdAt?: string
  note?: string
}

/** Aporte ou resgate do mês (tabela `flows`), sempre com valor positivo. */
export interface ExternalFlow {
  /** Data do movimento (AAAA-MM-DD); sem data, a rentabilidade usa o meio do mês e marca "datas aproximadas". */
  date?: string
  kind: 'aporte' | 'resgate'
  amount: number
  description?: string
}

/** Fechamento do mês de uma família: posições por classe, PL oficial e aportes e resgates. */
export interface MonthClosing {
  /** Data de referência (AAAA-MM-DD), o último dia do mês. */
  refDate: string
  /** Patrimônio por classe (soma de `valor_liquido` por `class_code`), em reais da data de referência. */
  positionsByClass: Record<string, number>
  /** PL oficial do extrato, para a conferência. */
  officialPl: number
  flows: ExternalFlow[]
}

/** Dados de uma família para o ciclo mensal (formato de `src/data/andrade-fechamentos.json`). */
export interface HouseholdMonths {
  household: HouseholdRecord
  planVersions: PlanVersion[]
  /** IPCA de cada mês (AAAA-MM), em fração. */
  ipca: Record<string, number>
  closings: MonthClosing[]
}
