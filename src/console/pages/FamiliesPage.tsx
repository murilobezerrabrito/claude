// Famílias por canal (SPEC, "Console interno"): chance atual, variação no mês, folga, selo da faixa, data das posições
// e status do mês, ordenável, com o filtro "precisam de atenção". O retrato vem de families_overview, que confere o
// papel e registra a leitura; a família sem rodada aparece sem os números.

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ProbabilityBand } from '../../engine/metrics.ts'
import type { Channel, FamilyOverviewRow } from '../../lib/apiTypes.ts'
import { formatDate, formatMonthLabel, formatPp, formatRealReturn, formatTenthsPercent, formatTenthsPp } from '../../lib/format.ts'
import { BAND_LABELS } from '../../report/texts.ts'
import { errorText, rpc } from '../api.ts'
import { StatusBadge } from '../components.tsx'
import { CHANNEL_LABELS } from '../display.ts'
import { ATTENTION_LABELS, attentionReasons, bandOf, sortFamilies, tenths, variationTenths, type SortKey } from '../families.ts'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Card, CardContent } from '../ui/card.tsx'
import { Select } from '../ui/input.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx'

const BAND_TONES: Record<ProbabilityBand, 'blue' | 'green' | 'yellow' | 'red'> = {
  folga_grande: 'blue',
  no_caminho: 'green',
  atencao: 'yellow',
  em_risco: 'red',
}

/** Cabeçalho que ordena a lista; clicar de novo inverte a ordem. */
function SortHead({ label, column, sort, onSort, right }: { label: string; column: SortKey; sort: { key: SortKey; asc: boolean }; onSort: (k: SortKey) => void; right?: boolean }) {
  const active = sort.key === column
  const Icon = !active ? ArrowUpDown : sort.asc ? ArrowUp : ArrowDown
  return (
    <TableHead className={right ? 'text-right' : undefined} aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-foreground ${active ? 'text-foreground' : ''}`}
        onClick={() => onSort(column)}
      >
        {label}
        <Icon className="size-3.5" aria-hidden />
      </button>
    </TableHead>
  )
}

export function FamiliesPage() {
  const [channel, setChannel] = useState<Channel | ''>('')
  const [onlyAttention, setOnlyAttention] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'familia', asc: true })
  const [rows, setRows] = useState<FamilyOverviewRow[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    rpc<FamilyOverviewRow[]>('families_overview', channel ? { p_channel: channel } : {})
      .then((r) => !cancelled && setRows(r))
      .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [channel])

  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: key === 'familia' }))
  const shown = useMemo(() => {
    const list = (rows ?? []).filter((f) => !onlyAttention || attentionReasons(f).length > 0)
    return sortFamilies(list, sort.key, sort.asc)
  }, [rows, onlyAttention, sort])
  const attentionCount = (rows ?? []).filter((f) => attentionReasons(f).length > 0).length

  return (
    <>
      <PageTitle title="Famílias">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Canal
            <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel | '')}>
              <option value="">Todos</option>
              <option value="cadm">CADM</option>
              <option value="ai">AI</option>
            </Select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-primary" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />
            Precisam de atenção{rows ? ` (${attentionCount})` : ''}
          </label>
        </div>
      </PageTitle>
      {failure ? <Alert tone="error">{failure}</Alert> : null}
      <Card>
        <CardContent className="pt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Família" column="familia" sort={sort} onSort={onSort} />
                <TableHead>Canal</TableHead>
                <SortHead label="Chance" column="chance" sort={sort} onSort={onSort} right />
                <SortHead label="Variação no mês" column="variacao" sort={sort} onSort={onSort} right />
                <SortHead label="Folga" column="folga" sort={sort} onSort={onSort} right />
                <TableHead>Faixa</TableHead>
                <SortHead label="Posições de" column="posicoes" sort={sort} onSort={onSort} />
                <TableHead>Mês</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((f) => {
                const band = bandOf(f)
                const variation = variationTenths(f)
                const reasons = attentionReasons(f)
                return (
                  <TableRow key={f.household_id}>
                    <TableCell>
                      <span className="font-medium">{f.code}</span> {f.name}
                      {f.status === 'encerrada' ? (
                        <Badge className="ml-2" tone="neutral">
                          Encerrada
                        </Badge>
                      ) : null}
                      {reasons.length > 0 ? <p className="mt-0.5 text-xs text-muted-foreground">{reasons.map((r) => ATTENTION_LABELS[r]).join(' · ')}</p> : null}
                    </TableCell>
                    <TableCell>{CHANNEL_LABELS[f.channel]}</TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">{f.latest ? formatTenthsPercent(tenths(f.latest.probability)) : '—'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{variation !== null ? formatTenthsPp(variation) : '—'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap" title={f.latest?.required_return != null ? `Benchmark pessoal: ${formatRealReturn(f.latest.required_return)}` : undefined}>
                      {f.latest?.slack != null ? formatPp(f.latest.slack) : '—'}
                    </TableCell>
                    <TableCell>{band ? <Badge tone={BAND_TONES[band]}>{BAND_LABELS[band]}</Badge> : <span className="text-muted-foreground">Sem rodada</span>}</TableCell>
                    <TableCell className="whitespace-nowrap">{f.latest ? formatDate(f.latest.ref_date) : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {f.month ? (
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge status={f.month.status} />
                          <span className="text-xs text-muted-foreground">{formatMonthLabel(f.month.ref_date.slice(0, 7))}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sem importação</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {rows && shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    {onlyAttention ? 'Nenhuma família precisa de atenção agora.' : 'Nenhuma família visível para você.'}
                  </TableCell>
                </TableRow>
              ) : null}
              {!rows && !failure ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <p className="mt-4 text-xs text-muted-foreground">
            Chance, folga e faixa da rodada oficial mais recente de cada família; a variação compara com a rodada do mês anterior. Precisam de atenção: chance abaixo de 70%, queda de mais de 5 p.p. no mês, ou 99% ou mais (talvez conservador demais).
          </p>
        </CardContent>
      </Card>
    </>
  )
}
