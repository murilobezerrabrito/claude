// Famílias por canal (SPEC, "Console interno"). Nesta etapa, o cadastro de cada família; a chance atual, a variação
// no mês, a folga e o selo da faixa chegam com a rodada oficial (etapa 3b). A lista vem de list_households, que
// confere o papel e registra a leitura.

import { useEffect, useState } from 'react'
import type { Channel, HouseholdRow } from '../../lib/apiTypes.ts'
import { errorText, rpc } from '../api.ts'
import { CHANNEL_LABELS } from '../display.ts'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Card, CardContent } from '../ui/card.tsx'
import { Select } from '../ui/input.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx'

export function FamiliesPage() {
  const [channel, setChannel] = useState<Channel | ''>('')
  const [rows, setRows] = useState<HouseholdRow[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    rpc<HouseholdRow[]>('list_households', channel ? { p_channel: channel } : {})
      .then((r) => !cancelled && setRows(r))
      .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [channel])

  return (
    <>
      <PageTitle title="Famílias">
        <label className="flex items-center gap-2 text-sm">
          Canal
          <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel | '')}>
            <option value="">Todos</option>
            <option value="cadm">CADM</option>
            <option value="ai">AI</option>
          </Select>
        </label>
      </PageTitle>
      {failure ? <Alert tone="error">{failure}</Alert> : null}
      <Card>
        <CardContent className="pt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Família</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Suitability</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows?.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.code}</TableCell>
                  <TableCell>{h.name}</TableCell>
                  <TableCell>{CHANNEL_LABELS[h.channel]}</TableCell>
                  <TableCell>{h.weights_source === 'perfil' ? h.profile_id : 'Carteira atual'}</TableCell>
                  <TableCell>{h.suitability ?? '—'}</TableCell>
                  <TableCell>
                    <Badge tone={h.status === 'ativa' ? 'green' : 'neutral'}>{h.status === 'ativa' ? 'Ativa' : 'Encerrada'}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {rows && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Nenhuma família visível para você.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <p className="mt-4 text-xs text-muted-foreground">A chance, a variação no mês, a folga e o selo da faixa aparecem aqui depois da rodada oficial.</p>
        </CardContent>
      </Card>
    </>
  )
}
