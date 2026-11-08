// Relatórios do mês (SPEC, "Fluxo do mês", passos 4 a 8): as famílias CADM com a situação do mês, o gestor responsável e a
// última versão do relatório. A gestão prepara o rascunho (a função do servidor monta os números a partir da rodada
// publicada, sem simular); cada versão abre na sua página. O banker vê só os relatórios aprovados das suas famílias.

import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { ReportDraftResult, ReportMonths } from '../../lib/apiTypes.ts'
import { formatMonthLabel, monthYearName } from '../../lib/format.ts'
import { callFunction, errorText, rpc } from '../api.ts'
import { MonthSelect, StatusBadge } from '../components.tsx'
import { monthEnd, previousMonth } from '../display.ts'
import { isOpen, prepareState, REPORT_STATUS_LABELS, REPORT_STATUS_TONES } from '../reports.ts'
import { useSession } from '../session.tsx'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Button } from '../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx'
import { FormDialog } from '../ui/dialog.tsx'
import { Label } from '../ui/label.tsx'
import { Textarea } from '../ui/input.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx'

type Family = ReportMonths['families'][number]

export function ReportsPage() {
  const session = useSession()
  const isGestao = session.has('gestao')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const month = /^\d{4}-\d{2}$/.test(params.get('mes') ?? '') ? (params.get('mes') as string) : previousMonth()
  const refDate = monthEnd(month)
  const [data, setData] = useState<{ refDate: string; months: ReportMonths } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [preparing, setPreparing] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    rpc<ReportMonths>('report_months', { p_ref_date: refDate })
      .then((r) => {
        if (cancelled) return
        setLoadError(null)
        setData({ refDate, months: r })
      })
      .catch((e: unknown) => !cancelled && setLoadError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [refDate, version])

  const months = data?.refDate === refDate ? data.months : null

  const prepare = async (f: Family, reason: string | null) => {
    setPreparing(f.household_id)
    setFailure(null)
    try {
      const r = await callFunction<ReportDraftResult>('report', { acao: 'rascunho', household_id: f.household_id, ref_date: refDate, motivo: reason })
      void navigate(`/relatorios/${r.id}`)
    } catch (e) {
      setFailure(errorText(e))
      setVersion((v) => v + 1)
    } finally {
      setPreparing(null)
    }
  }

  return (
    <>
      <PageTitle title="Relatórios">
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mes">Mês de referência</Label>
            <MonthSelect id="mes" value={month} onChange={(m) => setParams({ mes: m })} />
          </div>
          <Button variant="outline" size="icon" onClick={() => setVersion((v) => v + 1)} aria-label="Atualizar">
            <RefreshCw />
          </Button>
        </div>
      </PageTitle>

      <Card>
        <CardHeader>
          <CardTitle>Relatórios de {monthYearName(month)}</CardTitle>
          <CardDescription>
            {isGestao
              ? 'O rascunho sai do mês rodado: os números vêm da rodada publicada. Outra pessoa da gestão aprova, com a família fechada no mês.'
              : session.has('banker')
                ? 'Os relatórios aprovados das suas famílias.'
                : 'Os relatórios do mês, em todas as versões.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loadError ? <Alert tone="error">{loadError}</Alert> : null}
          {failure ? <Alert tone="error">{failure}</Alert> : null}
          {months && !months.texts_ready && isGestao ? (
            <Alert tone="warning">
              A compliance ainda não aprovou todos os textos legais do relatório: sem eles, não sai rascunho.{' '}
              <Link to="/textos-legais" className="underline">
                Ver os textos legais
              </Link>
            </Alert>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Família</TableHead>
                <TableHead>Gestor responsável</TableHead>
                <TableHead>Mês</TableHead>
                <TableHead>Relatório</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(months?.families ?? []).map((f) => (
                <TableRow key={f.household_id} data-testid={`relatorio-${f.code}`}>
                  <TableCell>
                    <span className="font-medium">{f.code}</span> {f.name}
                    {f.status === 'encerrada' ? <span className="text-muted-foreground"> (encerrada)</span> : null}
                  </TableCell>
                  <TableCell>{f.manager_name ?? <span className="text-muted-foreground">A definir</span>}</TableCell>
                  <TableCell>{f.month_status ? <StatusBadge status={f.month_status} /> : <StatusBadge status="pendente" />}</TableCell>
                  <TableCell>
                    {f.latest ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span>Versão {f.latest.version}</span>
                        <Badge tone={REPORT_STATUS_TONES[f.latest.status]}>{REPORT_STATUS_LABELS[f.latest.status]}</Badge>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {f.latest ? (
                        <Button asChild size="sm" variant={isOpen(f.latest.status) ? 'default' : 'outline'}>
                          <Link to={`/relatorios/${f.latest.id}`}>Abrir</Link>
                        </Button>
                      ) : null}
                      {isGestao && months ? (
                        <PrepareAction family={f} textsReady={months.texts_ready} month={month} busy={preparing !== null} preparing={preparing === f.household_id} onPrepare={prepare} />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(months?.families.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {months ? 'Nenhum relatório neste mês.' : 'Carregando…'}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

function PrepareAction(props: {
  family: Family
  textsReady: boolean
  month: string
  busy: boolean
  preparing: boolean
  onPrepare: (f: Family, reason: string | null) => Promise<void>
}) {
  const { family: f } = props
  const state = prepareState(f, props.textsReady)
  const [reason, setReason] = useState('')
  if (f.latest && isOpen(f.latest.status)) return null
  if (!state.can) return <span className="text-xs text-muted-foreground">{state.blocker}</span>
  const label = props.preparing ? 'Montando o rascunho…' : f.latest ? 'Nova versão' : 'Preparar rascunho'
  const icon = props.preparing ? <LoaderCircle className="animate-spin" /> : null
  if (!state.needsReason) {
    return (
      <Button size="sm" disabled={props.busy} onClick={() => void props.onPrepare(f, null)}>
        {icon}
        {label}
      </Button>
    )
  }
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline" disabled={props.busy}>
          {icon}
          {label}
        </Button>
      }
      title={`Nova versão do relatório de ${f.code} (${formatMonthLabel(props.month)})?`}
      description="A nova versão sai da rodada publicada hoje, com os textos legais aprovados hoje. Quando for aprovada, a versão aprovada antes fica substituída."
      confirmLabel="Preparar"
      canConfirm={reason.trim().length >= 3 && reason.trim().length <= 500}
      onOpenChange={(open) => !open && setReason('')}
      onConfirm={() => void props.onPrepare(f, reason)}
    >
      <Label htmlFor={`motivo-${f.code}`}>Motivo da nova versão</Label>
      <Textarea id={`motivo-${f.code}`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
    </FormDialog>
  )
}
