// API pública do motor de simulação do Gêmeo Financeiro.
// TypeScript puro: sem React, DOM ou dependências; imports relativos terminados em .ts.

export { ENGINE_VERSION } from './version.ts'
export { EngineInputError } from './errors.ts'
export type * from './types.ts'
export { simulate, runPaths, marketFor, summarize, expectedRates, DEFAULT_PATHS, DEFAULT_SEED, MIN_PATHS } from './simulate.ts'
export { buildPlan, fullPlanFlows, isAboveSuitability, PROFILE_ORDER, type Plan } from './plan.ts'
export { requiredReturn, projectWealth, sustains, stepWealth, type RequiredReturn, type RequiredReturnStatus } from './requiredReturn.ts'
export { sustainableSpending, earliestRetirement, type SustainableSpending, type EarliestRetirement, type SolverOptions } from './solvers.ts'
export { cholesky, validateCorrelation, symmetricEigenvalues } from './linalg.ts'
export { classParams, generateMarket, logMgfT, sampleClassReturns, type Market } from './returns.ts'
export { firstYearShockDeltas, shockMatrix, NON_RISK_CLASSES } from './shocks.ts'
export { probabilityBand, DEFAULT_BANDS, DEFAULT_TARGET_PROBABILITY, type ProbabilityBand } from './metrics.ts'
export { hashInputs, canonicalJson } from './hash.ts'
export { Rng } from './rng.ts'
