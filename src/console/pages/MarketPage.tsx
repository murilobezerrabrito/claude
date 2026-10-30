// Séries do Banco Central (SPEC, "Dados de mercado"): o último dado, a origem, a última busca e o atraso de cada série,
// e a busca na hora (gestão e comitê), pela função do servidor `market-sync`. O agendamento diário entra na etapa da
// nuvem. O atraso é calculado aqui, com o calendário de dias úteis: o aviso aparece mesmo se o agendamento parar.

import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MarketStatusRow } from '../../lib/apiTypes.ts'
import { formatDate } from '../../lib/format.ts'
import { brazilToday, SERIES, type SeriesSyncResult } from '../../market/index.ts'
import { callFunction, errorText, rpc } from '../api.ts'
import { seriesValueText, seriesViews, SOURCE_LABELS } from '../market.ts'
import { useSession } from '../session.tsx'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Button } from '../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx'

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export function MarketPage() {
  const session = useSession()
  const canSync = session.has('gestao', 'comite')
  const [rows, setRows] = useState<MarketStatusRow[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [results, setResults] = useState<SeriesSyncResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    rpc<MarketStatusRow[]>('market_status')
      .then((r) => !cancelled && setRows(r))
      .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [version])

  const sync = async () => {
    setBusy(true)
    setFailure(null)
    setResults(null)
    try {
      const r = await callFunction<{ series: SeriesSyncResult[] }>('market-sync', {})
      setResults(r.series)
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
      setVersion((v) => v + 1)
    }
  }

  const views = rows ? seriesViews(rows, brazilToday()) : []
  const failed = results?.filter((r) => r.error) ?? []

  return (
    <>
      <PageTitle title="Séries do Banco Central">
        {canSync ? (
          <Button onClick={() => void sync()} disabled={busy}>
            <RefreshCw className={busy ? 'animate-spin' : undefined} />
            {busy ? 'Buscando…' : 'Buscar agora'}
          </Button>
        ) : null}
      </PageTitle>
      <div className="flex flex-col gap-6">
        {failure ? <Alert tone="error">{failure}</Alert> : null}
        {results ? (
          <Alert tone={failed.length > 0 ? 'warning' : 'success'}>
            {failed.length > 0 ? 'Busca concluída com erro em parte das séries:' : 'Busca concluída.'}
            <ul className="mt-1 list-disc pl-5">
              {results.map((r) => (
                <li key={r.code}>
                  {SERIES[r.code].name}:{' '}
                  {r.error ?? (r.windows === 0 ? 'nada novo a buscar.' : `${r.received} recebidos, ${r.inserted} novos, ${r.updated} atualizados.`)}
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Situação das séries</CardTitle>
            <CardDescription>
              CDI, IPCA e dólar de venda no SGS, gravados como o Banco Central publica. Atraso: CDI e dólar com mais de 3 dias úteis sem dado novo; IPCA
              do mês que não chegou até 3 dias úteis depois do dia 15 do mês seguinte. O agendamento diário entra na etapa da nuvem; até lá, a busca é
              pelo botão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Série</TableHead>
                  <TableHead>Último dado</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Última busca</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {views.map(({ row, name, lag }) => (
                  <TableRow key={row.code}>
                    <TableCell>
                      <span className="font-medium">{name}</span>
                      <p className="text-xs text-muted-foreground">
                        SGS {SERIES[row.code].sgs} · {SERIES[row.code].unit}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.last ? (
                        <>
                          {seriesValueText(row.code, row.last.value, row.last.date)}
                          <p className="text-xs text-muted-foreground">{formatDate(row.last.date)}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Nenhum</span>
                      )}
                    </TableCell>
                    <TableCell>{row.last ? (SOURCE_LABELS[row.last.source] ?? row.last.source) : '—'}</TableCell>
                    <TableCell className="max-w-80">
                      {row.last_sync ? (
                        <>
                          <span className="whitespace-nowrap">{when(row.last_sync.at)}</span>
                          <p className="text-xs text-muted-foreground">{row.last_sync.requested_by_email ?? 'Agendamento'}</p>
                          {row.last_sync.error ? (
                            <p className="text-xs text-destructive">{row.last_sync.error}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {row.last_sync.inserted} novos, {row.last_sync.updated} atualizados
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Nunca</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-72">
                      <Badge tone={lag.stale ? 'yellow' : 'green'}>{lag.stale ? 'Atrasada' : 'Em dia'}</Badge>
                      {lag.stale ? <p className="mt-1 text-xs text-muted-foreground">{lag.message}</p> : null}
                    </TableCell>
                  </TableRow>
                ))}
                {!rows && !failure ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
