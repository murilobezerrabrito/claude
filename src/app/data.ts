// Os números do mês que as telas do app leem. Na etapa 3a, o exemplo da Família Andrade (dados fictícios); na 3b, o
// mês fechado da família de quem entrou, vindo do banco.

import { createContext, useContext } from 'react'
import type { ClientMonthView } from './types.ts'

export const ClientViewContext = createContext<ClientMonthView | null>(null)

export function useClientView(): ClientMonthView {
  const view = useContext(ClientViewContext)
  if (!view) throw new Error('useClientView fora do app.')
  return view
}

/** O exemplo da Família Andrade, carregado sob demanda (fica fora do pacote principal). */
export async function loadExampleView(): Promise<ClientMonthView> {
  const mod = await import('../data/app/andrade-2026-10.json')
  return mod.default as unknown as ClientMonthView
}
