// Aviso do console para o comitê e a gestão (SPEC, "Dados de mercado"): série do Banco Central atrasada. Confere a
// situação a cada troca de página; o atraso é calculado aqui, então o aviso aparece mesmo se o agendamento parar.

import { TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import type { MarketStatusRow } from '../lib/apiTypes.ts'
import { brazilToday } from '../market/index.ts'
import { rpc } from './api.ts'
import { staleSeries } from './market.ts'

export function MarketAlert() {
  const { pathname } = useLocation()
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    rpc<MarketStatusRow[]>('market_status')
      .then((rows) => !cancelled && setMessages(staleSeries(rows, brazilToday()).map((v) => v.lag.message)))
      // Sem a situação (sessão ou rede), sem aviso: a página das séries mostra o erro.
      .catch(() => !cancelled && setMessages([]))
    return () => {
      cancelled = true
    }
  }, [pathname])

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
