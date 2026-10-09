// Mapeamento de ativos (SPEC, "Mapeamento de ativos (comitê)"): ativo sem classe bloqueia a família até o comitê dar
// a classe. A sugestão pelo ISIN ou pelo CNPJ nunca é aplicada sozinha (D-050). Gestão e compliance só acompanham.

import { useEffect, useState } from 'react'
import type { MappingQueue } from '../../lib/apiTypes.ts'
import { errorText, rpc } from '../api.ts'
import { plural } from '../display.ts'
import { useSession } from '../session.tsx'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Button } from '../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx'
import { Select } from '../ui/input.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx'

export function MappingPage() {
  const session = useSession()
  const isComite = session.has('comite')
  const [queue, setQueue] = useState<MappingQueue | null>(null)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    rpc<MappingQueue>('unmapped_assets')
      .then((r) => !cancelled && setQueue(r))
      .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [version])

  const map = async (assetId: string, code: string, classCode: string) => {
    setBusy(true)
    setFailure(null)
    setMessage(null)
    try {
      const r = await rpc<{ months_reset: number }>('map_asset', { p_asset: assetId, p_class_code: classCode })
      setMessage(
        `${code} agora é ${classCode}.${r.months_reset > 0 ? ` ${plural(r.months_reset, 'mês voltou', 'meses voltaram')} para a conferência.` : ''}`,
      )
      setVersion((v) => v + 1)
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageTitle title="Mapeamento de ativos" />
      <Card>
        <CardHeader>
          <CardTitle>Fila do comitê</CardTitle>
          <CardDescription>
            Cada ativo novo entra sem classe e bloqueia a família até receber uma. A classe precisa existir nas premissas vigentes. Mapear reabre a
            conferência dos meses ainda não fechados.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {failure ? <Alert tone="error">{failure}</Alert> : null}
          {message ? <Alert tone="success">{message}</Alert> : null}
          {!isComite ? <Alert>Só o comitê dá a classe; aqui você acompanha a fila.</Alert> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ativo</TableHead>
                <TableHead>ISIN / CNPJ</TableHead>
                <TableHead>Moeda</TableHead>
                <TableHead className="text-right">Famílias esperando</TableHead>
                <TableHead>Classe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue?.assets.map((a) => {
                const selected = choice[a.id] ?? a.suggestion?.class_code ?? ''
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <span className="font-medium">{a.asset_code}</span>
                      <br />
                      <span className="text-muted-foreground">{a.name}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{[a.isin, a.cnpj].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell>{a.currency}</TableCell>
                    <TableCell className="text-right">{a.families_waiting}</TableCell>
                    <TableCell>
                      {isComite ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            aria-label={`Classe de ${a.asset_code}`}
                            value={selected}
                            onChange={(e) => setChoice((c) => ({ ...c, [a.id]: e.target.value }))}
                          >
                            <option value="">Escolha</option>
                            {queue.classes.map((c) => (
                              <option key={c.class_code} value={c.class_code}>
                                {c.class_code} · {c.name}
                              </option>
                            ))}
                          </Select>
                          <Button size="sm" disabled={busy || selected === ''} onClick={() => void map(a.id, a.asset_code, selected)}>
                            Mapear
                          </Button>
                        </div>
                      ) : null}
                      {a.suggestion ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Sugestão: {a.suggestion.class_code}, como {a.suggestion.asset_code} (mesmo {a.suggestion.by.toUpperCase()})
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
              {queue && queue.assets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Nenhum ativo sem classe.
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
