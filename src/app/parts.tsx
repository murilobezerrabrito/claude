// Peças comuns das telas do app: seção em cartão, selo da faixa da chance (cor sempre com texto), termo com explicação
// ao tocar (SPEC, "Linguagem") e o rodapé com a data das posições, a versão das premissas e o aviso legal curto.

import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { ProbabilityBand } from '../engine/metrics.ts'
import { formatDate } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'
import { BAND_LABELS } from '../report/texts.ts'
import { useClientView } from './data.ts'

export function Section(props: { title?: string; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={cn('mb-4 rounded-xl border bg-card p-4 text-card-foreground', props.className)} data-testid={props.testId}>
      {props.title ? <h2 className="mb-2 font-serif text-lg font-semibold">{props.title}</h2> : null}
      {props.children}
    </section>
  )
}

const BAND_CLASS: Record<ProbabilityBand, string> = {
  folga_grande: 'bg-band-blue-soft text-band-blue',
  no_caminho: 'bg-band-green-soft text-band-green',
  atencao: 'bg-band-yellow-soft text-band-yellow',
  em_risco: 'bg-band-red-soft text-band-red',
}

export function BandBadge({ band }: { band: ProbabilityBand }) {
  return <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', BAND_CLASS[band])}>{BAND_LABELS[band]}</span>
}

/** Termo técnico com a explicação ao tocar (dentro de um parágrafo: só elementos de texto). */
export function Term(props: { children: ReactNode; explain: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-left underline decoration-dotted underline-offset-4">
        {props.children}
      </button>
      {open ? <span className="mt-1 block rounded-md bg-muted px-3 py-2 text-sm font-normal text-muted-foreground">{props.explain}</span> : null}
    </span>
  )
}

export function ScreenTitle(props: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-3">
      <h1 className="font-serif text-2xl font-semibold">{props.title}</h1>
      {props.children ? <p className="mt-1 text-sm text-muted-foreground">{props.children}</p> : null}
    </div>
  )
}

/** Rodapé das telas com números: data das posições, versão das premissas e o aviso legal curto do app. */
export function Footer() {
  const view = useClientView()
  const s = view.snapshot
  return (
    <footer className="mt-6 border-t pt-3 text-xs text-muted-foreground">
      <p>
        Posições de {formatDate(s.refDate)} · premissas {s.run.cmaVersion}
      </p>
      <p className="mt-1">
        {view.legal.rodape_app.body}{' '}
        <Link to="/como-calculamos" className="underline underline-offset-2">
          Aviso completo
        </Link>
      </p>
    </footer>
  )
}
