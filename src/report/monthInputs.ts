// Entradas do motor para a rodada do mês (SPEC, "Motor no ciclo mensal", item 4): o fechamento conferido, a versão
// vigente do plano corrigida pelo IPCA até o mês de referência, as premissas vigentes e a semente da família.

import type { Cma, HouseholdData, OtherAsset, Profile, Scenario, SimInput } from '../engine/types.ts'
import { ReportInputError } from './errors.ts'
import { formatMoneyExact } from '../lib/format.ts'
import { correctPlan, ipcaFactor, lastDayOfMonth, parseMonth, type IpcaSeries } from './inflation.ts'
import type { HouseholdRecord, MonthClosing, PlanVersion } from './types.ts'

/** Tolerância da conferência: a soma das posições precisa bater com o PL oficial em 0,01%. */
export const PL_TOLERANCE = 0.0001

const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/


/**
 * Confere o fechamento: data de referência no último dia do mês, posições válidas e soma das posições igual ao PL
 * oficial, com tolerância de 0,01% (SPEC, "Importação mensal das posições"). Devolve o mês de referência (AAAA-MM).
 */
export function checkClosing(closing: MonthClosing): string {
  const m = DATE_RE.exec(closing.refDate)
  if (!m || Number(m[3]) !== lastDayOfMonth(Number(m[1]), Number(m[2]))) {
    throw new ReportInputError('data_referencia_invalida', `A data de referência ${closing.refDate} precisa ser o último dia de um mês (ex.: 2026-09-30).`)
  }
  let sum = 0
  for (const [code, value] of Object.entries(closing.positionsByClass)) {
    if (!Number.isFinite(value) || value < 0) throw new ReportInputError('posicao_invalida', `Posição inválida na classe ${code}.`)
    sum += value
  }
  if (!Number.isFinite(closing.officialPl) || closing.officialPl <= 0) {
    throw new ReportInputError('pl_invalido', 'O PL oficial do mês precisa ser um valor positivo.')
  }
  if (Math.abs(sum - closing.officialPl) > PL_TOLERANCE * closing.officialPl) {
    throw new ReportInputError(
      'pl_nao_confere',
      `A soma das posições (${formatMoneyExact(sum)}) não bate com o PL oficial (${formatMoneyExact(closing.officialPl)}): a família fica fora do fechamento até a diferença ser resolvida.`,
    )
  }
  return closing.refDate.slice(0, 7)
}

/**
 * Pesos da carteira atual (clientes AI): posições por classe mais os bens declarados que entram na simulação, pela
 * classe de cada um (D-033), divididos pelo total.
 */
export function currentWeights(positionsByClass: Record<string, number>, otherAssets: OtherAsset[]): Record<string, number> {
  const byClass = new Map<string, number>()
  const add = (code: string, value: number) => byClass.set(code, (byClass.get(code) ?? 0) + value)
  for (const [code, value] of Object.entries(positionsByClass)) if (value > 0) add(code, value)
  for (const a of otherAssets) {
    if (!a.inSimulation || a.value <= 0) continue
    if (a.classCode === undefined) {
      throw new ReportInputError('bem_sem_classe', `"${a.name}" entra na simulação, mas não tem classe de ativo: a carteira atual precisa dela.`)
    }
    add(a.classCode, a.value)
  }
  let total = 0
  for (const v of byClass.values()) total += v
  if (total <= 0) throw new ReportInputError('carteira_vazia', 'A carteira atual está vazia: não há pesos para simular.')
  return Object.fromEntries(Array.from(byClass, ([code, v]) => [code, v / total]))
}

/** Versão do plano em vigor no mês: a mais recente com mês-base até o mês de referência. */
export function planVersionFor(versions: PlanVersion[], refMonth: string): PlanVersion {
  const ref = parseMonth(refMonth, 'mês de referência')
  let best: PlanVersion | null = null
  let bestMonth = -Infinity
  for (const v of versions) {
    const base = parseMonth(v.baseMonth, `mês-base da versão ${v.id}`)
    if (base === bestMonth) throw new ReportInputError('versoes_ambiguas', `Duas versões do plano têm o mesmo mês-base (${v.baseMonth}).`)
    if (base <= ref && base > bestMonth) {
      best = v
      bestMonth = base
    }
  }
  if (!best) throw new ReportInputError('sem_plano', `Não há versão do plano com mês-base até ${refMonth}.`)
  return best
}

export interface MonthInputsArgs {
  household: HouseholdRecord
  planVersion: PlanVersion
  closing: MonthClosing
  ipca: IpcaSeries
  cma: Cma
  profiles: Profile[]
  /** Hipóteses do "E se?", em reais da data de referência (a rodada oficial não tem). */
  scenario?: Scenario
  /**
   * Pesos explícitos no lugar dos da carteira atual (clientes AI). A ponte usa para manter os pesos do mês anterior
   * até o passo "Carteira".
   */
  weights?: Record<string, number>
}

export interface MonthInputs {
  input: SimInput
  /** Semente da família (`households.seed`). */
  seed: number
  /** Mês de referência (AAAA-MM). */
  refMonth: string
  /** IPCA acumulado do mês seguinte ao mês-base do plano até o mês de referência. */
  ipcaFactor: number
}

/** Monta as entradas do motor para o mês. Função pura: mesmos dados, mesmas entradas (e o mesmo hash). */
export function buildMonthInputs(args: MonthInputsArgs): MonthInputs {
  const { household: h, planVersion, closing, ipca, cma, profiles } = args
  const refMonth = checkClosing(closing)
  const factor = ipcaFactor(ipca, planVersion.baseMonth, refMonth)
  const plan = correctPlan(planVersion.snapshot, factor)

  const household: HouseholdData['household'] = {
    id: h.id,
    name: h.name,
    ...(h.bankerId === undefined ? {} : { bankerId: h.bankerId }),
    referenceDate: closing.refDate,
    profileId: h.profileId,
    ...(h.weightsSource === 'carteira_atual' ? { weights: args.weights ?? currentWeights(closing.positionsByClass, plan.otherAssets) } : {}),
    ...(h.suitability === undefined ? {} : { suitability: h.suitability }),
    feeRate: h.feeRate,
    horizonAge: h.horizonAge,
    ...(plan.legacyMin === undefined ? {} : { legacyMin: plan.legacyMin }),
  }
  const data: HouseholdData = {
    household,
    people: plan.people,
    cadmPositionsByClass: { ...closing.positionsByClass },
    otherAssets: plan.otherAssets,
    cashFlows: plan.cashFlows,
    events: plan.events,
    goals: plan.goals,
    rules: plan.rules,
  }
  return {
    input: { household: data, cma, profiles, ...(args.scenario === undefined ? {} : { scenario: args.scenario }) },
    seed: h.seed,
    refMonth,
    ipcaFactor: factor,
  }
}
