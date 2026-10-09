// Tela "Mês" (SPEC, "Console interno" e "Fluxo do mês"): importar, conferir família por família, confirmar a
// rentabilidade fora da faixa, apagar o que entrou por engano e fechar. Só a gestão age; banker, responsável,
// comitê e compliance acompanham. O banco confere cada ação de novo.

import { RefreshCw } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import type { Channel, CheckResult, CloseMonthResult, MonthOverview, MonthOverviewFamily } from '../../lib/apiTypes.ts'
import { formatDate, formatMonthLabel, formatSignedPercent } from '../../lib/format.ts'
import { errorText, rpc } from '../api.ts'
import { CheckItems, StatusBadge } from '../components.tsx'
import { CHANNEL_LABELS, money, monthEnd, plural, previousMonth, STATUS_LABELS } from '../display.ts'
import { useSession } from '../session.tsx'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Button } from '../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx'
import { ConfirmDialog } from '../ui/dialog.tsx'
import { Input } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx'
import { ImportCard } from './ImportCard.tsx'

function returnText(f: MonthOverviewFamily): string {
  const c = f.checks
  if (!c) return '—'
  if (c.real_return !== null) return `${formatSignedPercent(c.real_return, 2)} real`
  if (c.nominal_return !== null) return `${formatSignedPercent(c.nominal_return, 2)} nominal`
  return '—'
}

export function MonthPage() {
  const session = useSession()
  const isGestao = session.has('gestao')
  const [month, setMonth] = useState(previousMonth)
  const refDate = monthEnd(month)
  const [overview, setOverview] = useState<MonthOverview | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let cancelled = false
    rpc<MonthOverview>('month_overview', { p_ref_date: refDate })
      .then((r) => !cancelled && setOverview(r))
      .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [refDate, version])

  const act = async (action: () => Promise<string | null>) => {
    setBusy(true)
    setFailure(null)
    setMessage(null)
    try {
      setMessage(await action())
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
      reload()
    }
  }

  const check = () =>
    act(async () => {
      const results = await rpc<CheckResult[]>('check_month', { p_ref_date: refDate })
      const blocked = results.filter((r) => r.status === 'bloqueado').length
      return results.length === 0
        ? 'Nenhuma família para conferir neste mês.'
        : `${plural(results.length, 'família conferida', 'famílias conferidas')}: ${results.length - blocked} sem bloqueio e ${blocked} com bloqueio.`
    })

  const closeChannel = (channel: Channel) =>
    act(async () => {
      const r = await rpc<CloseMonthResult>('close_month', { p_ref_date: refDate, p_channel: channel })
      const left = r.left_out.length > 0 ? ` Ficaram de fora: ${r.left_out.map((f) => `${f.code} (${f.status})`).join(', ')}.` : ''
      return `Mês ${CHANNEL_LABELS[channel]} fechado com ${r.closed.join(', ')}.${left}`
    })

  const families = overview?.families ?? []
  const counts = families.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.status]: (acc[f.status] ?? 0) + 1 }), {})

  return (
    <>
      <PageTitle title="Mês">
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mes">Mês de referência</Label>
            <Input id="mes" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44" />
          </div>
          <Button variant="outline" size="icon" onClick={reload} aria-label="Atualizar">
            <RefreshCw />
          </Button>
        </div>
      </PageTitle>

      <div className="flex flex-col gap-6">
        {isGestao ? <ImportCard onImported={(d) => (d.slice(0, 7) === month ? reload() : setMonth(d.slice(0, 7)))} /> : null}

        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Situação de {formatMonthLabel(month)}</CardTitle>
              <CardDescription>
                Posições de {formatDate(refDate)}. Só família conferida vai para a rodada; só família fechada alimenta relatório e app.
              </CardDescription>
            </div>
            {isGestao ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={check} disabled={busy}>
                  Conferir o mês
                </Button>
                {(['cadm', 'ai'] as Channel[]).map((ch) => {
                  const closing = overview?.closings.find((c) => c.channel === ch)
                  if (!closing || closing.status === 'fechado') return null
                  return (
                    <ConfirmDialog
                      key={ch}
                      trigger={
                        <Button variant="outline" disabled={busy}>
                          Fechar {CHANNEL_LABELS[ch]}
                        </Button>
                      }
                      title={`Fechar o mês ${CHANNEL_LABELS[ch]} de ${formatMonthLabel(month)}?`}
                      description="As famílias já rodadas ficam fechadas e não mudam mais. As outras ficam de fora e podem ser fechadas depois, uma a uma. O mês do canal não reabre."
                      confirmLabel="Fechar o mês"
                      onConfirm={() => void closeChannel(ch)}
                    />
                  )
                })}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {failure ? <Alert tone="error">{failure}</Alert> : null}
            {message ? <Alert tone="success">{message}</Alert> : null}
            <div className="flex flex-wrap gap-2 text-sm">
              {overview?.closings.map((c) => (
                <Badge key={c.channel} tone={c.status === 'fechado' ? 'primary' : 'neutral'}>
                  {CHANNEL_LABELS[c.channel]}: {c.status === 'fechado' ? 'fechado' : 'aberto'}
                </Badge>
              ))}
              {Object.entries(counts).map(([status, n]) => (
                <span key={status} className="text-muted-foreground">
                  {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}: {n}
                </span>
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Família</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">PL oficial</TableHead>
                  <TableHead className="text-right">Rentabilidade</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  {isGestao ? <TableHead className="text-right">Ações</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {families.map((f) => (
                  <Fragment key={f.household_id}>
                    <TableRow className={f.checks?.items.length ? 'border-b-0' : undefined}>
                      <TableCell>
                        <span className="font-medium">{f.code}</span> {f.name}
                      </TableCell>
                      <TableCell>{CHANNEL_LABELS[f.channel]}</TableCell>
                      <TableCell>
                        <StatusBadge status={f.status} />
                      </TableCell>
                      <TableCell className="text-right">{money(f.official_pl)}</TableCell>
                      <TableCell className="text-right">{returnText(f)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {f.positions} pos. · {f.flows} mov.
                      </TableCell>
                      {isGestao ? (
                        <TableCell className="text-right">
                          <FamilyActions family={f} refDate={refDate} busy={busy} act={act} />
                        </TableCell>
                      ) : null}
                    </TableRow>
                    {f.checks?.items.length ? (
                      <TableRow>
                        <TableCell colSpan={isGestao ? 7 : 6} className="pt-0 pb-3 pl-6">
                          <CheckItems items={f.checks.items} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))}
                {families.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      {overview ? 'Nenhuma família.' : 'Carregando…'}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {overview && overview.batches.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Importações do mês</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Linhas</TableHead>
                    <TableHead className="text-right">Enviado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.file_name}</TableCell>
                      <TableCell>{b.kind === 'posicoes' ? 'Posições' : 'Aportes e resgates'}</TableCell>
                      <TableCell>{{ previa: 'Prévia', confirmada: 'Confirmada', substituida: 'Substituída' }[b.status]}</TableCell>
                      <TableCell className="text-right">{b.rows}</TableCell>
                      <TableCell className="text-right">{new Date(b.created_at).toLocaleString('pt-BR')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  )
}

function FamilyActions({
  family: f,
  refDate,
  busy,
  act,
}: {
  family: MonthOverviewFamily
  refDate: string
  busy: boolean
  act: (action: () => Promise<string | null>) => Promise<void>
}) {
  const outOfRange = f.checks?.items.some((i) => i.code === 'rentabilidade_fora_da_faixa') ?? false
  const clear = (kind: 'posicoes' | 'movimentos') =>
    act(async () => {
      await rpc('import_clear', { p_household: f.household_id, p_ref_date: refDate, p_kind: kind })
      return `${kind === 'posicoes' ? 'Posições' : 'Movimentos'} de ${f.code} apagados. Importe de novo, se for o caso, e confira.`
    })
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {outOfRange ? (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline" disabled={busy}>
              Confirmar rentabilidade
            </Button>
          }
          title={`Confirmar a rentabilidade de ${f.code}?`}
          description="Só quem importou o mês desta família confirma. Confira as posições, os aportes e resgates e o PL antes: a confirmação fica registrada na auditoria."
          confirmLabel="Confirmar"
          onConfirm={() =>
            void act(async () => {
              await rpc('confirm_return', { p_household: f.household_id, p_ref_date: refDate })
              return `Rentabilidade de ${f.code} confirmada.`
            })
          }
        />
      ) : null}
      {f.status === 'rodado' ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await rpc('close_household_month', { p_household: f.household_id, p_ref_date: refDate })
              return `Mês de ${f.code} fechado.`
            })
          }
        >
          Fechar família
        </Button>
      ) : null}
      {f.status !== 'fechado' && f.positions > 0 ? (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost" disabled={busy}>
              Apagar posições
            </Button>
          }
          title={`Apagar as posições de ${f.code} no mês?`}
          description="Use quando as posições desta família entraram por engano. As linhas apagadas ficam na auditoria e o mês volta para importado."
          confirmLabel="Apagar posições"
          destructive
          onConfirm={() => void clear('posicoes')}
        />
      ) : null}
      {f.status !== 'fechado' && f.flows > 0 ? (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost" disabled={busy}>
              Apagar movimentos
            </Button>
          }
          title={`Apagar os aportes e resgates de ${f.code} no mês?`}
          description="Use quando os movimentos desta família entraram por engano. As linhas apagadas ficam na auditoria e o mês volta para importado."
          confirmLabel="Apagar movimentos"
          destructive
          onConfirm={() => void clear('movimentos')}
        />
      ) : null}
    </div>
  )
}
