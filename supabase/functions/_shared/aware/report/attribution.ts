// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Ponte "o que mudou no mês" (SPEC, "O que mudou no mês (a ponte)"). A variação da chance e do benchmark pessoal, do
// número publicado no mês anterior até a rodada oficial do mês, é separada em seis passos que trocam um grupo de
// entradas por vez, nesta ordem fixa e com os mesmos sorteios (mesma semente da família). Cada entrada pertence a um
// único passo; o estado inicial é a rodada oficial do mês anterior e o final, a do mês. As barras são contadas em
// trajetórias (números inteiros), então a soma fecha exatamente com a variação total.

import { buildPlan } from '../engine/plan.ts'
import { simulate } from '../engine/simulate.ts'
import type { Cma, Profile, SimInput } from '../engine/types.ts'
import { ReportInputError } from './errors.ts'
import { parseMonth, toCents, type IpcaSeries } from './inflation.ts'
import { buildMonthInputs } from './monthInputs.ts'
import { mainInput, OFFICIAL_PATHS, type MonthPackage, type OfficialRun } from './officialRun.ts'
import { monthReturn } from './performance.ts'
import type { ExternalFlow, HouseholdRecord, PlanVersion } from './types.ts'

export type BridgeStepId =
  | 'atualizacao_do_metodo'
  | 'passagem_do_tempo'
  | 'mercado'
  | 'aportes_e_resgates'
  | 'carteira'
  | 'plano'
  | 'premissas'

export const BRIDGE_LABELS: Record<BridgeStepId, string> = {
  atualizacao_do_metodo: 'Atualização do método',
  passagem_do_tempo: 'Passagem do tempo',
  mercado: 'Mercado',
  aportes_e_resgates: 'Aportes e resgates fora do plano',
  carteira: 'Carteira',
  plano: 'Plano',
  premissas: 'Premissas',
}

/** Abaixo disso (0,05 p.p., em décimos de ponto percentual), a barra aparece como "sem efeito". */
const NO_EFFECT_TENTHS = 0.5

/** Um estado da ponte: uma rodada completa do motor. */
export interface BridgeState {
  inputsHash: string
  successCount: number
  /** Benchmark pessoal r*; null em "folga total" ou "plano inviável". */
  requiredReturn: number | null
  /** Patrimônio simulado na data de referência do estado. */
  wealth: number
}

export interface BridgeStep extends BridgeState {
  id: BridgeStepId
  label: string
  /** Variação da chance no passo, em trajetórias. */
  successDelta: number
  /** Variação do r* no passo; null se algum dos dois estados não tem r*. */
  requiredReturnDelta: number | null
}

export interface BridgeBar {
  id: BridgeStepId
  label: string
  /** Barra em décimos de ponto percentual, já com o resíduo de arredondamento (−9 = −0,9 p.p.). */
  tenths: number
  /** Efeito menor que 0,05 p.p. */
  noEffect: boolean
}

export interface Bridge {
  kind: 'ponte'
  paths: number
  fromMonth: string
  toMonth: string
  /** Número publicado no mês anterior (início da ponte). */
  published: { successCount: number; requiredReturn: number | null; inputsHash: string; engineVersion: string }
  /** A rodada do mês anterior refeita com o motor atual. */
  start: BridgeState
  steps: BridgeStep[]
  /** Variação total da chance, em trajetórias: do número publicado até a rodada do mês. */
  totalSuccessDelta: number
  /** Variação total do r*; null se algum dos extremos não tem r*. */
  totalRequiredReturnDelta: number | null
  /** Página 3: extremos e barras em décimos de p.p.; a soma das barras fecha com a diferença dos extremos. */
  display: { startTenths: number; endTenths: number; bars: BridgeBar[] }
  /** Fluxo líquido que o plano previa para o mês, em reais da data de referência (entra no passo 1). */
  plannedFlow: number
  /** Rentabilidade nominal do mês (Dietz), usada no passo 2. */
  monthNominalReturn: number
  /** Aportes e resgates do mês, para a frase. */
  externalFlows: ExternalFlow[]
}

export type MonthAttribution = { kind: 'primeiro_mes' } | Bridge

export interface AttributionArgs {
  /** Mês anterior: o que definiu a rodada e o número publicado. null no primeiro mês da família. */
  previous: { pkg: MonthPackage; published: OfficialRun } | null
  current: MonthPackage
  ipca: IpcaSeries
  paths?: number
}

const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0)

/** Arredonda para o inteiro mais próximo, com meio para longe do zero (simétrico para barras negativas). */
const roundHalfAway = (x: number) => Math.sign(x) * Math.round(Math.abs(x))

/** Mesmas classes, valores na mesma proporção, somando `total` (em centavos). */
function scaledPositions(prev: Record<string, number>, total: number): Record<string, number> {
  const v0 = sum(prev)
  if (!(v0 > 0)) throw new ReportInputError('ponte_sem_patrimonio', 'A ponte precisa de patrimônio no fechamento do mês anterior.')
  if (total < 0) throw new ReportInputError('ponte_patrimonio_negativo', 'Na ponte, o patrimônio do passo ficaria negativo.')
  return Object.fromEntries(Object.entries(prev).map(([code, v]) => [code, toCents((v * total) / v0)]))
}

/** Cadastro de um estado: identificação de um mês, carteira (perfil, pesos, taxa) de outro e horizonte do plano de outro. */
function stateRecord(identity: HouseholdRecord, portfolio: HouseholdRecord, plan: HouseholdRecord): HouseholdRecord {
  return {
    id: identity.id,
    name: identity.name,
    channel: identity.channel,
    ...(identity.bankerId === undefined ? {} : { bankerId: identity.bankerId }),
    profileId: portfolio.profileId,
    weightsSource: portfolio.weightsSource,
    ...(portfolio.suitability === undefined ? {} : { suitability: portfolio.suitability }),
    feeRate: portfolio.feeRate,
    horizonAge: plan.horizonAge,
    seed: identity.seed,
  }
}

/**
 * Página 3: extremos e barras em décimos de p.p. O resíduo de arredondamento vai para a maior barra, para a soma fechar
 * com a diferença dos extremos. "Sem efeito" só quando a barra é menor que 0,05 p.p. e fica em zero (se o resíduo cair
 * numa barra pequena, ela aparece com o valor).
 */
export function bridgeDisplay(
  startCount: number,
  steps: Pick<BridgeStep, 'id' | 'label' | 'successDelta'>[],
  endCount: number,
  paths: number,
): Bridge['display'] {
  const tenths = (trajectories: number) => (trajectories * 1000) / paths
  const startTenths = roundHalfAway(tenths(startCount))
  const endTenths = roundHalfAway(tenths(endCount))
  const raw = steps.map((s) => tenths(s.successDelta))
  const rounded = raw.map(roundHalfAway)
  let largest = 0
  for (let i = 1; i < raw.length; i++) if (Math.abs(raw[i]) > Math.abs(raw[largest])) largest = i
  if (rounded.length > 0) rounded[largest] += endTenths - startTenths - rounded.reduce((a, b) => a + b, 0)
  return {
    startTenths,
    endTenths,
    bars: steps.map((s, i) => ({ id: s.id, label: s.label, tenths: rounded[i], noEffect: Math.abs(raw[i]) < NO_EFFECT_TENTHS && rounded[i] === 0 })),
  }
}

/** As simulações da ponte, montadas sem rodar o motor: o estado inicial e os seis passos, na ordem do SPEC. */
export interface BridgePlan {
  kind: 'plano_da_ponte'
  paths: number
  seed: number
  fromMonth: string
  toMonth: string
  published: Bridge['published']
  startInput: SimInput
  /** Os seis passos; o último ("premissas") tem as mesmas entradas da rodada oficial do mês. */
  steps: { id: BridgeStepId; input: SimInput }[]
  plannedFlow: number
  monthNominalReturn: number
  externalFlows: ExternalFlow[]
}

export function bridgePlan(args: AttributionArgs): BridgePlan | { kind: 'primeiro_mes' } {
  const { previous, current: cur, ipca } = args
  if (previous === null) return { kind: 'primeiro_mes' }
  const { pkg: prev, published } = previous
  const paths = args.paths ?? OFFICIAL_PATHS
  const fromMonth = prev.closing.refDate.slice(0, 7)
  const toMonth = cur.closing.refDate.slice(0, 7)
  if (prev.household.id !== cur.household.id) throw new ReportInputError('ponte_familias', 'A ponte compara dois meses da mesma família.')
  if (prev.household.seed !== cur.household.seed) {
    throw new ReportInputError('ponte_semente', 'A semente da família mudou entre os meses: a ponte precisa dos mesmos sorteios.')
  }
  if (parseMonth(toMonth, 'mês da ponte') !== parseMonth(fromMonth, 'mês anterior da ponte') + 1) {
    throw new ReportInputError('ponte_meses', `A ponte compara meses seguidos; recebeu ${fromMonth} e ${toMonth}.`)
  }
  if (published.paths !== paths) {
    throw new ReportInputError('ponte_trajetorias', `O número publicado usou ${published.paths} trajetórias, e a ponte, ${paths}.`)
  }

  const state = (o: {
    record: HouseholdRecord
    planVersion: PlanVersion
    refDate: string
    positions: Record<string, number>
    cma: Cma
    profiles: Profile[]
    weights?: Record<string, number>
  }): SimInput =>
    mainInput(
      buildMonthInputs({
        household: o.record,
        planVersion: o.planVersion,
        closing: { refDate: o.refDate, positionsByClass: o.positions, officialPl: sum(o.positions), flows: [] },
        ipca,
        cma: o.cma,
        profiles: o.profiles,
        ...(o.weights === undefined ? {} : { weights: o.weights }),
      }).input,
    )

  // Estado inicial: as entradas da rodada oficial do mês anterior, montadas pelo mesmo caminho.
  const s0 = state({
    record: prev.household,
    planVersion: prev.planVersion,
    refDate: prev.closing.refDate,
    positions: prev.closing.positionsByClass,
    cma: prev.cma,
    profiles: prev.profiles,
  })
  const s0Plan = buildPlan(s0)
  const ipcaMonth = ipca[toMonth]
  if (ipcaMonth === undefined) throw new ReportInputError('ipca_ausente', `Falta o IPCA de ${toMonth} para a ponte.`)
  // O fluxo que o plano previa para o mês: o do primeiro mês simulado na rodada anterior, em reais do mês.
  const plannedFlow = toCents(s0Plan.firstMonthFlow * (1 + ipcaMonth))
  const v0 = sum(prev.closing.positionsByClass)
  const market = monthReturn({ refDate: cur.closing.refDate, startValue: prev.closing.officialPl, endValue: cur.closing.officialPl, flows: cur.closing.flows, ipca })
  // Pesos explícitos do mês anterior (clientes AI), mantidos até o passo "Carteira".
  const heldWeights = s0.household.household.weights

  const before = { record: stateRecord(cur.household, prev.household, prev.household), planVersion: prev.planVersion, refDate: cur.closing.refDate, cma: prev.cma, profiles: prev.profiles }
  const held = heldWeights === undefined ? {} : { weights: heldWeights }
  const steps: { id: BridgeStepId; input: SimInput }[] = [
    // 1. Nova data de referência; patrimônio e plano corrigidos pelo IPCA do mês; o fluxo previsto entra no patrimônio.
    { id: 'passagem_do_tempo', input: state({ ...before, ...held, positions: scaledPositions(prev.closing.positionsByClass, v0 * (1 + ipcaMonth) + plannedFlow) }) },
    // 2. Igual ao passo 1, com a rentabilidade nominal do mês no lugar do IPCA.
    { id: 'mercado', input: state({ ...before, ...held, positions: scaledPositions(prev.closing.positionsByClass, v0 * (1 + market.nominal) + plannedFlow) }) },
    // 3. Patrimônio do fechamento.
    { id: 'aportes_e_resgates', input: state({ ...before, ...held, positions: cur.closing.positionsByClass }) },
    // 4. Pesos por classe e custo do mês.
    { id: 'carteira', input: state({ ...before, record: stateRecord(cur.household, cur.household, prev.household), positions: cur.closing.positionsByClass }) },
    // 5. Versão do plano, horizonte, legado, regras e bens declarados do mês.
    { id: 'plano', input: state({ ...before, record: cur.household, planVersion: cur.planVersion, positions: cur.closing.positionsByClass }) },
    // 6. Premissas vigentes no fechamento: é a rodada oficial do mês.
    { id: 'premissas', input: state({ record: cur.household, planVersion: cur.planVersion, refDate: cur.closing.refDate, positions: cur.closing.positionsByClass, cma: cur.cma, profiles: cur.profiles }) },
  ]
  return {
    kind: 'plano_da_ponte',
    paths,
    seed: cur.household.seed,
    fromMonth,
    toMonth,
    published: { successCount: published.successCount, requiredReturn: published.requiredReturn, inputsHash: published.inputsHash, engineVersion: published.engineVersion },
    startInput: s0,
    steps,
    plannedFlow,
    monthNominalReturn: market.nominal,
    externalFlows: cur.closing.flows,
  }
}

/** Um estado da ponte: a simulação das entradas, com a semente da família. */
export function runBridgeState(input: SimInput, paths: number, seed: number): BridgeState {
  const res = simulate(input, { paths, seed })
  return {
    inputsHash: res.inputsHash,
    successCount: Math.round(res.successProbability * paths),
    requiredReturn: res.requiredReturn.rate,
    wealth: buildPlan(input).W0,
  }
}

/** Monta a ponte a partir dos estados já simulados (o inicial e os seis passos, na ordem de `plan.steps`). */
export function assembleBridge(plan: BridgePlan, start: BridgeState, states: BridgeState[]): Bridge {
  if (states.length !== plan.steps.length) throw new ReportInputError('ponte_estados', 'Faltam estados para montar a ponte.')
  const { published, paths } = plan
  const steps: BridgeStep[] = []
  const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : b - a)
  if (start.successCount !== published.successCount || start.requiredReturn !== published.requiredReturn) {
    // A ponte parte do número publicado: se o motor atual refaz outro valor, a primeira barra é a atualização do método.
    steps.push({
      ...start,
      id: 'atualizacao_do_metodo',
      label: BRIDGE_LABELS.atualizacao_do_metodo,
      successDelta: start.successCount - published.successCount,
      requiredReturnDelta: delta(published.requiredReturn, start.requiredReturn),
    })
  }
  let last = start
  plan.steps.forEach(({ id }, i) => {
    const s = states[i]
    steps.push({ ...s, id, label: BRIDGE_LABELS[id], successDelta: s.successCount - last.successCount, requiredReturnDelta: delta(last.requiredReturn, s.requiredReturn) })
    last = s
  })

  return {
    kind: 'ponte',
    paths,
    fromMonth: plan.fromMonth,
    toMonth: plan.toMonth,
    published,
    start,
    steps,
    totalSuccessDelta: last.successCount - published.successCount,
    totalRequiredReturnDelta: delta(published.requiredReturn, last.requiredReturn),
    display: bridgeDisplay(published.successCount, steps, last.successCount, paths),
    plannedFlow: plan.plannedFlow,
    monthNominalReturn: plan.monthNominalReturn,
    externalFlows: plan.externalFlows,
  }
}

export function monthAttribution(args: AttributionArgs): MonthAttribution {
  const plan = bridgePlan(args)
  if (plan.kind === 'primeiro_mes') return plan
  const start = runBridgeState(plan.startInput, plan.paths, plan.seed)
  return assembleBridge(plan, start, plan.steps.map((s) => runBridgeState(s.input, plan.paths, plan.seed)))
}
