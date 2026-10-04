// Dados de teste: Família Andrade, premissas do SPEC e famílias sintéticas para casos controlados.

import referenceData from '../../../reference/resultados_referencia.json'
import andradeData from '../../data/andrade.json'
import cmaData from '../../data/premissas-ilustrativas-2026-10.json'
import type { CashFlow, Cma, HouseholdData, Profile, SimInput } from '../types.ts'

export const cma = cmaData as unknown as Cma & { profiles: Profile[] }
export const profiles: Profile[] = cma.profiles
export const andrade = andradeData as unknown as HouseholdData

export function andradeInput(scenario: SimInput['scenario'] = {}): SimInput {
  return { household: structuredClone(andrade), cma, profiles, scenario }
}

/** Premissas com o mesmo retorno real e a mesma volatilidade em todas as classes. */
export function flatCma(mu: number, vol: number): Cma {
  return { ...cma, version: `teste-${mu}-${vol}`, classes: cma.classes.map((c) => ({ ...c, mu, vol })) }
}

/**
 * Família sintética de uma pessoa, já aposentada, com `years` passos de 12 meses, patrimônio W0 e fluxos anuais
 * constantes. A data de referência é 31/12/2026 e a pessoa faz aniversário em dezembro, então o passo t é exatamente
 * o ano civil 2027 + t e o último termina em dez/(2026 + years): os fluxos de cada ano caem inteiros no seu passo.
 */
export function syntheticInput(opts: {
  W0: number
  years: number
  deficit?: number
  income?: number
  lifestyle?: number
  cma?: Cma
  fee?: number
  legacy?: number
  rulesEnabled?: boolean
}): SimInput {
  const startYear = 2027
  const endYear = 2026 + opts.years
  const cashFlows: CashFlow[] = []
  if (opts.deficit) cashFlows.push({ kind: 'gasto_essencial', name: 'Gasto', annualAmountReal: opts.deficit, startYear, endYear })
  if (opts.income) cashFlows.push({ kind: 'renda', name: 'Renda', annualAmountReal: opts.income, startYear, endYear })
  if (opts.lifestyle) cashFlows.push({ kind: 'gasto_estilo', name: 'Estilo', annualAmountReal: opts.lifestyle, startYear, endYear })
  const household: HouseholdData = {
    household: {
      id: 'sintetica',
      name: 'Família sintética',
      referenceDate: '2026-12-31',
      profileId: 'moderado',
      feeRate: opts.fee ?? 0,
      horizonAge: 95,
      legacyMin: opts.legacy ?? 0,
    },
    people: [{ id: 'p', name: 'Pessoa', birthDate: `${2026 + opts.years - 95}-12-15`, sex: 'F', role: 'titular' }],
    cadmPositionsByClass: { POS: opts.W0 },
    otherAssets: [],
    cashFlows,
    events: [],
    goals: [],
    rules: { ...andrade.rules, enabled: opts.rulesEnabled ?? false },
  }
  return { household, cma: opts.cma ?? cma, profiles }
}

export const OPT = { paths: 5000, seed: 20261002 }

/** Valor de uma métrica de reference/resultados_referencia.json (motor de referência em Python). */
export function refValue(id: string): number {
  const m = referenceData.metricas.find((x) => x.id === id)
  if (!m) throw new Error(`Métrica de referência desconhecida: ${id}`)
  return m.valor
}
