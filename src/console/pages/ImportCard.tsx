// Importação do mês (SPEC, "Importação mensal das posições"): o arquivo é lido e validado no navegador (src/import),
// o banco faz a sua prévia, e só a confirmação grava, tudo ou nada. A planilha original vai para a pasta privada.

import { Upload } from 'lucide-react'
import { useState } from 'react'
import {
  flowsToRpc,
  officialPlToRpc,
  positionsToRpc,
  readFlows,
  readOfficialPl,
  readPositions,
  type ImportIssue,
} from '../../import/index.ts'
import type { ImportConfirmResult, ImportPreviewResult, OfficialPlResult } from '../../lib/apiTypes.ts'
import { readSheetFile } from '../../lib/planilhas.ts'
import { archiveSheet, errorText, rpc, storageName } from '../api.ts'
import { byCurrency, CHANNEL_LABELS, money, plural } from '../display.ts'
import { Alert } from '../ui/alert.tsx'
import { Button } from '../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx'
import { Input, Select } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx'

type Kind = 'posicoes' | 'movimentos' | 'pl'
type Preview = Extract<ImportPreviewResult, { ok: true }>

/** Limite de upload do SPEC ("Segurança"). */
const MAX_BYTES = 10 * 1024 * 1024

const KIND_LABELS: Record<Kind, string> = { posicoes: 'Posições por ativo', movimentos: 'Aportes e resgates', pl: 'PL oficial por família' }

function Issues({ title, issues }: { title: string; issues: ImportIssue[] }) {
  if (issues.length === 0) return null
  return (
    <div>
      <p className="mb-1 font-medium">{title}</p>
      <ul className="list-disc pl-5">
        {issues.map((i, k) => (
          <li key={k}>
            {i.line === undefined ? '' : `Linha ${i.line}: `}
            {i.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ImportCard({ onImported }: { onImported: (refDate: string) => void }) {
  const [kind, setKind] = useState<Kind>('posicoes')
  const [file, setFile] = useState<File | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const [errors, setErrors] = useState<ImportIssue[]>([])
  const [warnings, setWarnings] = useState<ImportIssue[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setFile(null)
    setInputKey((k) => k + 1)
    setPreview(null)
    setErrors([])
    setWarnings([])
  }

  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    setFailure(null)
    setMessage(null)
    try {
      await action()
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const read = () =>
    act(async () => {
      setErrors([])
      setWarnings([])
      setPreview(null)
      if (!file) return
      if (file.size > MAX_BYTES) throw new Error('O arquivo passa de 10 MB.')
      const sheet = readSheetFile(file.name, new Uint8Array(await file.arrayBuffer()))
      if (kind === 'pl') {
        const r = readOfficialPl(sheet)
        setWarnings(r.warnings)
        if (!r.ok) return setErrors(r.errors)
        await archiveSheet(`${r.refDate}/pl/${Date.now()}-${storageName(file.name)}`, file)
        const saved = await rpc<OfficialPlResult>('set_official_pl', { p_rows: officialPlToRpc(r.rows) })
        if (!saved.ok) return setErrors(saved.errors)
        setMessage(`PL oficial gravado: ${plural(saved.families, 'família', 'famílias')}, ${saved.changed} com valor novo.`)
        reset()
        onImported(r.refDate)
        return
      }
      let rows: unknown[]
      if (kind === 'posicoes') {
        const r = readPositions(sheet)
        setWarnings(r.warnings)
        if (!r.ok) return setErrors(r.errors)
        rows = positionsToRpc(r.rows)
      } else {
        const r = readFlows(sheet)
        setWarnings(r.warnings)
        if (!r.ok) return setErrors(r.errors)
        rows = flowsToRpc(r.rows)
      }
      const p = await rpc<ImportPreviewResult>('import_preview', { p_kind: kind, p_file_name: file.name, p_rows: rows })
      if (!p.ok) return setErrors(p.errors)
      setPreview(p)
    })

  const confirm = () =>
    act(async () => {
      if (!preview || !file) return
      await archiveSheet(`${preview.ref_date}/${preview.batch_id}/${storageName(file.name)}`, file)
      const done = await rpc<ImportConfirmResult>('import_confirm', { p_batch: preview.batch_id })
      setMessage(
        `Importação confirmada: ${plural(done.rows, 'linha gravada', 'linhas gravadas')}, ${plural(done.replaced, 'substituída', 'substituídas')}, ${plural(done.new_assets, 'ativo novo', 'ativos novos')}. Confira o mês.`,
      )
      const refDate = preview.ref_date
      reset()
      onImported(refDate)
    })

  const discard = () =>
    act(async () => {
      if (!preview) return
      await rpc('import_discard', { p_batch: preview.batch_id })
      setMessage('Prévia descartada; nada foi gravado.')
      reset()
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar</CardTitle>
        <CardDescription>
          CSV de até 10 MB, no modelo do SPEC (veja os exemplos em src/data/importacao). Primeiro vem a prévia; só a confirmação grava, tudo ou nada.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tipo">Planilha</Label>
            <Select id="tipo" value={kind} onChange={(e) => (setKind(e.target.value as Kind), reset())} disabled={busy || preview !== null}>
              {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-64 flex-1 flex-col gap-2">
            <Label htmlFor="arquivo">Arquivo</Label>
            <Input
              key={inputKey}
              id="arquivo"
              type="file"
              accept=".csv,.txt,.xlsx"
              disabled={busy || preview !== null}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button onClick={read} disabled={!file || busy || preview !== null}>
            <Upload /> {kind === 'pl' ? 'Gravar PL' : 'Ver prévia'}
          </Button>
        </div>

        {failure ? <Alert tone="error">{failure}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}
        {errors.length > 0 ? (
          <Alert tone="error">
            <Issues title="Arquivo recusado; nada foi gravado." issues={errors} />
          </Alert>
        ) : null}
        {warnings.length > 0 || (preview?.warnings.length ?? 0) > 0 ? (
          <Alert tone="warning">
            <Issues title="Avisos" issues={[...warnings, ...(preview?.warnings ?? [])]} />
          </Alert>
        ) : null}

        {preview ? (
          <div className="flex flex-col gap-3 rounded-md border p-4">
            <p className="text-sm">
              Prévia de <strong>{preview.file_name}</strong>: {plural(preview.rows, 'linha', 'linhas')} com data de referência {preview.ref_date.split('-').reverse().join('/')}.
              {preview.kind === 'posicoes' ? ` Total em reais: ${money(preview.total_value)}.` : ''}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Família</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead className="text-right">{preview.kind === 'posicoes' ? 'Valor líquido' : 'Aportes / resgates'}</TableHead>
                  <TableHead className="text-right">Substitui</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.families.map((f) => (
                  <TableRow key={f.household_id}>
                    <TableCell>
                      <span className="font-medium">{f.code}</span> {f.name}
                    </TableCell>
                    <TableCell>{CHANNEL_LABELS[f.channel]}</TableCell>
                    <TableCell className="text-right">{f.rows}</TableCell>
                    <TableCell className="text-right">
                      {preview.kind === 'posicoes' ? byCurrency(f.net_by_currency) : `${byCurrency(f.contributions)} / ${byCurrency(f.withdrawals)}`}
                    </TableCell>
                    <TableCell className="text-right">{f.replaces > 0 ? plural(f.replaces, 'linha', 'linhas') : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.new_assets.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {plural(preview.new_assets.length, 'ativo novo entra', 'ativos novos entram')} sem classe, na fila do comitê: {preview.new_assets.map((a) => a.asset_code).join(', ')}.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button onClick={confirm} disabled={busy}>
                Confirmar importação
              </Button>
              <Button variant="outline" onClick={discard} disabled={busy}>
                Descartar
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
