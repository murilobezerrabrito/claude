// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Rodada oficial do mês (SPEC, "Fluxo do mês" e "Termômetro mensal"): as entradas do mês no motor, com a semente da
// família e 10.000 trajetórias. "A chance" é a probabilidade sem gasto flexível; com as regras ligadas no plano, a
// chance com ajustes em anos ruins vem ao lado, como informação secundária.

import { hashInputs } from '../engine/hash.ts'
import { buildPlan } from '../engine/plan.ts'
import { simulate } from '../engine/simulate.ts'
import type { Cma, Percentiles, Profile, RequiredReturnStatus, SimInput, SimResult } from '../engine/types.ts'
import { ENGINE_VERSION } from '../engine/version.ts'
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

/**
 * O hash que o motor dá às entradas de uma simulação (o mesmo de `simulate`), sem simular: confere, na montagem, que
 * cada parte guardada da rodada é das entradas de agora.
 */
export function runInputsHash(input: SimInput, paths: number, seed: number): string {
  return hashInputs({ input, paths, seed, engineVersion: ENGINE_VERSION })
}

/** Campos do resultado do motor que a rodada oficial guarda (o resto do resultado não entra nos números do mês). */
export type MainRunResult = Pick<
  SimResult,
  | 'inputsHash'
  | 'engineVersion'
  | 'cmaVersion'
  | 'successProbability'
  | 'legacyProbability'
  | 'requiredReturn'
  | 'expectedCompositeReturn'
  | 'slack'
  | 'ages'
  | 'years'
  | 'percentiles'
  | 'depletionAge'
  | 'warnings'
>

export function mainRunResult(r: SimResult): MainRunResult {
  const { inputsHash, engineVersion, cmaVersion, successProbability, legacyProbability, requiredReturn, expectedCompositeReturn, slack, ages, years, percentiles, depletionAge, warnings } = r
  return { inputsHash, engineVersion, cmaVersion, successProbability, legacyProbability, requiredReturn, expectedCompositeReturn, slack, ages, years, percentiles, depletionAge, warnings }
}

/** As simulações da rodada oficial: a principal e, quando o plano liga as regras, a com gasto flexível. */
export interface OfficialRunPlan {
  refMonth: string
  seed: number
  paths: number
  main: SimInput
  rules: SimInput | null
  /** Patrimônio simulado na data de referência. */
  wealth: number
}

export function officialRunPlan(pkg: MonthPackage, ipca: IpcaSeries, opts: { paths?: number } = {}): OfficialRunPlan {
  const m = buildMonthInputs({ ...pkg, ipca })
  const plan = buildPlan(m.input)
  return {
    refMonth: m.refMonth,
    seed: m.seed,
    paths: opts.paths ?? OFFICIAL_PATHS,
    main: mainInput(m.input),
    rules: plan.rules.enabled ? { ...m.input, scenario: { ...(m.input.scenario ?? {}), rulesEnabled: true } } : null,
    wealth: plan.W0,
  }
}

/** Números congelados a partir das simulações já feitas (no servidor, cada uma numa chamada). */
export function assembleOfficialRun(pkg: MonthPackage, plan: OfficialRunPlan, main: MainRunResult, probabilityWithRules: number | null): OfficialRun {
  return {
    refMonth: plan.refMonth,
    refDate: pkg.closing.refDate,
    inputsHash: main.inputsHash,
    engineVersion: main.engineVersion,
    cmaVersion: main.cmaVersion,
    planVersionId: pkg.planVersion.id,
    seed: plan.seed,
    paths: plan.paths,
    successCount: Math.round(main.successProbability * plan.paths),
    probability: main.successProbability,
    probabilityWithRules,
    legacyProbability: main.legacyProbability,
    requiredReturn: main.requiredReturn.rate,
    requiredReturnStatus: main.requiredReturn.status,
    expectedCompositeReturn: main.expectedCompositeReturn,
    slack: main.slack,
    wealth: plan.wealth,
    ages: main.ages,
    years: main.years,
    percentiles: main.percentiles,
    depletionAge: main.depletionAge,
    warnings: main.warnings,
  }
}

export function officialRun(pkg: MonthPackage, ipca: IpcaSeries, opts: { paths?: number } = {}): OfficialRun {
  const plan = officialRunPlan(pkg, ipca, opts)
  const opt = { paths: plan.paths, seed: plan.seed }
  const main = simulate(plan.main, opt)
  const withRules = plan.rules ? simulate(plan.rules, opt) : null
  return assembleOfficialRun(pkg, plan, mainRunResult(main), withRules ? withRules.successProbability : null)
}
