// npm run app:example: grava src/data/app/andrade-2026-10.json, o mês de out/2026 da Família Andrade como cliente AI
// (pesos da carteira atual, custo de 0,80% ao ano "a validar"), para as telas do app na etapa 3a. Os números saem do
// mesmo caminho do relatório (src/report), com a rodada oficial de cada mês.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ClientHistoryMonth, ClientMonthView } from '../src/app/types.ts'
import { planVersionFor } from '../src/report/monthInputs.ts'
import { officialRun, type MonthPackage } from '../src/report/officialRun.ts'
import { monthReturn } from '../src/report/performance.ts'
import { buildReportSnapshot } from '../src/report/snapshot.ts'
import { APP_FOOTER, FULL_DISCLAIMER } from '../src/report/texts.ts'
import { andradeReportArgs } from './reportExample.ts'

export const APP_EXAMPLE_PATH = 'src/data/app/andrade-2026-10.json'

export function andradeAppView(): ClientMonthView {
  const args = andradeReportArgs()
  const data = { ...args.data, household: { ...args.data.household, channel: 'ai' as const, weightsSource: 'carteira_atual' as const } }
  const snapshot = buildReportSnapshot({ ...args, data, scenarios: [], comment: { text: '', example: false }, manager: '' })
  const pkgs: MonthPackage[] = data.closings.map((closing) => {
    const month = closing.refDate.slice(0, 7)
    return { household: data.household, planVersion: planVersionFor(data.planVersions, month), closing, ...args.cmaFor(month) }
  })
  const runs = pkgs.map((p) => officialRun(p, data.ipca))
  const history: ClientHistoryMonth[] = runs.map((r, i) => {
    const cur = pkgs[i].closing
    const prev = i > 0 ? pkgs[i - 1] : null
    const events: string[] = []
    if (prev && prev.planVersion.id !== pkgs[i].planVersion.id) events.push('Mudança no plano')
    if (prev && prev.cma.version !== pkgs[i].cma.version) events.push('Premissas novas')
    return {
      month: r.refMonth,
      probability: r.probability,
      requiredReturn: r.requiredReturn,
      requiredReturnStatus: r.requiredReturnStatus,
      realReturn: prev ? monthReturn({ refDate: cur.refDate, startValue: prev.closing.officialPl, endValue: cur.officialPl, flows: cur.flows, ipca: data.ipca }).real : null,
      events,
    }
  })
  return {
    schema: 1,
    example: true,
    snapshot,
    pkg: pkgs[pkgs.length - 1],
    ipca: data.ipca,
    history,
    intermediary: 'Corretora do exemplo (fictícia)',
    legal: { rodape_app: { version: 1, body: APP_FOOTER }, aviso_completo: { version: 1, body: FULL_DISCLAIMER } },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const view = andradeAppView()
  const file = fileURLToPath(new URL(`../${APP_EXAMPLE_PATH}`, import.meta.url))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(view, null, 2)}\n`)
  const s = view.snapshot.summary
  console.log(`Gravado ${APP_EXAMPLE_PATH}: chance ${(s.probability * 100).toFixed(2)}%, retorno que o plano precisa ${s.requiredReturn}, ${view.history.length} meses.`)
}
