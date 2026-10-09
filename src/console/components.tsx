import { CircleAlert, OctagonX } from 'lucide-react'
import type { CheckItem, MonthStatus } from '../lib/apiTypes.ts'
import { STATUS_LABELS, STATUS_TONES } from './display.ts'
import { Badge } from './ui/badge.tsx'

export function StatusBadge({ status }: { status: MonthStatus | 'pendente' }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
}

/** Bloqueios primeiro, depois avisos; cor sempre com ícone e texto. */
export function CheckItems({ items }: { items: CheckItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Sem bloqueios nem avisos.</p>
  const sorted = [...items].sort((a, b) => (a.level === b.level ? 0 : a.level === 'bloqueio' ? -1 : 1))
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {sorted.map((i) => (
        <li key={i.code} className={`flex gap-2 ${i.level === 'bloqueio' ? 'text-band-red' : 'text-band-yellow'} [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0`}>
          {i.level === 'bloqueio' ? <OctagonX aria-label="Bloqueio" /> : <CircleAlert aria-label="Aviso" />}
          <span className="text-foreground">{i.message}</span>
        </li>
      ))}
    </ul>
  )
}
