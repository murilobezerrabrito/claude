// Rodada oficial do mês (SPEC, "Fluxo do mês" e "Termômetro mensal"): as entradas do mês no motor, com a semente da
// família e 10.000 trajetórias. "A chance" é a probabilidade sem gasto flexível; com as regras ligadas no plano, a
// chance com ajustes em anos ruins vem ao lado, como informação secundária.

import { buildPlan } from '../engine/plan.ts'
import { simulate } from '../engine/simulate.ts'
import type { Cma, Percentiles, Profile, RequiredReturnStatus, SimInput } from '../engine/types.ts'
import type { IpcaSeries } from './inflation.ts'
import { buildMonthInputs } from './monthInputs.ts'
import type { HouseholdRecord, MonthClosing, PlanVersion } from './types.ts'

/** Trajetórias da rodada oficial (configurável). */
export const OFFICIAL_PATHS = 10_000

/** Tudo o que define a rodada de um mês, além do IPCA. */
export interface MonthPackage {
  household: HouseholdRecord
  planVersion: PlanVersion
  closing: MonthClosing
  cma: Cma
  profiles: Profile[]
}

/** Entrada da rodada principal: a do mês, sem gasto flexível. */
export function mainInput(input: SimInput): SimInput {
  return { ...input, scenario: { ...(input.scenario ?? {}), rulesEnabled: false } }
}

/** Números congelados de uma rodada oficial. */
export interface OfficialRun {
  refMonth: string
  refDate: string
  /** Hash das entradas da rodada principal (sem gasto flexível). */
  inputsHash: string
  engineVersion: string
  cmaVersion: string
  planVersionId: string
  seed: number
  paths: number
  /** Trajetórias que chegam ao fim do horizonte, sem gasto flexível. */
  successCount: number
  /** "A chance": probabilidade de sucesso sem gasto flexível. */
  probability: number
  /** Com as regras de gasto flexível do plano; null quando o plano não as liga. */
  probabilityWithRules: number | null
  legacyProbability: number | null
  /** Benchmark pessoal r*; null em "folga total" ou "plano inviável" (ver `requiredReturnStatus`). */
  requiredReturn: number | null
  requiredReturnStatus: RequiredReturnStatus
  expectedCompositeReturn: number
  slack: number | null
  /** Patrimônio simulado na data de referência (carteira mais os bens que entram na simulação). */
  wealth: number
  ages: number[]
  years: number[]
  percentiles: Percentiles
  depletionAge: number | null
  warnings: string[]
}

export function officialRun(pkg: MonthPackage, ipca: IpcaSeries, opts: { paths?: number } = {}): OfficialRun {
  const m = buildMonthInputs({ ...pkg, ipca })
  const paths = opts.paths ?? OFFICIAL_PATHS
  const opt = { paths, seed: m.seed }
  const main = simulate(mainInput(m.input), opt)
  const plan = buildPlan(m.input)
  const withRules = plan.rules.enabled ? simulate({ ...m.input, scenario: { ...(m.input.scenario ?? {}), rulesEnabled: true } }, opt) : null
  return {
    refMonth: m.refMonth,
    refDate: pkg.closing.refDate,
    inputsHash: main.inputsHash,
    engineVersion: main.engineVersion,
    cmaVersion: main.cmaVersion,
    planVersionId: pkg.planVersion.id,
    seed: m.seed,
    paths,
    successCount: Math.round(main.successProbability * paths),
    probability: main.successProbability,
    probabilityWithRules: withRules ? withRules.successProbability : null,
    legacyProbability: main.legacyProbability,
    requiredReturn: main.requiredReturn.rate,
    requiredReturnStatus: main.requiredReturn.status,
    expectedCompositeReturn: main.expectedCompositeReturn,
    slack: main.slack,
    wealth: plan.W0,
    ages: main.ages,
    years: main.years,
    percentiles: main.percentiles,
    depletionAge: main.depletionAge,
    warnings: main.warnings,
  }
}
