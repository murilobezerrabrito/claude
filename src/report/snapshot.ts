// Números congelados do relatório de um mês (SPEC, "Conteúdo do relatório"): tudo o que as sete páginas mostram. A
// montagem (assembleReportSnapshot) não simula: parte das rodadas oficiais publicadas de cada mês, como estão gravadas
// no banco. No relatório de exemplo da Fase 1, buildReportSnapshot calcula as rodadas e usa a mesma montagem. O PDF só
// lê este objeto; nada é recalculado na página.

import { probabilityBand, type ProbabilityBand } from '../engine/metrics.ts'
import { buildPlan, DEFAULT_EVENT_MONTH } from '../engine/plan.ts'
import type { Cma, Percentiles, Person, PlanEvent, Profile, RequiredReturnStatus, Scenario } from '../engine/types.ts'
import { monthAttribution, type MonthAttribution } from './attribution.ts'
import { ReportInputError } from './errors.ts'
import { ipcaFactor, parseMonth, type IpcaSeries } from './inflation.ts'
import { buildMonthInputs, planVersionFor } from './monthInputs.ts'
import { officialRun, OFFICIAL_PATHS, type MonthPackage, type OfficialRun } from './officialRun.ts'
import {
  cdiMonthReal,
  monthReturn,
  performanceSummary,
  type CdiSeries,
  type MonthReturn,
  type PerformanceMonth,
  type PerformanceSummary,
} from './performance.ts'
import { runScenario, scenarioContext, type ScenarioContext } from './scenarios.ts'
import {
  benchmarkSentence,
  bridgeSentence,
  medianSentence,
  readingSentence,
  REPORT_LEGAL_KEYS,
  reportFooter,
  slackSentence,
  SPEC_LEGAL_TEXTS,
  type ReportLegalKey,
  type ReportLegalTexts,
} from './texts.ts'
import type { HouseholdMonths } from './types.ts'

/** Versão do formato do snapshot: a 2 traz o CDI na rentabilidade, as versões dos textos legais e o contexto dos cenários. */
export const SNAPSHOT_SCHEMA = 2

/** Ordem das classes nas páginas do relatório: a da tabela de premissas do SPEC. Uma classe fora dela vai para o fim. */
export const CLASS_DISPLAY_ORDER: readonly string[] = ['POS', 'INF', 'PRE', 'CRED', 'MM', 'ACOES', 'FII', 'INTL']

/** Classes na ordem do relatório; as premissas gravadas no banco vêm em ordem de código, a mesma do motor. */
export function inDisplayOrder<T extends { code: string }>(classes: readonly T[]): T[] {
  const rank = (code: string) => {
    const i = CLASS_DISPLAY_ORDER.indexOf(code)
    return i === -1 ? CLASS_DISPLAY_ORDER.length : i
  }
  return [...classes].sort((a, b) => rank(a.code) - rank(b.code) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

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
  /** O que o plano tem no mês, para os controles dos cenários (o console monta o formulário com isto). */
  scenarioContext: ScenarioContext
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
    /** Versão de cada texto legal usado (`legal_texts`). */
    legal: Record<ReportLegalKey, number>
  }
}

/** Um mês acompanhado: o pacote do mês e a rodada oficial publicada (congelada). */
export interface ReportMonthRun {
  pkg: MonthPackage
  run: OfficialRun
}

/** Tudo o que a montagem do relatório usa; nada aqui é simulado de novo. */
export interface ReportAssembly {
  /** Meses acompanhados, em sequência, do primeiro até o mês do relatório (o último). */
  months: ReportMonthRun[]
  /** Ponte do mês do relatório, como gravada com a rodada (primeiro mês: sem ponte). */
  bridge: MonthAttribution
  ipca: IpcaSeries
  /** CDI diário do Banco Central; sem a série, a referência secundária fica de fora. */
  cdi: CdiSeries | null
  scenarios: ScenarioResult[]
  comment: { text: string; example: boolean }
  /** Gestor responsável, na capa. */
  manager: string
  /** Textos legais na versão usada (no banco, a aprovada pela compliance). */
  legalTexts: ReportLegalTexts
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

/** Relatório de exemplo (Fase 1): calcula as rodadas e a ponte e monta com assembleReportSnapshot. */
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
  const prevRun = runs.length > 1 ? publishedRuns[runs.length - 2] : null
  const pkg = pkgs[pkgs.length - 1]
  const bridge = monthAttribution({ previous: prevRun ? { pkg: pkgs[pkgs.length - 2], published: prevRun } : null, current: pkg, ipca: data.ipca, paths })
  // Cenários da conversa do mês, com os mesmos sorteios da rodada oficial.
  const scenarios: ScenarioResult[] = args.scenarios.map((s) => {
    const r = runScenario(pkg, data.ipca, s.scenario, paths)
    return { id: s.id, name: s.name, probability: r.probability, requiredReturn: r.requiredReturn, requiredReturnStatus: r.requiredReturnStatus }
  })
  return assembleReportSnapshot({
    months: pkgs.map((p, i) => ({ pkg: p, run: publishedRuns[i] })),
    bridge,
    ipca: data.ipca,
    cdi: null,
    scenarios,
    comment: args.comment,
    manager: args.manager,
    legalTexts: SPEC_LEGAL_TEXTS,
  })
}

/** Confere que os meses estão em sequência e que cada rodada é do seu mês. */
function checkMonths(months: ReportMonthRun[]): void {
  if (months.length === 0) throw new ReportInputError('sem_fechamento', 'O relatório precisa de ao menos um mês acompanhado.')
  months.forEach((m, i) => {
    const month = m.pkg.closing.refDate.slice(0, 7)
    if (m.run.refMonth !== month) throw new ReportInputError('rodada_de_outro_mes', `A rodada de ${m.run.refMonth} está no lugar de ${month}.`)
    if (i > 0 && parseMonth(month, 'mês acompanhado') !== parseMonth(months[i - 1].run.refMonth, 'mês acompanhado') + 1) {
      throw new ReportInputError('historico_com_falha', `Os meses acompanhados não estão em sequência antes de ${month}.`)
    }
  })
}

function checkLegalTexts(texts: ReportLegalTexts): void {
  for (const key of REPORT_LEGAL_KEYS) {
    const t = texts[key] as { version: number; body: string } | undefined
    if (!t || !Number.isInteger(t.version) || t.version < 1 || typeof t.body !== 'string' || t.body.trim() === '') {
      throw new ReportInputError('texto_legal_ausente', `Falta o texto legal "${key}" aprovado.`)
    }
  }
}

/**
 * Monta o relatório do último mês de `months` a partir das rodadas publicadas, sem simular: rentabilidade (cada mês
 * contra o anterior, com o r* publicado nele, e o CDI quando a série cobre o mês), carteira contra o perfil, trajetória
 * realizada e projetada, ponte, cenários e textos.
 */
export function assembleReportSnapshot(a: ReportAssembly): ReportSnapshot {
  checkMonths(a.months)
  checkLegalTexts(a.legalTexts)
  const last = a.months[a.months.length - 1]
  const { pkg, run } = last
  const current = pkg.closing
  const refMonth = run.refMonth
  const household = pkg.household
  const prevRun = a.months.length > 1 ? a.months[a.months.length - 2].run : null
  const bridge = a.bridge
  if ((bridge.kind === 'ponte') !== (prevRun !== null)) {
    throw new ReportInputError('ponte_incoerente', prevRun ? `Falta a ponte de ${refMonth}.` : `Primeiro mês acompanhado (${refMonth}) não tem ponte.`)
  }

  // Rentabilidade: cada mês contra o fechamento anterior, com o r* publicado nele.
  const history: PerformanceMonth[] = []
  let lastReturn: MonthReturn | null = null
  for (let i = 1; i < a.months.length; i++) {
    const prev = a.months[i - 1].pkg.closing
    const cur = a.months[i].pkg.closing
    lastReturn = monthReturn({ refDate: cur.refDate, startValue: prev.officialPl, endValue: cur.officialPl, flows: cur.flows, ipca: a.ipca })
    history.push({
      month: lastReturn.month,
      real: lastReturn.real,
      benchmarkAnnual: a.months[i - 1].run.requiredReturn,
      approximateDates: lastReturn.approximateDates,
      cdiReal: a.cdi ? cdiMonthReal(a.cdi, lastReturn.month, a.ipca) : null,
    })
  }

  // Carteira por classe contra o perfil (CADM); na AI, sem alocação-alvo.
  const month = buildMonthInputs({ ...pkg, ipca: a.ipca })
  const plan = buildPlan(month.input)
  const cma = pkg.cma
  const displayClasses = inDisplayOrder(cma.classes)
  const profile = household.weightsSource === 'perfil' ? pkg.profiles.find((p) => p.id === household.profileId) ?? null : null
  // Alvo do perfil com os pesos que o motor usa hoje: os de depois da aposentadoria, se o titular já se aposentou.
  const targets = profile ? (plan.retiredFrom === 0 && profile.weightsPost ? profile.weightsPost : profile.weightsPre) : null
  const total = Object.values(current.positionsByClass).reduce((a, b) => a + b, 0)
  const classes = displayClasses
    .filter((c) => (current.positionsByClass[c.code] ?? 0) > 0 || (targets?.[c.code] ?? 0) > 0)
    .map((c) => {
      const value = current.positionsByClass[c.code] ?? 0
      return { code: c.code, name: c.name, value, share: value / total, target: targets ? targets[c.code] ?? 0 : null }
    })

  // Trajetória: patrimônio realizado (em reais da data de referência) e o leque projetado, por idade do mais jovem.
  const people = month.input.household.people.filter((p) => p.role === 'titular' || p.role === 'conjuge')
  const youngest = people.reduce((a, b) => (b.birthDate > a.birthDate ? b : a))
  const realized = a.months.map((m) => {
    const mm = m.run.refMonth
    return { month: mm, age: ageAt(youngest.birthDate, Number(mm.slice(0, 4)), Number(mm.slice(5, 7))), wealth: m.run.wealth * ipcaFactor(a.ipca, mm, refMonth) }
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

  const band = probabilityBand(run.probability)
  const previousBand = prevRun ? probabilityBand(prevRun.probability) : null
  const medianFinal = run.percentiles.p50[run.percentiles.p50.length - 1]
  const horizonAge = household.horizonAge
  const legal = a.legalTexts

  return {
    schema: SNAPSHOT_SCHEMA,
    family: { id: household.id, name: household.name, channel: household.channel, manager: a.manager },
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
      feeRate: household.feeRate,
      ipcaMonth: a.ipca[refMonth] ?? null,
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
    scenarios: a.scenarios,
    scenarioContext: scenarioContext(pkg, a.ipca),
    comment: a.comment,
    assumptions: { version: cma.version, label: cma.label ?? null, nu: cma.nu, classes: displayClasses.map((c) => ({ code: c.code, name: c.name, mu: c.mu, vol: c.vol })) },
    texts: {
      reading: readingSentence({ probability: run.probability, horizonAge, depletionAge: run.depletionAge, band, channel: 'relatorio' }),
      median: medianSentence({ horizonAge, medianFinal }),
      slack: slackSentence({ expectedReturn: run.expectedCompositeReturn, requiredReturn: run.requiredReturn, status: run.requiredReturnStatus }),
      bridge: bridge.kind === 'ponte' && previousBand ? bridgeSentence(bridge, { from: previousBand, to: band }) : legal.primeiro_relatorio.body,
      benchmark: bridge.kind === 'ponte' ? benchmarkSentence(bridge, run.requiredReturn) : null,
      bridgeNote: legal.nota_ponte.body,
      footer: reportFooter(refMonth, cma.version, legal.rodape_relatorio.body),
      disclaimer: legal.aviso_completo.body,
      legal: Object.fromEntries(REPORT_LEGAL_KEYS.map((k) => [k, legal[k].version])) as Record<ReportLegalKey, number>,
    },
  }
}
