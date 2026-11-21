// npm run app:example: grava src/data/app/andrade-2026-10.json, o mês de out/2026 da Família Andrade como cliente AI
// (pesos da carteira atual, custo de 0,80% ao ano "a validar"), para o app em modo de exemplo. As entradas têm o
// formato de `client_month` (o que o banco devolve ao cliente: sem o banker e sem perfis-modelo), com a rodada oficial
// de cada mês, e a visão sai de `buildClientView`, o mesmo caminho do app ligado ao banco.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildClientView } from '../src/app/clientView.ts'
import type { ClientMonthInputs, ClientMonthView } from '../src/app/types.ts'
import { monthAttribution } from '../src/report/attribution.ts'
import { planVersionFor } from '../src/report/monthInputs.ts'
import { officialRun, type MonthPackage } from '../src/report/officialRun.ts'
import { APP_FOOTER, SPEC_LEGAL_TEXTS } from '../src/report/texts.ts'
import { andradeReportArgs } from './reportExample.ts'

export const APP_EXAMPLE_PATH = 'src/data/app/andrade-2026-10.json'

/** As entradas que `client_month` devolveria para a Andrade como cliente AI, com o mês de out/2026 fechado. */
export function andradeClientInputs(): ClientMonthInputs {
  const args = andradeReportArgs()
  // Como o banco entrega ao cliente (app.client_pkg): sem o banker.
  const household = { ...args.data.household, channel: 'ai' as const, weightsSource: 'carteira_atual' as const }
  delete household.bankerId
  const pkgs: MonthPackage[] = args.data.closings
    .filter((c) => c.refDate.slice(0, 7) <= args.refMonth)
    .map((closing) => {
      const month = closing.refDate.slice(0, 7)
      return { household, planVersion: planVersionFor(args.data.planVersions, month), closing, ...args.cmaFor(month), profiles: [] }
    })
  const runs = pkgs.map((p) => officialRun(p, args.data.ipca))
  const n = pkgs.length
  const bridge = monthAttribution({ previous: n > 1 ? { pkg: pkgs[n - 2], published: runs[n - 2] } : null, current: pkgs[n - 1], ipca: args.data.ipca })
  return {
    schema: 1,
    household: { id: household.id, name: household.name, intermediary: 'Corretora do exemplo (fictícia)' },
    ref_date: pkgs[n - 1].closing.refDate,
    months: pkgs.map((pkg, i) => ({ pkg, run: runs[i] })),
    bridge,
    ipca: args.data.ipca,
    cdi: {},
    legal: { ...SPEC_LEGAL_TEXTS, rodape_app: { version: 1, body: APP_FOOTER } },
    scenarios: [],
    requests: [],
  }
}

export function andradeAppView(): ClientMonthView {
  const view = buildClientView(andradeClientInputs(), { example: true })
  if (!view) throw new Error('O exemplo da Andrade precisa de um mês fechado.')
  return view
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const view = andradeAppView()
  const file = fileURLToPath(new URL(`../${APP_EXAMPLE_PATH}`, import.meta.url))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(view, null, 2)}\n`)
  const s = view.snapshot.summary
  console.log(`Gravado ${APP_EXAMPLE_PATH}: chance ${(s.probability * 100).toFixed(2)}%, retorno que o plano precisa ${s.requiredReturn}, ${view.history.length} meses.`)
}
