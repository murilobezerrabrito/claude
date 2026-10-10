// Rodada oficial do mês no servidor (SPEC, "Onde roda a rodada oficial"): uma simulação por chamada. A partir das
// entradas do mês (o pacote do mês, o IPCA e a rodada publicada do mês anterior), diz quais partes rodar, roda uma
// parte e, com todas guardadas, monta a rodada oficial, a ponte e a rentabilidade, conferindo que cada parte é das
// entradas de agora. Os números são os mesmos de officialRun e monthAttribution (teste).

import { simulate } from '../engine/simulate.ts'
import type { SimInput } from '../engine/types.ts'
import { assembleBridge, bridgePlan, runBridgeState, type BridgePlan, type BridgeState, type BridgeStepId, type MonthAttribution } from './attribution.ts'
import { ReportInputError } from './errors.ts'
import type { IpcaSeries } from './inflation.ts'
import { assembleOfficialRun, mainRunResult, officialRunPlan, runInputsHash, type MainRunResult, type MonthPackage, type OfficialRun, type OfficialRunPlan } from './officialRun.ts'
import { monthReturn } from './performance.ts'

/** Entradas de uma rodada, como o banco devolve (run_inputs). */
export interface RunInputs {
  pkg: MonthPackage
  ipca: IpcaSeries
  /** A rodada publicada do mês anterior (fechado) e o pacote dela; null no primeiro mês acompanhado. */
  previous: { pkg: MonthPackage; published: OfficialRun } | null
}

/**
 * Os passos do plano da ponte que viram parte da rodada: todos menos o último ("premissas"), que é a rodada principal.
 * A "atualização do método" não é passo do plano: sai da parte "inicio".
 */
export type BridgePart = Exclude<BridgeStepId, 'premissas' | 'atualizacao_do_metodo'>
export type RunPart = 'principal' | 'gasto_flexivel' | 'inicio' | BridgePart

export interface RunTasks {
  official: OfficialRunPlan
  bridge: BridgePlan | null
  parts: RunPart[]
}

export function runTasks(inputs: RunInputs, opts: { paths?: number } = {}): RunTasks {
  const official = officialRunPlan(inputs.pkg, inputs.ipca, opts)
  const plan = bridgePlan({ previous: inputs.previous, current: inputs.pkg, ipca: inputs.ipca, paths: official.paths })
  const bridge = plan.kind === 'plano_da_ponte' ? plan : null
  if (bridge && runInputsHash(bridge.steps[bridge.steps.length - 1].input, official.paths, official.seed) !== runInputsHash(official.main, official.paths, official.seed)) {
    throw new ReportInputError('ponte_final', 'O último passo da ponte não tem as entradas da rodada oficial do mês.')
  }
  const parts: RunPart[] = ['principal']
  if (official.rules) parts.push('gasto_flexivel')
  if (bridge) parts.push('inicio', ...bridge.steps.slice(0, -1).map((s) => s.id as BridgePart))
  return { official, bridge, parts }
}

/** Entradas da simulação de uma parte. */
export function partInput(tasks: RunTasks, part: RunPart): SimInput {
  if (part === 'principal') return tasks.official.main
  if (part === 'gasto_flexivel') {
    if (!tasks.official.rules) throw new ReportInputError('parte_invalida', 'O plano não liga as regras de gasto flexível.')
    return tasks.official.rules
  }
  if (!tasks.bridge) throw new ReportInputError('parte_invalida', 'Primeiro mês acompanhado: não há ponte.')
  if (part === 'inicio') return tasks.bridge.startInput
  const step = tasks.bridge.steps.slice(0, -1).find((s) => s.id === part)
  if (!step) throw new ReportInputError('parte_invalida', `Parte desconhecida: ${part}.`)
  return step.input
}

export interface PartOutcome {
  inputsHash: string
  result: MainRunResult | { successProbability: number } | BridgeState
}

/** Roda a simulação de uma parte. */
export function runPart(tasks: RunTasks, part: RunPart): PartOutcome {
  const { paths, seed } = tasks.official
  const input = partInput(tasks, part)
  if (part === 'principal') {
    const r = simulate(input, { paths, seed })
    return { inputsHash: r.inputsHash, result: mainRunResult(r) }
  }
  if (part === 'gasto_flexivel') {
    const r = simulate(input, { paths, seed })
    return { inputsHash: r.inputsHash, result: { successProbability: r.successProbability } }
  }
  const state = runBridgeState(input, paths, seed)
  return { inputsHash: state.inputsHash, result: state }
}

export interface AssembledRun {
  run: OfficialRun
  attribution: MonthAttribution
  /** Rentabilidade real do mês (Dietz deflacionado); null no primeiro mês acompanhado. */
  realizedReturnReal: number | null
}

/** Monta a rodada a partir das partes guardadas; recusa se faltar parte ou se alguma for de outras entradas. */
export function assembleRun(inputs: RunInputs, tasks: RunTasks, stored: Partial<Record<RunPart, PartOutcome>>): AssembledRun {
  const { paths, seed } = tasks.official
  for (const part of tasks.parts) {
    const s = stored[part]
    if (!s) throw new ReportInputError('parte_faltando', `Falta a parte "${part}" da rodada.`)
    if (s.inputsHash !== runInputsHash(partInput(tasks, part), paths, seed)) {
      throw new ReportInputError('parte_desatualizada', `A parte "${part}" foi rodada com outras entradas: refaça a rodada.`)
    }
  }
  const main = stored.principal!.result as MainRunResult
  const rules = tasks.official.rules ? (stored.gasto_flexivel!.result as { successProbability: number }).successProbability : null
  const run = assembleOfficialRun(inputs.pkg, tasks.official, main, rules)
  if (!tasks.bridge || !inputs.previous) return { run, attribution: { kind: 'primeiro_mes' }, realizedReturnReal: null }
  const final: BridgeState = { inputsHash: main.inputsHash, successCount: run.successCount, requiredReturn: run.requiredReturn, wealth: run.wealth }
  // Cada passo recebe a parte com o seu nome; o último é a rodada principal.
  const last = tasks.bridge.steps.length - 1
  const states = tasks.bridge.steps.map((s, i) => (i === last ? final : (stored[s.id as BridgePart]!.result as BridgeState)))
  const attribution = assembleBridge(tasks.bridge, stored.inicio!.result as BridgeState, states)
  const prev = inputs.previous.pkg.closing
  const cur = inputs.pkg.closing
  const realized = monthReturn({ refDate: cur.refDate, startValue: prev.officialPl, endValue: cur.officialPl, flows: cur.flows, ipca: inputs.ipca })
  return { run, attribution, realizedReturnReal: realized.real }
}
