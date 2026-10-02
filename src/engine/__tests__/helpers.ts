// Dados de teste: Família Andrade, premissas do SPEC e famílias sintéticas para casos controlados.

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
 * Família sintética de uma pessoa, já aposentada, com `years` anos de horizonte a partir de 2026,
 * patrimônio W0 e fluxos anuais constantes.
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
  const endYear = 2026 + opts.years - 1
  const cashFlows: CashFlow[] = []
  if (opts.deficit) cashFlows.push({ kind: 'gasto_essencial', name: 'Gasto', annualAmountReal: opts.deficit, startYear: 2026, endYear })
  if (opts.income) cashFlows.push({ kind: 'renda', name: 'Renda', annualAmountReal: opts.income, startYear: 2026, endYear })
  if (opts.lifestyle) cashFlows.push({ kind: 'gasto_estilo', name: 'Estilo', annualAmountReal: opts.lifestyle, startYear: 2026, endYear })
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
    people: [{ id: 'p', name: 'Pessoa', birthDate: `${2026 - (95 - opts.years)}-01-01`, sex: 'F', role: 'titular' }],
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
