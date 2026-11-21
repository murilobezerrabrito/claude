// Os números do mês que as telas do app leem: o mês fechado da família de quem entrou, vindo do banco e montado no
// aparelho, ou o exemplo da Família Andrade (dados fictícios, em /app/exemplo).

import { createContext, useContext } from 'react'
import { ReportInputError } from '../report/errors.ts'
import { rpc } from './api.ts'
import { buildClientView } from './clientView.ts'
import type { ClientMonthInputs, ClientMonthView } from './types.ts'

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

/**
 * O mês da família de quem entrou: `client_month` (só a própria família, só meses fechados) montado no aparelho (null
 * quando ainda não há mês fechado) e o intermediário do cadastro. Erro de montagem (texto legal ainda não aprovado, por exemplo) vira uma mensagem
 * simples (o detalhe técnico fica em `cause`).
 */
export async function loadClientView(): Promise<{ view: ClientMonthView | null; intermediary: string | null }> {
  const inputs = await rpc<ClientMonthInputs>('client_month')
  try {
    return { view: buildClientView(inputs), intermediary: inputs.household.intermediary }
  } catch (e) {
    if (e instanceof ReportInputError) {
      throw new Error('Os números do mês ainda não estão prontos. Tente mais tarde ou fale com o seu assessor.', { cause: e })
    }
    throw e
  }
}
