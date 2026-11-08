// Textos legais (SPEC, "Textos legais" e "Segurança"): a versão aprovada e o rascunho de cada texto. A compliance escreve
// uma versão nova e aprova; a aprovação arquiva a anterior. O relatório usa a versão aprovada no rascunho, e a aprovação
// do relatório é recusada se um texto mudou depois. A equipe interna lê.

import { useEffect, useState } from 'react'
import type { LegalTextRow } from '../../lib/apiTypes.ts'
import { errorText, rpc } from '../api.ts'
import { dateTimeInBrazil, LEGAL_TEXT_LABELS } from '../reports.ts'
import { useSession } from '../session.tsx'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Button } from '../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx'
import { ConfirmDialog } from '../ui/dialog.tsx'
import { Textarea } from '../ui/input.tsx'

const TEXT_MIN = 10
const TEXT_MAX = 3000

export function LegalTextsPage() {
  const session = useSession()
  const canEdit = session.has('compliance')
  const [texts, setTexts] = useState<LegalTextRow[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    rpc<LegalTextRow[]>('legal_texts_overview')
      .then((r) => !cancelled && setTexts(r))
      .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [version])

  const act = async (fn: () => Promise<string>) => {
    setBusy(true)
    setFailure(null)
    setMessage(null)
    try {
      setMessage(await fn())
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
      setVersion((v) => v + 1)
    }
  }

  return (
    <>
      <PageTitle title="Textos legais" />
      <p className="-mt-4 mb-4 max-w-3xl text-sm text-muted-foreground">
        {canEdit
          ? 'Escreva a versão nova como rascunho e aprove quando estiver pronta. Os rascunhos de relatório passam a usar a versão aprovada; um relatório aberto com a versão anterior precisa ser refeito antes da aprovação.'
          : 'A compliance escreve e aprova os textos. O relatório usa a versão aprovada no momento do rascunho.'}
      </p>
      <div className="mb-4 flex flex-col gap-2">
        {failure ? <Alert tone="error">{failure}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}
      </div>
      {!texts && !failure ? <p className="text-muted-foreground">Carregando…</p> : null}
      <div className="flex flex-col gap-6">
        {(texts ?? []).map((t) => (
          <LegalTextCard key={`${t.key}-${t.draft?.id ?? ''}-${t.approved?.id ?? ''}`} text={t} canEdit={canEdit} busy={busy} act={act} />
        ))}
      </div>
    </>
  )
}

function LegalTextCard(props: { text: LegalTextRow; canEdit: boolean; busy: boolean; act: (fn: () => Promise<string>) => Promise<void> }) {
  const { text: t, canEdit, busy, act } = props
  const label = LEGAL_TEXT_LABELS[t.key] ?? t.key
  const [body, setBody] = useState(t.draft?.body ?? t.approved?.body ?? '')
  const current = t.draft?.body ?? t.approved?.body ?? ''
  const length = body.trim().length
  const footerFields = t.key === 'rodape_relatorio'
  const fieldsOk = !footerFields || (body.includes('[mês]') && body.includes('[versão]'))
  const canSave = canEdit && body.trim() !== current.trim() && body.trim() !== (t.approved?.body ?? '').trim() && length >= TEXT_MIN && length <= TEXT_MAX && fieldsOk

  return (
    <Card data-testid={`texto-${t.key}`}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {label}
          {t.in_report ? <Badge tone="blue">No relatório</Badge> : null}
          {t.draft ? <Badge tone="yellow">Rascunho da versão {t.draft.version}</Badge> : null}
          {!t.approved ? <Badge tone="red">Sem versão aprovada</Badge> : null}
        </CardTitle>
        <CardDescription>
          {t.approved
            ? `Versão ${t.approved.version} aprovada por ${t.approved.approved_by_email ?? 'usuário removido'} em ${dateTimeInBrazil(t.approved.approved_at)}.`
            : 'Ainda sem versão aprovada.'}
          {footerFields ? ' Os campos [mês] e [versão] são trocados pelo mês das posições e pela versão das premissas.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {t.approved ? (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Versão aprovada</p>
            <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{t.approved.body}</p>
          </div>
        ) : null}
        {t.draft && !canEdit ? (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              Rascunho da versão {t.draft.version}, de {t.draft.created_by_email ?? 'usuário removido'} em {dateTimeInBrazil(t.draft.created_at)}
            </p>
            <p className="rounded-md border border-dashed p-3 text-sm whitespace-pre-wrap">{t.draft.body}</p>
          </div>
        ) : null}
        {canEdit ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t.draft
                ? `Rascunho da versão ${t.draft.version}, de ${t.draft.created_by_email ?? 'usuário removido'} em ${dateTimeInBrazil(t.draft.created_at)}`
                : 'Versão nova (comece pelo texto aprovado)'}
            </p>
            <Textarea aria-label={`Texto: ${label}`} value={body} rows={5} maxLength={TEXT_MAX} onChange={(e) => setBody(e.target.value)} />
            {!fieldsOk ? <p className="text-xs text-destructive">O rodapé do relatório precisa dos campos [mês] e [versão].</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !canSave}
                onClick={() =>
                  void act(async () => {
                    const r = await rpc<{ version: number }>('save_legal_text', { p_key: t.key, p_body: body })
                    return `Rascunho da versão ${r.version} de "${label}" gravado.`
                  })
                }
              >
                Gravar rascunho
              </Button>
              {t.draft ? (
                <ConfirmDialog
                  trigger={
                    <Button size="sm" disabled={busy || body.trim() !== t.draft.body.trim()}>
                      Aprovar a versão {t.draft.version}
                    </Button>
                  }
                  title={`Aprovar a versão ${t.draft.version} de "${label}"?`}
                  description="Os próximos rascunhos de relatório usam esta versão. A versão aprovada antes fica arquivada, e um relatório aberto com ela precisa ser refeito antes da aprovação."
                  confirmLabel="Aprovar"
                  onConfirm={() =>
                    void act(async () => {
                      await rpc('approve_legal_text', { p_id: t.draft!.id })
                      return `Versão ${t.draft!.version} de "${label}" aprovada.`
                    })
                  }
                />
              ) : null}
              {t.draft ? (
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="ghost" disabled={busy}>
                      Descartar o rascunho
                    </Button>
                  }
                  title={`Descartar o rascunho de "${label}"?`}
                  description="A versão aprovada continua valendo."
                  confirmLabel="Descartar"
                  destructive
                  onConfirm={() =>
                    void act(async () => {
                      await rpc('discard_legal_text', { p_id: t.draft!.id })
                      return `Rascunho de "${label}" descartado.`
                    })
                  }
                />
              ) : null}
              <span className="text-xs text-muted-foreground">
                {length.toLocaleString('pt-BR')} de {TEXT_MAX.toLocaleString('pt-BR')} caracteres
              </span>
            </div>
            {t.draft && body.trim() !== t.draft.body.trim() ? (
              <p className="text-xs text-muted-foreground">Grave o rascunho antes de aprovar: a aprovação vale para o texto gravado.</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
