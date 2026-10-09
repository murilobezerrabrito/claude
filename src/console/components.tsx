import { CircleAlert, OctagonX } from 'lucide-react'
import type { CheckItem, MonthStatus } from '../lib/apiTypes.ts'
import { useState } from 'react'
import { recentMonths, STATUS_LABELS, STATUS_TONES } from './display.ts'
import { Badge } from './ui/badge.tsx'
import { Select } from './ui/input.tsx'

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

/** Mês de referência em português (o seletor de mês do navegador segue o idioma do sistema). */
export function MonthSelect({ id, value, onChange }: { id: string; value: string; onChange: (month: string) => void }) {
  const [options] = useState(() => recentMonths())
  const all = options.some((o) => o.value === value) ? options : [{ value, label: value }, ...options]
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-48">
      {all.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  )
}

/** Escolha de arquivo em português (o botão nativo segue o idioma do navegador). */
export function FilePicker(props: { id: string; accept: string; disabled?: boolean; fileName: string | null; onFile: (file: File | null) => void }) {
  return (
    <div className="flex h-9 items-center gap-3 rounded-md border border-input bg-card pr-3 text-sm">
      <input
        id={props.id}
        type="file"
        accept={props.accept}
        disabled={props.disabled}
        className="peer sr-only"
        onChange={(e) => props.onFile(e.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={props.id}
        className="flex h-full cursor-pointer items-center rounded-l-md border-r border-input bg-muted px-3 font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
      >
        Escolher arquivo
      </label>
      <span className={props.fileName ? 'truncate' : 'truncate text-muted-foreground'}>{props.fileName ?? 'Nenhum arquivo escolhido'}</span>
    </div>
  )
}
