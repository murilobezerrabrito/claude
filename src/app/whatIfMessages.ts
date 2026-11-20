// Mensagens entre a tela do "E se?" e o Web Worker que roda o motor (o cálculo não trava a tela).

import type { IpcaSeries } from '../report/inflation.ts'
import type { MonthPackage } from '../report/officialRun.ts'
import type { ReportScenarioParams } from '../report/scenarios.ts'
import type { SustainableResult, WhatIfRun } from './whatIf.ts'

export type WhatIfRequest =
  | { id: number; type: 'init'; pkg: MonthPackage; ipca: IpcaSeries }
  | { id: number; type: 'run'; params: ReportScenarioParams }
  | { id: number; type: 'sustainable'; params: ReportScenarioParams }

export type WhatIfResponse = { id: number; ok: true; result: WhatIfRun | SustainableResult | null } | { id: number; ok: false; error: string }
