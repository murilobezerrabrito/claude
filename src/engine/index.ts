// API pública do motor de simulação do Gêmeo Financeiro.
// TypeScript puro: sem React, DOM ou dependências; imports relativos terminados em .ts.

export { ENGINE_VERSION } from './version.ts'
export { EngineInputError } from './errors.ts'
export type * from './types.ts'
export { simulate, runPaths, marketFor, summarize, expectedRates, DEFAULT_PATHS, DEFAULT_SEED, MIN_PATHS } from './simulate.ts'
export { buildPlan, DEFAULT_EVENT_MONTH, fullPlanFlows, isAboveSuitability, monthIndex, PROFILE_ORDER, type Plan, type WeightsSource } from './plan.ts'
export { requiredReturn, slack, projectWealth, sustains, stepWealth, type RequiredReturn } from './requiredReturn.ts'
export { sustainableSpending, earliestRetirement, type SustainableSpending, type EarliestRetirement, type SolverOptions } from './solvers.ts'
export { cholesky, validateCorrelation, symmetricEigenvalues } from './linalg.ts'
export { classParams, classReturns, drawPath, generateMarket, logMgfT, sampleClassReturns, yearDraws, type ClassParams, type Market } from './returns.ts'
export { firstYearShockDeltas, shockMatrix, NON_RISK_CLASSES } from './shocks.ts'
export { probabilityBand, DEFAULT_BANDS, DEFAULT_TARGET_PROBABILITY, type ProbabilityBand } from './metrics.ts'
export { hashInputs, canonicalJson } from './hash.ts'
export { pathKeys, qStreamMix, Rng, streamMix, textKey } from './rng.ts'
