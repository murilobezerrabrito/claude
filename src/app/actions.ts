// O que o cliente grava pelo app (SPEC, "3. E se?" e "5. Plano"): cenários salvos (pessoais) e sugestões de mudança no
// plano. Com a conta, vai para o banco (D-073); no exemplo da Andrade, fica só na tela.

import { createContext, useContext } from 'react'
import type { ReportScenarioParams } from '../report/scenarios.ts'
import { rpc } from './api.ts'
import type { PlanRequest, SavedScenario } from './types.ts'

export interface ClientActions {
  saveScenario(name: string, params: ReportScenarioParams): Promise<SavedScenario>
  deleteScenario(id: string): Promise<void>
  suggest(text: string): Promise<PlanRequest>
}

export const ClientActionsContext = createContext<ClientActions | null>(null)

export function useClientActions(): ClientActions {
  const actions = useContext(ClientActionsContext)
  if (!actions) throw new Error('useClientActions fora do app.')
  return actions
}

/** Com a conta do cliente: as funções do banco, que conferem a família, o nome e os limites. */
export const serverActions: ClientActions = {
  saveScenario: (name, params) => rpc<SavedScenario>('save_client_scenario', { p_name: name, p_params: params }),
  deleteScenario: (id) => rpc<void>('delete_client_scenario', { p_scenario: id }),
  suggest: (text) => rpc<PlanRequest>('suggest_plan_change', { p_text: text }),
}

/** No exemplo: nada sai do aparelho (o nome repetido é recusado como no banco). */
export function exampleActions(): ClientActions {
  const names = new Map<string, string>()
  return {
    saveScenario: (name, params) => {
      const key = name.trim().toLowerCase()
      if ([...names.values()].includes(key)) return Promise.reject(new Error('Já existe um cenário com este nome.'))
      const id = crypto.randomUUID()
      names.set(id, key)
      return Promise.resolve({ id, name: name.trim(), params, created_at: new Date().toISOString() })
    },
    deleteScenario: (id) => {
      names.delete(id)
      return Promise.resolve()
    },
    suggest: (text) =>
      Promise.resolve({
        id: crypto.randomUUID(),
        text,
        status: 'pendente',
        created_at: new Date().toISOString(),
        reviewed_at: null,
        review_note: null,
      }),
  }
}
