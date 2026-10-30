// Aviso do console para o comitê e a gestão (SPEC, "Dados de mercado"): série do Banco Central atrasada. Lê a situação
// das séries da moldura (marketStatus.ts), conferida a cada troca de página e depois de cada busca; o atraso é
// calculado aqui, então o aviso aparece mesmo se o agendamento parar.

import { TriangleAlert } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { brazilToday } from '../market/index.ts'
import { staleSeries } from './market.ts'
import { useMarketStatus } from './marketStatus.ts'

export function MarketAlert() {
  const { pathname } = useLocation()
  const { rows } = useMarketStatus()
  // Antes da primeira resposta, sem aviso; se uma consulta falha, fica o que a anterior mostrou (a página mostra o erro).
  const messages = rows ? staleSeries(rows, brazilToday()).map((v) => v.lag.message) : []

  if (messages.length === 0) return null
  return (
    <div role="status" className="mb-6 flex gap-3 rounded-md border border-band-yellow/40 bg-band-yellow-soft px-4 py-3 text-sm text-band-yellow">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Séries do Banco Central com atraso</p>
        <ul className="mt-1 text-foreground">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        {pathname !== '/mercado' ? (
          <Link to="/mercado" className="mt-1 inline-block underline">
            Ver as séries
          </Link>
        ) : null}
      </div>
    </div>
  )
}
