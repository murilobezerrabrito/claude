// Sugestões do cliente AI na página da família (SPEC, "5. Plano": "O cliente sugere mudanças; elas entram numa fila para
// o responsável confirmar"). O responsável da família e a gestão confirmam ou recusam (recusar pede o motivo, que o
// cliente vê); comitê e compliance só leem. Confirmar não muda o plano: quem confirma edita o plano acima.

import { useEffect, useState } from 'react'
import type { PlanChangeRequestRow, PlanChangeRequests } from '../../lib/apiTypes.ts'
import { errorText, rpc } from '../api.ts'
import { Alert } from '../../ui/alert.tsx'
import { Badge } from '../../ui/badge.tsx'
import { Button } from '../../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card.tsx'
import { Textarea } from '../../ui/input.tsx'

const STATUS: Record<PlanChangeRequestRow['status'], { label: string; tone: 'yellow' | 'green' | 'neutral' }> = {
  pendente: { label: 'Pendente', tone: 'yellow' },
  confirmada: { label: 'Confirmada', tone: 'green' },
  recusada: { label: 'Recusada', tone: 'neutral' },
}

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR')

export function PlanRequests({ household }: { household: string }) {
  const [data, setData] = useState<PlanChangeRequests | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    rpc<PlanChangeRequests>('plan_change_requests_of', { p_household: household })
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [household, version])

  const pending = data?.requests.filter((r) => r.status === 'pendente').length ?? 0
  return (
    <Card data-testid="sugestoes">
      <CardHeader>
        <CardTitle>Sugestões do cliente{pending > 0 ? ` (${pending} pendente${pending > 1 ? 's' : ''})` : ''}</CardTitle>
        <CardDescription>
          O cliente sugere mudanças pelo app. Confirmar não muda o plano: depois de confirmar, edite o plano acima e grave uma versão nova.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {failure ? <Alert tone="error">{failure}</Alert> : null}
        {!data && !failure ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
        {data && data.requests.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma sugestão do cliente.</p> : null}
        {data?.requests.map((r) => (
          <Request key={r.id} request={r} canReview={data.can_review} onDone={() => setVersion((v) => v + 1)} />
        ))}
      </CardContent>
    </Card>
  )
}

function Request({ request: r, canReview, onDone }: { request: PlanChangeRequestRow; canReview: boolean; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const status = STATUS[r.status]

  const answer = async (decision: 'confirmada' | 'recusada') => {
    setBusy(true)
    setFailure(null)
    try {
      await rpc('review_plan_change', { p_request: r.id, p_decision: decision, p_note: note })
      onDone()
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border p-3" data-testid="sugestao">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge tone={status.tone}>{status.label}</Badge>
        <span>
          {r.requested_by ?? 'Cliente'} · {when(r.created_at)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{r.text}</p>
      {r.status !== 'pendente' ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {status.label} por {r.reviewed_by ?? '—'}
          {r.reviewed_at ? ` em ${when(r.reviewed_at)}` : ''}
          {r.review_note ? `: ${r.review_note}` : ''}
        </p>
      ) : canReview ? (
        <div className="mt-2 flex flex-col gap-2">
          <Textarea
            aria-label="Nota para o cliente"
            placeholder="Nota para o cliente (obrigatória para recusar)"
            value={note}
            maxLength={500}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
          />
          {failure ? <Alert tone="error">{failure}</Alert> : null}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void answer('confirmada')}>
              Confirmar
            </Button>
            <Button size="sm" variant="outline" disabled={busy || note.trim().length < 3} onClick={() => void answer('recusada')}>
              Recusar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
