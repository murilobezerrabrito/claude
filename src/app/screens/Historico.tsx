// Histórico (SPEC, "7. Histórico"): a série mensal da chance e do retorno que o plano precisa, com o rendimento real
// realizado em cada mês e os marcadores (mudança no plano, premissas novas).

import { formatMonthLabel, formatProbability, formatRealReturn, formatSignedPercent } from '../../lib/format.ts'
import { useClientView } from '../data.ts'
import { Footer, ScreenTitle, Section } from '../parts.tsx'

export function Historico() {
  const view = useClientView()
  const months = [...view.history].reverse()
  const max = 1
  return (
    <>
      <ScreenTitle title="Histórico">Um ponto por mês fechado.</ScreenTitle>
      <Section title="Chance de o plano dar certo">
        <div className="flex h-36 items-end gap-2" aria-label="Chance por mês" role="img">
          {view.history.map((h) => (
            <div key={h.month} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-medium">{formatProbability(h.probability)}</span>
              <div className="w-full max-w-10 rounded-t bg-primary" style={{ height: `${Math.max(2, (h.probability / max) * 100)}px` }} />
              <span className="text-xs text-muted-foreground">{formatMonthLabel(h.month)}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Mês a mês">
        <ul className="divide-y text-sm">
          {months.map((h) => (
            <li key={h.month} className="py-2">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{formatMonthLabel(h.month)}</span>
                <span>Chance {formatProbability(h.probability)}</span>
              </div>
              <div className="flex justify-between gap-2 text-muted-foreground">
                <span>Plano precisa {h.requiredReturn !== null ? formatRealReturn(h.requiredReturn) : h.requiredReturnStatus === 'folga_total' ? 'folga total' : '—'}</span>
                <span>{h.realReturn !== null ? `Carteira ${formatSignedPercent(h.realReturn)} real` : 'Primeiro mês'}</span>
              </div>
              {h.events.length > 0 ? <p className="mt-1 text-xs text-band-blue">{h.events.join(' · ')}</p> : null}
            </li>
          ))}
        </ul>
      </Section>
      <Footer />
    </>
  )
}
