// Relatório de exemplo da Fase 1: Família Andrade, out/2026. Usado por `npm run report:snapshot` e pelo teste que
// confere os números congelados.

import { readFileSync } from 'node:fs'
import type { Cma, Profile, ShockPreset } from '../src/engine/index.ts'
import type { ReportSnapshotArgs } from '../src/report/snapshot.ts'
import type { HouseholdMonths } from '../src/report/types.ts'

const root = new URL('..', import.meta.url)
const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as T

/** Onde fica o snapshot do relatório de exemplo, relativo à raiz do repositório. */
export const EXAMPLE_SNAPSHOT_PATH = 'src/data/relatorios/andrade-2026-10.json'

export function andradeReportArgs(): ReportSnapshotArgs {
  const data = readJson<HouseholdMonths>('src/data/andrade-fechamentos.json')
  const cma = readJson<Cma & { profiles: Profile[] }>('src/data/premissas-ilustrativas-2026-10.json')
  const crise = readJson<{ presets: ShockPreset[] }>('src/data/choques.json').presets.find((p) => p.id === 'crise-2008')
  if (!crise) throw new Error('Cenário "crise-2008" não encontrado em src/data/choques.json.')
  const titular = data.planVersions[data.planVersions.length - 1].snapshot.people.find((p) => p.role === 'titular')
  if (titular?.retirementAge === undefined) throw new Error('O titular da Família Andrade precisa de idade de aposentadoria.')
  return {
    data,
    refMonth: '2026-10',
    cmaFor: () => ({ cma, profiles: cma.profiles }),
    scenarios: [
      { id: 'aposentar-3-anos-antes', name: 'Aposentar 3 anos antes', scenario: { retirementAge: titular.retirementAge - 3 } },
      { id: 'crise-2008', name: 'Crise como a de 2008 no 1º ano', scenario: { shocks: [crise] } },
      { id: 'gastar-10-mais', name: 'Gastar 10% a mais', scenario: { spendingMultiplier: 1.1 } },
    ],
    comment: {
      text: 'Comentário de exemplo. Aqui a gestão resume a conversa do mês: o que mudou na vida da família e no plano, e o que confirmar na próxima reunião.',
      example: true,
    },
    manager: 'a definir',
  }
}
