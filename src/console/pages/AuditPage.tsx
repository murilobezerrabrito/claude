// Auditoria (SPEC, "Segurança"): o que cada pessoa fez e quando, por período (até um ano), família e ação. Só a
// compliance e o comitê consultam; a própria consulta também fica registrada. Os números dos relatórios ficam no
// próprio relatório, que não muda.

import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AuditTrail, FamilyOverviewRow } from '../../lib/apiTypes.ts'
import { errorText, rpc } from '../api.ts'
import { isoToBrDate } from '../../lib/planForm.ts'
import { auditActionLabel, dateInBrazil, dateTimeInBrazil, parseBrDate } from '../reports.ts'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Button } from '../ui/button.tsx'
import { Card, CardContent } from '../ui/card.tsx'
import { Input, Select } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx'

const LIMIT = 200

/** AAAA-MM-DD menos `days` dias. */
function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Filtros da consulta; as datas em AAAA-MM-DD (no formulário, como digitadas: dd/mm/aaaa). */
interface Filters {
  from: string
  to: string
  household: string
  action: string
}

/** Resumo dos detalhes: nas alterações, os campos que mudaram; no resto, os valores simples. */
function detailsSummary(action: string, details: Record<string, unknown> | null): string {
  if (!details) return ''
  if (action === 'update') return `Campos: ${Object.keys(details).join(', ')}`
  return Object.entries(details)
    .filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ')
    .slice(0, 300)
}

export function AuditPage() {
  const today = dateInBrazil()
  const [filters, setFilters] = useState<Filters>({ from: isoToBrDate(daysBefore(today, 30)), to: isoToBrDate(today), household: '', action: '' })
  const [query, setQuery] = useState<Filters>(() => ({ ...filters, from: daysBefore(today, 30), to: today }))
  const [families, setFamilies] = useState<FamilyOverviewRow[]>([])
  const [trail, setTrail] = useState<{ query: Filters; result: AuditTrail } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    rpc<FamilyOverviewRow[]>('families_overview', {})
      .then((r) => !cancelled && setFamilies(r))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    rpc<AuditTrail>('audit_trail', {
      p_from: query.from,
      p_to: query.to,
      p_household: query.household || null,
      p_action: query.action || null,
      p_limit: LIMIT,
    })
      .then((r) => {
        if (cancelled) return
        setFailure(null)
        setTrail({ query, result: r })
      })
      .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [query])

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const result = trail?.query === query ? trail.result : null
  const actions = [...new Set([...(trail?.result.actions ?? []), ...(filters.action ? [filters.action] : [])])].sort()

  return (
    <>
      <PageTitle title="Auditoria" />
      <p className="-mt-4 mb-4 max-w-3xl text-sm text-muted-foreground">
        Quem fez o quê, dos mais recentes aos mais antigos, no horário de Brasília. Mostra até {LIMIT} registros por consulta; a consulta também fica
        registrada.
      </p>
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const from = parseBrDate(filters.from)
              const to = parseBrDate(filters.to)
              if (!from || !to) {
                setFailure('Use as datas no formato dd/mm/aaaa.')
                return
              }
              setQuery({ ...filters, from, to })
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="de">De</Label>
              <Input id="de" inputMode="numeric" placeholder="dd/mm/aaaa" value={filters.from} onChange={(e) => set({ from: e.target.value })} className="w-36" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" inputMode="numeric" placeholder="dd/mm/aaaa" value={filters.to} onChange={(e) => set({ to: e.target.value })} className="w-36" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="familia">Família</Label>
              <Select id="familia" value={filters.household} onChange={(e) => set({ household: e.target.value })} className="w-56">
                <option value="">Todas</option>
                {families.map((f) => (
                  <option key={f.household_id} value={f.household_id}>
                    {f.code} {f.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acao">Ação</Label>
              <Select id="acao" value={filters.action} onChange={(e) => set({ action: e.target.value })} className="w-64">
                <option value="">Todas</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {auditActionLabel(a, null)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">
              <Search />
              Consultar
            </Button>
          </form>
        </CardContent>
      </Card>
      {failure ? <Alert tone="error">{failure}</Alert> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Quem</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Família</TableHead>
            <TableHead>Detalhes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(result?.rows ?? []).map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{dateTimeInBrazil(r.at)}</TableCell>
              <TableCell className="max-w-48 truncate" title={r.actor_email ?? undefined}>
                {r.actor_email ?? <span className="text-muted-foreground">sistema</span>}
              </TableCell>
              <TableCell>{auditActionLabel(r.action, r.target_table)}</TableCell>
              <TableCell className="whitespace-nowrap">{r.household_code ?? '—'}</TableCell>
              <TableCell className="max-w-md text-xs text-muted-foreground">
                {r.details ? (
                  <details>
                    <summary className="cursor-pointer">{detailsSummary(r.action, r.details) || 'Ver detalhes'}</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">{JSON.stringify(r.details, null, 2).slice(0, 4000)}</pre>
                  </details>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
          {(result?.rows.length ?? 0) === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                {result ? 'Nenhum registro no período.' : 'Carregando…'}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {result && result.rows.length === LIMIT ? (
        <p className="mt-2 text-sm text-muted-foreground">Há mais registros no período: estreite as datas, a família ou a ação.</p>
      ) : null}
    </>
  )
}
