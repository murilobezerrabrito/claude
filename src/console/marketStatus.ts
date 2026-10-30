// Situação das séries do Banco Central, uma só para o console: o aviso do topo (gestão e comitê) e a página Mercado
// leem a mesma consulta, refeita a cada troca de página e depois de cada busca. Assim, o aviso some assim que a busca
// traz o dado que faltava, e um erro passageiro some na consulta seguinte.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import type { MarketStatusRow } from '../lib/apiTypes.ts'
import { errorText, rpc } from './api.ts'

export interface MarketStatus {
  /** Nulo até a primeira resposta. */
  rows: MarketStatusRow[] | null
  /** Erro da última consulta (as linhas da anterior continuam). */
  failure: string | null
  /** Consulta de novo (depois da busca ou para tentar de novo). */
  refresh: () => void
}

export const MarketStatusContext = createContext<MarketStatus | null>(null)

/**
 * A consulta, para o `MarketStatusContext` da moldura do console. `everywhere`: em todas as páginas (o aviso da gestão
 * e do comitê); sem ele, só na página Mercado.
 */
export function useMarketStatusSource(everywhere: boolean): MarketStatus {
  const { pathname } = useLocation()
  const active = everywhere || pathname === '/mercado'
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<Omit<MarketStatus, 'refresh'>>({ rows: null, failure: null })

  useEffect(() => {
    if (!active) return
    let cancelled = false
    rpc<MarketStatusRow[]>('market_status')
      .then((rows) => !cancelled && setState({ rows, failure: null }))
      .catch((e: unknown) => !cancelled && setState((s) => ({ rows: s.rows, failure: errorText(e) })))
    return () => {
      cancelled = true
    }
  }, [active, pathname, version])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  return useMemo(() => ({ ...state, refresh }), [state, refresh])
}

export function useMarketStatus(): MarketStatus {
  const status = useContext(MarketStatusContext)
  if (!status) throw new Error('useMarketStatus fora da moldura do console.')
  return status
}
