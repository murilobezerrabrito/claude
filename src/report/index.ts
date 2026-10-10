// Ciclo mensal fora do motor: montagem das entradas do mês e plano corrigido pelo IPCA.
// TypeScript puro, como o motor: sem React, DOM ou dependências; imports relativos terminados em .ts.

export { ReportInputError } from './errors.ts'
export type * from './types.ts'
export { correctPlan, formatMonth, ipcaFactor, parseMonth, toCents, type IpcaSeries } from './inflation.ts'
export { buildMonthInputs, checkClosing, currentWeights, planVersionFor, PL_TOLERANCE, type MonthInputs, type MonthInputsArgs } from './monthInputs.ts'
export {
  monthReturn,
  performanceSummary,
  PLAUSIBLE_REAL_RANGE,
  type MonthReturn,
  type MonthReturnInput,
  type PerformanceMonth,
  type PerformanceSummary,
  type PeriodReturn,
} from './performance.ts'
export {
  assembleOfficialRun,
  mainInput,
  mainRunResult,
  officialRun,
  officialRunPlan,
  OFFICIAL_PATHS,
  runInputsHash,
  type MainRunResult,
  type MonthPackage,
  type OfficialRun,
  type OfficialRunPlan,
} from './officialRun.ts'
export {
  assembleBridge,
  BRIDGE_LABELS,
  bridgeDisplay,
  bridgePlan,
  monthAttribution,
  runBridgeState,
  type AttributionArgs,
  type Bridge,
  type BridgeBar,
  type BridgePlan,
  type BridgeState,
  type BridgeStep,
  type BridgeStepId,
  type MonthAttribution,
} from './attribution.ts'
export { assembleRun, partInput, runPart, runTasks, type AssembledRun, type PartOutcome, type RunInputs, type RunPart, type RunTasks } from './runTasks.ts'
