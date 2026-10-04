// Família Andrade no formato do ciclo mensal: cadastro, plano v1 (mês-base set/2026) e fechamento de setembro.

import andradeData from '../../data/andrade.json'
import cmaData from '../../data/premissas-ilustrativas-2026-10.json'
import type { Cma, HouseholdData, Profile } from '../../engine/types.ts'
import type { HouseholdRecord, MonthClosing, PlanVersion } from '../types.ts'

export const andrade = andradeData as unknown as HouseholdData
export const cma = cmaData as unknown as Cma & { profiles: Profile[] }
export const profiles: Profile[] = cma.profiles

export function andradeRecord(overrides: Partial<HouseholdRecord> = {}): HouseholdRecord {
  const h = andrade.household
  return {
    id: h.id,
    name: h.name,
    channel: 'cadm',
    bankerId: h.bankerId,
    profileId: h.profileId,
    weightsSource: 'perfil',
    suitability: h.suitability,
    feeRate: h.feeRate,
    horizonAge: h.horizonAge,
    legacyMin: h.legacyMin,
    seed: 20261002,
    ...overrides,
  }
}

export function andradePlanV1(): PlanVersion {
  const { people, otherAssets, cashFlows, events, goals, rules } = structuredClone(andrade)
  return { id: 'andrade-v1', baseMonth: '2026-09', snapshot: { people, otherAssets, cashFlows, events, goals, rules } }
}

export function andradeSeptember(): MonthClosing {
  return { refDate: '2026-09-30', positionsByClass: { ...andrade.cadmPositionsByClass }, officialPl: 12_000_000, flows: [] }
}
