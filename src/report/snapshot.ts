// Números congelados do relatório de um mês (SPEC, "Conteúdo do relatório"): tudo o que as sete páginas mostram,
// calculado uma vez a partir dos fechamentos da família. O PDF só lê este objeto; nada é recalculado na página.

import { probabilityBand, type ProbabilityBand } from '../engine/metrics.ts'
import { buildPlan, DEFAULT_EVENT_MONTH } from '../engine/plan.ts'
import { simulate } from '../engine/simulate.ts'
import type { Cma, Percentiles, Person, PlanEvent, Profile, RequiredReturnStatus, Scenario } from '../engine/types.ts'
import { monthAttribution, type MonthAttribution } from './attribution.ts'
import { ReportInputError } from './errors.ts'
import { ipcaFactor } from './inflation.ts'
import { buildMonthInputs, planVersionFor } from './monthInputs.ts'
import { mainInput, officialRun, OFFICIAL_PATHS, type MonthPackage, type OfficialRun } from './officialRun.ts'
import { monthReturn, performanceSummary, type MonthReturn, type PerformanceMonth, type PerformanceSummary } from './performance.ts'
import {
  benchmarkSentence,
  BRIDGE_NOTE,
  bridgeSentence,
  FIRST_REPORT_NOTE,
  FULL_DISCLAIMER,
  medianSentence,
  readingSentence,
  reportFooter,
  slackSentence,
} from './texts.ts'
import type { HouseholdMonths } from './types.ts'

/** Versão do formato do snapshot. */
export const SNAPSHOT_SCHEMA = 1

/** Cenário "E se?" escolhido pela gestão para a conversa do mês (página 6). */
export interface ConversationScenario {
  id: string
  name: string
  scenario: Scenario
}

export interface ReportSnapshotArgs {
  data: HouseholdMonths
  refMonth: string
  /** Premissas vigentes em cada mês (no exemplo, as mesmas). */
  cmaFor: (month: string) => { cma: Cma; profiles: Profile[] }
  scenarios: ConversationScenario[]
  /** Comentário da gestão (texto livre, revisado por quem aprova). */
  comment: { text: string; example: boolean }
  /** Gestor responsável, na capa. */
  manager: string
  /**
   * Números publicados nos meses anteriores (rodada oficial congelada de cada mês, AAAA-MM). A ponte parte do número
   * publicado; sem ele (no exemplo da Fase 1, não há relatório anterior), o mês anterior é refeito com o motor atual.
   */
  published?: Record<string, OfficialRun>
  paths?: number
}

export interface ScenarioResult {
  id: string
  name: string
  probability: number
  requiredReturn: number | null
  requiredReturnStatus: RequiredReturnStatus
}

export interface ReportSnapshot {
  schema: number
  family: { id: string; name: string; channel: string; manager: string }
  refMonth: string
  refDate: string
  run: Pick<OfficialRun, 'engineVersion' | 'cmaVersion' | 'planVersionId' | 'seed' | 'paths' | 'inputsHash'>
  /** Versão do plano em vigor no mês e o seu mês-base (última revisão). */
  planVersion: { id: string; baseMonth: string }
  summary: {
    probability: number
    probabilityWithRules: number | null
    band: ProbabilityBand
    previousProbability: number | null
    previousBand: ProbabilityBand | null
    requiredReturn: number | null
    requiredReturnStatus: RequiredReturnStatus
    expectedCompositeReturn: number
    slack: number | null
    wealth: number
    legacy: number
    legacyProbability: number | null
    horizonAge: number
    depletionAge: number | null
    medianFinal: number
    /** Custo anual da carteira (`fee_rate`). */
    feeRate: number
    /** IPCA do mês de referência. */
    ipcaMonth: number | null
  }
  bridge: MonthAttribution
  performance: { month: MonthReturn | null; summary: PerformanceSummary | null }
  portfolio: {
    total: number
    /** Por classe: valor, peso na carteira e peso-alvo do perfil (null nos clientes AI, sem alocação-alvo). */
    classes: { code: string; name: string; value: number; share: number; target: number | null }[]
    profileName: string | null
    otherAssets: { name: string; value: number; inSimulation: boolean }[]
  }
  /** Idades do membro mais jovem do casal, em anos com fração de meses (eixo do gráfico da página 5). */
  trajectory: {
    /** Patrimônio simulado em cada fechamento, em reais da data de referência. */
    realized: { month: string; age: number; wealth: number }[]
    /** Idade em cada ponto projetado: a data de referência e o fim de cada passo. */
    pointAges: number[]
    years: number[]
    percentiles: Percentiles
    markers: { age: number; label: string }[]
  }
  scenarios: ScenarioResult[]
  comment: { text: string; example: boolean }
  /** Premissas vigentes (página 7). */
  assumptions: { version: string; label: string | null; nu: number; classes: { code: string; name: string; mu: number; vol: number }[] }
  texts: {
    reading: string
    median: string
    slack: string
    bridge: string
    benchmark: string | null
    bridgeNote: string
    footer: string
    disclaimer: string
  }
}

/** Idade em anos, com fração de meses, no fim do mês (ano, mês 1 a 12) de quem nasceu em `birthDate` (AAAA-MM-DD). */
const ageAt = (birthDate: string, year: number, month: number) =>
  (year * 12 + month - (Number(birthDate.slice(0, 4)) * 12 + Number(birthDate.slice(5, 7)))) / 12

/**
 * Marcos da página 5, em ordem de idade do mais jovem do casal: a aposentadoria do titular e os eventos únicos, no
 * mês de cada um, só os que caem depois da data de referência e até o fim do horizonte.
 */
export function trajectoryMarkers(o: {
  people: Person[]
  events: PlanEvent[]
  retirementYear: number | null
  fromAge: number
  toAge: number
}): { age: number; label: string }[] {
  const couple = o.people.filter((p) => p.role === 'titular' || p.role === 'conjuge')
  const youngest = couple.reduce((a, b) => (b.birthDate > a.birthDate ? b : a))
  const titular = couple.find((p) => p.role === 'titular') ?? youngest
  const markers: { age: number; label: string }[] = []
  const add = (age: number, label: string) => {
    if (age > o.fromAge && age <= o.toAge) markers.push({ age, label })
  }
  if (o.retirementYear !== null) add(ageAt(youngest.birthDate, o.retirementYear, Number(titular.birthDate.slice(5, 7))), 'Aposentadoria')
  for (const ev of o.events) if (ev.recurrence === 'unica') add(ageAt(youngest.birthDate, ev.year, ev.month ?? DEFAULT_EVENT_MONTH), ev.name)
  return markers.sort((a, b) => a.age - b.age)
}

export function buildReportSnapshot(args: ReportSnapshotArgs): ReportSnapshot {
  const { data, refMonth } = args
  const paths = args.paths ?? OFFICIAL_PATHS
  const closings = data.closings.filter((c) => c.refDate.slice(0, 7) <= refMonth).sort((a, b) => a.refDate.localeCompare(b.refDate))
  const current = closings[closings.length - 1]
  if (!current || current.refDate.slice(0, 7) !== refMonth) throw new ReportInputError('sem_fechamento', `Não há fechamento de ${refMonth}.`)

  const pkgs: MonthPackage[] = closings.map((closing) => {
    const month = closing.refDate.slice(0, 7)
    return { household: data.household, planVersion: planVersionFor(data.planVersions, month), closing, ...args.cmaFor(month) }
  })
  const runs = pkgs.map((p) => officialRun(p, data.ipca, { paths }))
  // O número publicado em cada mês anterior; sem registro, o mês refeito com o motor atual.
  const publishedRuns = runs.map((r, i) => (i < runs.length - 1 ? (args.published?.[r.refMonth] ?? r) : r))
  const run = runs[runs.length - 1]
  const prevRun = runs.length > 1 ? publishedRuns[runs.length - 2] : null
  const pkg = pkgs[pkgs.length - 1]

  // Rentabilidade: cada mês contra o fechamento anterior, com o r* publicado nele.
  const history: PerformanceMonth[] = []
  let lastReturn: MonthReturn | null = null
  for (let i = 1; i < closings.length; i++) {
    lastReturn = monthReturn({ refDate: closings[i].refDate, startValue: closings[i - 1].officialPl, endValue: closings[i].officialPl, flows: closings[i].flows, ipca: data.ipca })
    history.push({ month: lastReturn.month, real: lastReturn.real, benchmarkAnnual: publishedRuns[i - 1].requiredReturn, approximateDates: lastReturn.approximateDates })
  }

  const bridge = monthAttribution({ previous: prevRun ? { pkg: pkgs[pkgs.length - 2], published: prevRun } : null, current: pkg, ipca: data.ipca, paths })

  // Carteira por classe contra o perfil (CADM); na AI, sem alocação-alvo.
  const month = buildMonthInputs({ ...pkg, ipca: data.ipca })
  const plan = buildPlan(month.input)
  const cma = pkg.cma
  const profile = data.household.weightsSource === 'perfil' ? pkg.profiles.find((p) => p.id === data.household.profileId) ?? null : null
  // Alvo do perfil com os pesos que o motor usa hoje: os de depois da aposentadoria, se o titular já se aposentou.
  const targets = profile ? (plan.retiredFrom === 0 && profile.weightsPost ? profile.weightsPost : profile.weightsPre) : null
  const total = Object.values(current.positionsByClass).reduce((a, b) => a + b, 0)
  const classes = cma.classes
    .filter((c) => (current.positionsByClass[c.code] ?? 0) > 0 || (targets?.[c.code] ?? 0) > 0)
    .map((c) => {
      const value = current.positionsByClass[c.code] ?? 0
      return { code: c.code, name: c.name, value, share: value / total, target: targets ? targets[c.code] ?? 0 : null }
    })

  // Trajetória: patrimônio realizado (em reais da data de referência) e o leque projetado, por idade do mais jovem.
  const people = month.input.household.people.filter((p) => p.role === 'titular' || p.role === 'conjuge')
  const youngest = people.reduce((a, b) => (b.birthDate > a.birthDate ? b : a))
  const realized = pkgs.map((p, i) => {
    const m = p.closing.refDate.slice(0, 7)
    return { month: m, age: ageAt(youngest.birthDate, Number(m.slice(0, 4)), Number(m.slice(5, 7))), wealth: runs[i].wealth * ipcaFactor(data.ipca, m, refMonth) }
  })
  const refAge = ageAt(youngest.birthDate, Number(refMonth.slice(0, 4)), Number(refMonth.slice(5, 7)))
  const pointAges = [refAge]
  for (const m of plan.stepMonths) pointAges.push(pointAges[pointAges.length - 1] + m / 12)
  const markers = trajectoryMarkers({
    people,
    events: month.input.household.events,
    retirementYear: plan.retirementYear,
    fromAge: refAge,
    toAge: pointAges[pointAges.length - 1],
  })

  // Cenários da conversa do mês, com os mesmos sorteios da rodada oficial.
  const scenarios: ScenarioResult[] = args.scenarios.map((s) => {
    const m = buildMonthInputs({ ...pkg, ipca: data.ipca, scenario: s.scenario })
    const res = simulate(mainInput(m.input), { paths, seed: m.seed })
    return { id: s.id, name: s.name, probability: res.successProbability, requiredReturn: res.requiredReturn.rate, requiredReturnStatus: res.requiredReturn.status }
  })

  const band = probabilityBand(run.probability)
  const previousBand = prevRun ? probabilityBand(prevRun.probability) : null
  const medianFinal = run.percentiles.p50[run.percentiles.p50.length - 1]
  const horizonAge = data.household.horizonAge

  return {
    schema: SNAPSHOT_SCHEMA,
    family: { id: data.household.id, name: data.household.name, channel: data.household.channel, manager: args.manager },
    refMonth,
    refDate: current.refDate,
    run: { engineVersion: run.engineVersion, cmaVersion: run.cmaVersion, planVersionId: run.planVersionId, seed: run.seed, paths: run.paths, inputsHash: run.inputsHash },
    planVersion: { id: pkg.planVersion.id, baseMonth: pkg.planVersion.baseMonth },
    summary: {
      probability: run.probability,
      probabilityWithRules: run.probabilityWithRules,
      band,
      previousProbability: prevRun ? prevRun.probability : null,
      previousBand,
      requiredReturn: run.requiredReturn,
      requiredReturnStatus: run.requiredReturnStatus,
      expectedCompositeReturn: run.expectedCompositeReturn,
      slack: run.slack,
      wealth: run.wealth,
      legacy: plan.legacy,
      legacyProbability: run.legacyProbability,
      horizonAge,
      depletionAge: run.depletionAge,
      medianFinal,
      feeRate: data.household.feeRate,
      ipcaMonth: data.ipca[refMonth] ?? null,
    },
    bridge,
    performance: { month: lastReturn, summary: history.length > 0 ? performanceSummary(history, refMonth) : null },
    portfolio: {
      total,
      classes,
      profileName: profile ? profile.name : null,
      otherAssets: month.input.household.otherAssets.map((a) => ({ name: a.name, value: a.value, inSimulation: a.inSimulation === true })),
    },
    trajectory: { realized, pointAges, years: run.years, percentiles: run.percentiles, markers },
    scenarios,
    comment: args.comment,
    assumptions: { version: cma.version, label: cma.label ?? null, nu: cma.nu, classes: cma.classes.map((c) => ({ code: c.code, name: c.name, mu: c.mu, vol: c.vol })) },
    texts: {
      reading: readingSentence({ probability: run.probability, horizonAge, depletionAge: run.depletionAge, band, channel: 'relatorio' }),
      median: medianSentence({ horizonAge, medianFinal }),
      slack: slackSentence({ expectedReturn: run.expectedCompositeReturn, requiredReturn: run.requiredReturn, status: run.requiredReturnStatus }),
      bridge: bridge.kind === 'ponte' && previousBand ? bridgeSentence(bridge, { from: previousBand, to: band }) : FIRST_REPORT_NOTE,
      benchmark: bridge.kind === 'ponte' ? benchmarkSentence(bridge, run.requiredReturn) : null,
      bridgeNote: BRIDGE_NOTE,
      footer: reportFooter(refMonth, cma.version),
      disclaimer: FULL_DISCLAIMER,
    },
  }
}
