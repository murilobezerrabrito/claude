// Um relatório do mês (SPEC, "Fluxo do mês", passos 5 a 8): a prévia em PDF, o comentário da gestão, os cenários da
// conversa e a revisão com quatro olhos; depois da aprovação, o PDF guardado (gerado no navegador de quem aprova), o
// download pelo link assinado, o modo apresentação com o próprio PDF guardado e o registro da apresentação. O banco e a
// função do servidor conferem cada ação de novo; esta tela só mostra o que cabe a quem está no console.

import { ArrowLeft, Download, Presentation } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { ReportDetail, ReportDownload, ReportPdfResult, ReportScenarioResult, StoredReportScenario } from '../../lib/apiTypes.ts'
import { formatDate, formatProbability, monthYearName } from '../../lib/format.ts'
import { isoToBrDate } from '../../lib/planForm.ts'
import { supabaseUrl } from '../../lib/supabase.ts'
import type { ReportScenarioParams } from '../../report/scenarios.ts'
import type { ReportSnapshot } from '../../report/snapshot.ts'
import { callFunction, errorText, rpc } from '../api.ts'
import { reportPdfBlob, usePresentation, useReportPdf } from '../report/browserPdf.ts'
import { PresentationStage } from '../report/PresentationStage.tsx'
import {
  approveBlockers,
  dateInBrazil,
  dateTimeInBrazil,
  isOpen,
  parseBrDate,
  PRESENTED_HOW_LABELS,
  previewSnapshot,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TONES,
  reportActions,
  staleReasons,
  submitBlockers,
  toBase64,
} from '../reports.ts'
import { useSession } from '../session.tsx'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Button } from '../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx'
import { ConfirmDialog, FormDialog } from '../ui/dialog.tsx'
import { Input, Select, Textarea } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import { ScenarioBuilder, ScenarioList } from './ReportScenarios.tsx'

const COMMENT_MAX = 1200

/** Guarda o PDF do relatório aprovado: gerado aqui, a partir do snapshot aprovado, e enviado à função do servidor. */
async function storePdf(reportId: string, snapshot: ReportSnapshot): Promise<ReportPdfResult> {
  const blob = await reportPdfBlob(snapshot)
  const pdf_base64 = toBase64(new Uint8Array(await blob.arrayBuffer()))
  return callFunction<ReportPdfResult>('report', { acao: 'pdf', report_id: reportId, pdf_base64 })
}

/** Link assinado (60 segundos) para o PDF guardado; o download fica na auditoria. */
async function signedPdf(reportId: string): Promise<{ url: string; fileName: string }> {
  const link = await callFunction<ReportDownload>('report', { acao: 'baixar', report_id: reportId })
  return { url: `${supabaseUrl}${link.caminho}`, fileName: link.arquivo }
}

export function ReportPage() {
  const { id = '' } = useParams()
  const session = useSession()
  const [loaded, setLoaded] = useState<{ id: string; detail: ReportDetail } | null>(null)
  const [loadError, setLoadError] = useState<{ id: string; message: string } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let cancelled = false
    rpc<ReportDetail>('report_detail', { p_report: id })
      .then((d) => !cancelled && setLoaded({ id, detail: d }))
      .catch((e: unknown) => !cancelled && setLoadError({ id, message: errorText(e) }))
    return () => {
      cancelled = true
    }
  }, [id, version])

  const detail = loaded?.id === id ? loaded.detail : null
  // A prévia só é refeita quando o conteúdo muda (o snapshot vem como objeto novo a cada leitura).
  const previewJson = detail ? JSON.stringify(previewSnapshot(detail)) : null
  const preview = useMemo(() => (previewJson ? (JSON.parse(previewJson) as ReportSnapshot | null) : null), [previewJson])
  const pdf = useReportPdf(preview)
  const presentation = usePresentation()
  // PDF guardado, baixado para o modo apresentação: reaproveitado enquanto a página está aberta e liberado ao sair.
  const [stored, setStored] = useState<{ id: string; url: string } | null>(null)
  const [storedError, setStoredError] = useState<string | null>(null)
  const storedUrl = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (storedUrl.current) URL.revokeObjectURL(storedUrl.current)
    },
    [],
  )

  if (loadError?.id === id && !detail) {
    return (
      <>
        <BackLink />
        <Alert tone="error">{loadError.message}</Alert>
      </>
    )
  }
  if (!detail) return <p className="text-muted-foreground">Carregando o relatório…</p>

  const actions = reportActions(detail, { userId: session.user.id, gestao: session.has('gestao') })
  const month = detail.ref_date.slice(0, 7)

  const act = async (fn: () => Promise<string | null>) => {
    setBusy(true)
    setFailure(null)
    setMessage(null)
    try {
      setMessage(await fn())
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
      reload()
    }
  }

  const runScenario = async (params: ReportScenarioParams): Promise<boolean> => {
    setFailure(null)
    setMessage(null)
    try {
      const r = await callFunction<ReportScenarioResult>('report', { acao: 'cenario', report_id: detail.id, cenario: params })
      setMessage(`Cenário gravado: ${r.cenario.name} (chance ${formatProbability(r.cenario.probability)}).`)
      return true
    } catch (e) {
      setFailure(errorText(e))
      return false
    } finally {
      reload()
    }
  }

  const removeScenario = (s: StoredReportScenario) =>
    act(async () => {
      await rpc('remove_report_scenario', { p_report: detail.id, p_scenario: s.id })
      return `Cenário tirado: ${s.name}.`
    })

  const approve = () =>
    act(async () => {
      await rpc('approve_report', { p_report: detail.id })
      // O PDF sai do snapshot aprovado (com o comentário e os cenários), lido de novo do banco.
      const approved = await rpc<ReportDetail>('report_detail', { p_report: detail.id })
      if (!approved.snapshot) return 'Relatório aprovado. Quem vê os valores guarda o PDF.'
      try {
        const r = await storePdf(detail.id, approved.snapshot)
        return `Relatório aprovado e PDF guardado (${Math.round(r.bytes / 1024)} KB).`
      } catch (e) {
        throw new Error(`Relatório aprovado, mas o PDF não foi guardado: ${errorText(e)} Use "Guardar o PDF".`, { cause: e })
      }
    })

  const savePdf = () =>
    act(async () => {
      if (!detail.snapshot) throw new Error('Sem os números do relatório.')
      const r = await storePdf(detail.id, detail.snapshot)
      return `PDF guardado (${Math.round(r.bytes / 1024)} KB, SHA-256 ${r.sha256.slice(0, 12)}…).`
    })

  const download = () =>
    act(async () => {
      const { url, fileName } = await signedPdf(detail.id)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.append(a)
      a.click()
      a.remove()
      return `Download de ${fileName} iniciado.`
    })

  const presentStored = () => {
    // Tela cheia no próprio clique; o PDF guardado chega depois (uma vez por página: cada download fica na auditoria).
    presentation.enter()
    if (stored?.id === detail.id) return
    setStoredError(null)
    void (async () => {
      try {
        const { url } = await signedPdf(detail.id)
        const res = await fetch(url)
        if (!res.ok) throw new Error(`O Storage respondeu ${res.status}.`)
        const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' })
        if (storedUrl.current) URL.revokeObjectURL(storedUrl.current)
        storedUrl.current = URL.createObjectURL(blob)
        setStored({ id: detail.id, url: storedUrl.current })
      } catch (e) {
        setStoredError(`Não foi possível abrir o PDF guardado: ${errorText(e)}`)
      }
    })()
  }

  const stale = staleReasons(detail)

  return (
    <>
      <BackLink month={month} />
      <PageTitle title={`Relatório de ${monthYearName(month)}`}>
        {actions.download ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void download()} disabled={busy}>
              <Download />
              Baixar PDF
            </Button>
            <Button onClick={presentStored}>
              <Presentation />
              Modo apresentação
            </Button>
          </div>
        ) : null}
      </PageTitle>
      <div className="-mt-4 mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{detail.household.code}</span> {detail.household.name} · versão {detail.version}
        </span>
        <Badge tone={REPORT_STATUS_TONES[detail.status]}>{REPORT_STATUS_LABELS[detail.status]}</Badge>
        <span>{whoText(detail)}</span>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        {failure ? <Alert tone="error">{failure}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}
        {detail.status === 'descartado' ? <Alert tone="warning">Versão descartada: {detail.discard_reason}</Alert> : null}
        {stale.length > 0 ? (
          <Alert tone="warning">
            {stale.join(' ')} Descarte esta versão e prepare outra na lista do mês.
          </Alert>
        ) : null}
        {detail.status === 'rascunho' && detail.review_note ? <Alert tone="warning">Devolvido para ajuste: {detail.review_note}</Alert> : null}
        {!detail.amounts_visible ? <Alert>Sem permissão para ver os valores desta família: só a situação do relatório.</Alert> : null}
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-6">
          {isOpen(detail.status) || actions.storePdf || actions.present ? (
            <ReviewCard detail={detail} actions={actions} gestao={session.has('gestao')} busy={busy} act={act} approve={approve} savePdf={savePdf} />
          ) : null}
          {detail.amounts_visible ? (
            <Card>
              <CardHeader>
                <CardTitle>Comentário da gestão</CardTitle>
                <CardDescription>O único texto livre do relatório (página 6). Quem aprova revisa.</CardDescription>
              </CardHeader>
              <CardContent>
                {actions.editDraft ? (
                  <CommentEditor
                    key={detail.id}
                    initial={detail.comment ?? ''}
                    busy={busy}
                    onSave={(text) =>
                      act(async () => {
                        await rpc('save_report_comment', { p_report: detail.id, p_comment: text })
                        return 'Comentário gravado.'
                      })
                    }
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{commentText(detail)}</p>
                )}
              </CardContent>
            </Card>
          ) : null}
          {detail.amounts_visible && detail.snapshot ? (
            <Card>
              <CardHeader>
                <CardTitle>Cenários da conversa do mês</CardTitle>
                <CardDescription>
                  Até três, com a chance contra a do plano oficial ({formatProbability(detail.snapshot.summary.probability)}). Cada cenário roda 10.000 trajetórias
                  com os sorteios da rodada oficial; o relatório não sugere alocação.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ScenarioList
                  scenarios={isOpen(detail.status) ? (detail.scenarios ?? []) : approvedScenarios(detail)}
                  planProbability={detail.snapshot.summary.probability}
                  canRemove={actions.editDraft}
                  busy={busy}
                  onRemove={(s) => void removeScenario(s)}
                />
                {actions.editDraft ? (
                  <ScenarioBuilder ctx={detail.snapshot.scenarioContext} existing={detail.scenarios ?? []} busy={busy} onRun={runScenario} />
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <VersionsCard detail={detail} />
        </div>

        {detail.amounts_visible ? (
          <Card className="lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle>{isOpen(detail.status) ? 'Prévia' : 'Relatório'}</CardTitle>
              <CardDescription>
                {isOpen(detail.status)
                  ? 'Como o relatório fica na aprovação, com o comentário e os cenários gravados. Gerado no navegador a partir dos números gravados.'
                  : 'Gerado no navegador a partir dos números aprovados; o PDF guardado tem o mesmo conteúdo.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pdf.error ? <Alert tone="error">Não foi possível gerar a prévia: {pdf.error}</Alert> : null}
              {!pdf.url && !pdf.error ? <p className="text-sm text-muted-foreground">Gerando o PDF…</p> : null}
              {pdf.url ? (
                <iframe className="h-[75vh] w-full rounded-md border bg-card" src={`${pdf.url}#view=FitH`} title={`Prévia do relatório de ${monthYearName(month)}`} />
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
      <PresentationStage
        presentation={presentation}
        url={stored?.id === detail.id ? stored.url : null}
        placeholder={storedError ?? 'Carregando o PDF guardado…'}
      />
    </>
  )
}

function BackLink({ month }: { month?: string }) {
  return (
    <Link to={month ? `/relatorios?mes=${month}` : '/relatorios'} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline [&_svg]:size-4">
      <ArrowLeft />
      Relatórios do mês
    </Link>
  )
}

/** Quem preparou, quem aprovou e quando apresentou. */
function whoText(d: ReportDetail): string {
  const parts = [`preparado por ${d.prepared_by_email ?? 'usuário removido'} em ${dateTimeInBrazil(d.created_at)}`]
  if (d.approved_at) parts.push(`aprovado por ${d.approved_by_email ?? 'usuário removido'} em ${dateTimeInBrazil(d.approved_at)}`)
  if (d.presented_at && d.presented_how) parts.push(`apresentado ${PRESENTED_HOW_LABELS[d.presented_how]} em ${formatDate(dateInBrazil(new Date(d.presented_at)))}`)
  return parts.join(' · ')
}

function commentText(d: ReportDetail): string {
  if (!isOpen(d.status) && d.snapshot) return d.snapshot.comment.text || 'Sem comentário.'
  return d.comment ?? 'A gestão ainda não escreveu o comentário.'
}

/** Cenários de uma versão aprovada: os do snapshot, que é o que o relatório mostra. */
function approvedScenarios(d: ReportDetail): StoredReportScenario[] {
  const byId = new Map((d.scenarios ?? []).map((s) => [s.id, s]))
  return (d.snapshot?.scenarios ?? []).map(
    (s) => byId.get(s.id) ?? { ...s, params: {}, inputsHash: '', seed: 0, paths: 0, computeMs: 0 },
  )
}

function CommentEditor({ initial, busy, onSave }: { initial: string; busy: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial)
  const changed = text.trim() !== initial.trim()
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        aria-label="Comentário da gestão"
        value={text}
        maxLength={COMMENT_MAX}
        rows={7}
        onChange={(e) => setText(e.target.value)}
        placeholder="O que mudou no mês, o que a família decidiu e o que acompanhar. Sem recomendar produtos, ativos ou alocação."
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {text.length.toLocaleString('pt-BR')} de {COMMENT_MAX.toLocaleString('pt-BR')} caracteres
        </span>
        <Button size="sm" onClick={() => onSave(text)} disabled={busy || !changed || text.trim() === ''}>
          Gravar comentário
        </Button>
      </div>
    </div>
  )
}

function ReviewCard(props: {
  detail: ReportDetail
  actions: ReturnType<typeof reportActions>
  gestao: boolean
  busy: boolean
  act: (fn: () => Promise<string | null>) => Promise<void>
  approve: () => Promise<void>
  savePdf: () => Promise<void>
}) {
  const { detail: d, actions: a, busy, act } = props
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [how, setHow] = useState<'reuniao' | 'pdf'>('reuniao')
  const today = dateInBrazil()
  const [date, setDate] = useState(() => isoToBrDate(today))
  const minDate = d.approved_at ? dateInBrazil(new Date(d.approved_at)) : today
  const dateIso = parseBrDate(date)
  const submitIssues = a.submit ? submitBlockers(d) : []
  const approveIssues = a.review ? approveBlockers(d) : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revisão</CardTitle>
        <CardDescription>{reviewHint(d, a, props.gestao)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {[...submitIssues, ...approveIssues].length > 0 ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-band-yellow">
            {[...submitIssues, ...approveIssues].map((m) => (
              <li key={m}>
                <span className="text-foreground">{m}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {a.submit ? (
            <ConfirmDialog
              trigger={<Button disabled={busy || submitIssues.length > 0}>Enviar para aprovação</Button>}
              title="Enviar o relatório para a aprovação?"
              description="Outra pessoa da gestão revisa os números, o comentário e os cenários, e aprova ou devolve. Para mudar algo depois do envio, retire o relatório para o rascunho."
              confirmLabel="Enviar"
              onConfirm={() =>
                void act(async () => {
                  await rpc('submit_report', { p_report: d.id })
                  return 'Relatório enviado para a aprovação.'
                })
              }
            />
          ) : null}
          {a.withdraw ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await rpc('return_report', { p_report: d.id, p_note: null })
                  return 'Relatório de volta ao rascunho.'
                })
              }
            >
              Retirar para mudar
            </Button>
          ) : null}
          {a.review ? (
            <ConfirmDialog
              trigger={<Button disabled={busy || approveIssues.length > 0}>Aprovar</Button>}
              title="Aprovar o relatório?"
              description="O relatório aprovado não muda mais: o comentário e os cenários entram nos números congelados, o PDF é gerado aqui e guardado com o hash, e uma versão aprovada antes fica substituída."
              confirmLabel="Aprovar"
              onConfirm={() => void props.approve()}
            />
          ) : null}
          {a.review ? (
            <FormDialog
              trigger={
                <Button variant="outline" disabled={busy}>
                  Devolver
                </Button>
              }
              title="Devolver o relatório para ajuste?"
              description="Quem preparou recebe a observação e o relatório volta ao rascunho."
              confirmLabel="Devolver"
              canConfirm={note.trim().length >= 3 && note.trim().length <= 500}
              onOpenChange={(open) => !open && setNote('')}
              onConfirm={() =>
                void act(async () => {
                  await rpc('return_report', { p_report: d.id, p_note: note })
                  return 'Relatório devolvido para ajuste.'
                })
              }
            >
              <Label htmlFor="observacao">O que precisa mudar</Label>
              <Textarea id="observacao" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </FormDialog>
          ) : null}
          {a.discard ? (
            <FormDialog
              trigger={
                <Button variant="ghost" disabled={busy}>
                  Descartar
                </Button>
              }
              title="Descartar esta versão?"
              description="Use quando um número está estranho: volte à conferência, rode de novo e prepare outra versão. A versão descartada fica no histórico, com o motivo."
              confirmLabel="Descartar"
              destructive
              canConfirm={reason.trim().length >= 3 && reason.trim().length <= 500}
              onOpenChange={(open) => !open && setReason('')}
              onConfirm={() =>
                void act(async () => {
                  await rpc('discard_report', { p_report: d.id, p_reason: reason })
                  return 'Versão descartada.'
                })
              }
            >
              <Label htmlFor="motivo-descarte">Motivo</Label>
              <Textarea id="motivo-descarte" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </FormDialog>
          ) : null}
          {a.storePdf ? (
            <Button disabled={busy} onClick={() => void props.savePdf()}>
              Guardar o PDF
            </Button>
          ) : null}
          {a.present ? (
            <FormDialog
              trigger={<Button disabled={busy}>Registrar apresentação</Button>}
              title="Registrar a apresentação"
              description={`Uma vez por versão: a forma e a data, de ${formatDate(minDate)} (aprovação) até hoje.`}
              confirmLabel="Registrar"
              canConfirm={dateIso !== null && dateIso >= minDate && dateIso <= today}
              onConfirm={() =>
                void act(async () => {
                  await rpc('present_report', { p_report: d.id, p_how: how, p_date: dateIso })
                  return 'Apresentação registrada.'
                })
              }
            >
              <Label htmlFor="forma">Forma</Label>
              <Select id="forma" value={how} onChange={(e) => setHow(e.target.value as 'reuniao' | 'pdf')}>
                <option value="reuniao">Reunião</option>
                <option value="pdf">PDF enviado</option>
              </Select>
              <Label htmlFor="data-apresentacao">Data</Label>
              <Input id="data-apresentacao" inputMode="numeric" placeholder="dd/mm/aaaa" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormDialog>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function reviewHint(d: ReportDetail, a: ReturnType<typeof reportActions>, gestao: boolean): string {
  if (!gestao) return 'Só a gestão prepara, revisa e aprova o relatório.'
  if (a.storePdf) return 'Relatório aprovado sem o PDF guardado: gere e guarde o PDF para baixar e apresentar.'
  if (a.present) return 'Relatório aprovado, com o PDF guardado. Depois da conversa com a família, registre a apresentação.'
  if (d.status === 'rascunho') {
    return a.submit
      ? 'Escreva o comentário, escolha os cenários e envie. Outra pessoa da gestão aprova.'
      : `Rascunho de ${d.prepared_by_email ?? 'outra pessoa'}: só quem prepara muda e envia.`
  }
  if (d.status === 'em_revisao') {
    return a.review
      ? 'Revise os números, o comentário e os cenários. Aprove ou devolva com uma observação.'
      : 'Esperando a aprovação de outra pessoa da gestão. Para mudar algo, retire para o rascunho.'
  }
  return ''
}

function VersionsCard({ detail }: { detail: ReportDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Versões do mês</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2 text-sm">
          {[...detail.versions].reverse().map((v) => (
            <li key={v.id} className="flex flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                {v.id === detail.id ? (
                  <span className="font-medium">Versão {v.version}</span>
                ) : (
                  <Link to={`/relatorios/${v.id}`} className="font-medium text-primary hover:underline">
                    Versão {v.version}
                  </Link>
                )}
                <Badge tone={REPORT_STATUS_TONES[v.status]}>{REPORT_STATUS_LABELS[v.status]}</Badge>
                <span className="text-muted-foreground">{dateTimeInBrazil(v.created_at)}</span>
              </span>
              {v.reason ? <span className="text-muted-foreground">Motivo da nova versão: {v.reason}</span> : null}
              {v.discard_reason ? <span className="text-muted-foreground">Motivo do descarte: {v.discard_reason}</span> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
