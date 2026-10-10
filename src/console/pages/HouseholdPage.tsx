// Página da família (SPEC, "Console interno": "Cadastro e plano"): o cadastro (só a gestão muda), o editor do plano
// (a gestão, ou o responsável nas suas famílias AI) e as versões do plano. Em /familias/nova, só o cadastro; depois
// de criada, a família abre aqui com o plano em branco.

import { ArrowLeft } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useForm, useWatch, type FieldPath } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import type { HouseholdEditorData, PlanOptions, SavedPlanVersion, SaveResult } from '../../lib/apiTypes.ts'
import { formatMonthLabel } from '../../lib/format.ts'
import { parseDecimalBr, parseIntBr } from '../../lib/planForm.ts'
import { errorText, rpc } from '../api.ts'
import { CHANNEL_LABELS, plural } from '../display.ts'
import { PlanEditor } from '../plan/PlanEditor.tsx'
import { useSession } from '../session.tsx'
import { PageTitle } from '../Shell.tsx'
import { Alert } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Button } from '../ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.tsx'
import { Input, Select } from '../ui/input.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx'

interface RegistrationForm {
  code: string
  name: string
  channel: 'cadm' | 'ai'
  banker_id: string
  owner_id: string
  intermediary: string
  profile_id: string
  suitability: string
  /** Custo anual em % (0,80 = 0,80% ao ano). */
  fee_pct: string
  horizon_age: string
  seed: string
  status: 'ativa' | 'encerrada'
}

const pctText = (fraction: number) => (fraction * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })

function F({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

function Registration(props: { data: HouseholdEditorData | null; options: PlanOptions; canEdit: boolean; onSaved: (id: string, created: boolean) => void }) {
  const h = props.data?.household
  const { register, handleSubmit, setError, control, formState } = useForm<RegistrationForm>({
    defaultValues: h
      ? {
          code: h.code,
          name: h.name,
          channel: h.channel,
          banker_id: h.banker_id ?? '',
          owner_id: h.owner_id ?? '',
          intermediary: h.intermediary ?? '',
          profile_id: h.profile_id,
          suitability: h.suitability ?? '',
          fee_pct: pctText(h.fee_rate),
          horizon_age: String(h.horizon_age),
          seed: String(h.seed),
          status: h.status,
        }
      : { code: '', name: '', channel: 'cadm', banker_id: '', owner_id: '', intermediary: '', profile_id: 'moderado', suitability: '', fee_pct: '0,8', horizon_age: '95', seed: '', status: 'ativa' },
  })
  const [failure, setFailure] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const channel = useWatch({ control, name: 'channel' })
  const err = (k: keyof RegistrationForm) => formState.errors[k]?.message
  const seedLocked = props.data?.has_runs ?? false

  const submit = async (v: RegistrationForm) => {
    setBusy(true)
    setFailure(null)
    setMessage(null)
    try {
      // Campos desabilitados (o canal na edição, a semente fixa) não vêm no envio: valem os do cadastro.
      const ch = h?.channel ?? v.channel
      const seed = v.seed ?? ''
      const fee = parseDecimalBr(v.fee_pct)
      const fields = {
        code: v.code,
        name: v.name,
        channel: ch,
        banker_id: ch === 'cadm' ? v.banker_id : '',
        owner_id: ch === 'ai' ? v.owner_id : '',
        intermediary: v.intermediary,
        profile_id: v.profile_id,
        suitability: v.suitability,
        fee_rate: fee === undefined || Number.isNaN(fee) ? null : Math.round(fee * 1e4) / 1e6,
        horizon_age: parseIntBr(v.horizon_age) ?? null,
        ...(seed.trim() === '' ? {} : { seed: parseIntBr(seed) ?? null }),
        status: v.status,
      }
      const r = await rpc<SaveResult<{ household_id: string; code: string }>>('save_household', { p_household: h?.id ?? null, p_fields: fields })
      if (!r.ok) {
        for (const issue of r.errors) {
          const field = (issue.path === 'fee_rate' ? 'fee_pct' : issue.path) as FieldPath<RegistrationForm>
          setError(field, { type: 'server', message: issue.message })
        }
        setFailure('O cadastro não foi gravado: veja os campos marcados.')
        return
      }
      setMessage(h ? 'Cadastro atualizado.' : `Família ${r.code} cadastrada.`)
      props.onSaved(r.household_id, !h)
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(submit)(e)} noValidate className="flex flex-col gap-4">
      <fieldset disabled={!props.canEdit || busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <F label="Código" error={err('code')} hint="Como nas planilhas do custodiante, sem CPF.">
          <Input aria-label="Código" {...register('code')} />
        </F>
        <F label="Nome" error={err('name')}>
          <Input aria-label="Nome da família" {...register('name')} />
        </F>
        <F label="Canal" error={err('channel')} hint={h ? 'O canal não muda depois do cadastro.' : undefined}>
          <Select aria-label="Canal" disabled={Boolean(h)} {...register('channel')}>
            <option value="cadm">CADM (carteira administrada)</option>
            <option value="ai">AI (assessoria de investimentos)</option>
          </Select>
        </F>
        {channel === 'cadm' ? (
          <F label="Banker" error={err('banker_id')}>
            <Select aria-label="Banker" {...register('banker_id')}>
              <option value="">{h?.banker_email ?? 'A definir'}</option>
              {props.options.bankers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.email}
                </option>
              ))}
            </Select>
          </F>
        ) : (
          <F label="Responsável" error={err('owner_id')}>
            <Select aria-label="Responsável" {...register('owner_id')}>
              <option value="">{h?.owner_email ?? 'A definir'}</option>
              {props.options.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.email}
                </option>
              ))}
            </Select>
          </F>
        )}
        <F label="Intermediário" error={err('intermediary')}>
          <Input aria-label="Intermediário" {...register('intermediary')} />
        </F>
        <F label={channel === 'cadm' ? 'Perfil (pesos-alvo)' : 'Perfil de referência'} error={err('profile_id')} hint={channel === 'ai' ? 'Na AI, os pesos vêm da carteira atual.' : undefined}>
          <Select aria-label="Perfil" {...register('profile_id')}>
            {props.options.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </F>
        <F label="Suitability" error={err('suitability')}>
          <Select aria-label="Suitability" {...register('suitability')}>
            <option value="">A definir</option>
            {props.options.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </F>
        <F label="Custo anual (% ao ano)" error={err('fee_pct')}>
          <Input inputMode="decimal" aria-label="Custo anual" {...register('fee_pct')} />
        </F>
        <F label="Idade-limite do horizonte" error={err('horizon_age')}>
          <Input inputMode="numeric" aria-label="Idade-limite" {...register('horizon_age')} />
        </F>
        <F
          label="Semente"
          error={err('seed')}
          hint={seedLocked ? 'Fixa: a família já tem rodada (os sorteios são os mesmos todos os meses).' : h ? undefined : 'Em branco, o banco sorteia.'}
        >
          <Input inputMode="numeric" aria-label="Semente" disabled={seedLocked} {...register('seed')} />
        </F>
        {h ? (
          <F label="Situação" error={err('status')}>
            <Select aria-label="Situação" {...register('status')}>
              <option value="ativa">Ativa</option>
              <option value="encerrada">Encerrada</option>
            </Select>
          </F>
        ) : null}
      </fieldset>
      {props.canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {h ? 'Gravar cadastro' : 'Cadastrar família'}
          </Button>
          {failure ? <Alert tone="error">{failure}</Alert> : null}
          {message ? <Alert tone="success">{message}</Alert> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Só a gestão muda o cadastro.</p>
      )}
    </form>
  )
}

export function HouseholdPage() {
  const { id = '' } = useParams()
  const isNew = id === 'nova'
  const navigate = useNavigate()
  const session = useSession()
  const [data, setData] = useState<HouseholdEditorData | null>(null)
  const [options, setOptions] = useState<PlanOptions | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    rpc<PlanOptions>('plan_options')
      .then((o) => !cancelled && setOptions(o))
      .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    if (!isNew) {
      rpc<HouseholdEditorData>('household_editor', { p_household: id })
        .then((d) => !cancelled && setData(d))
        .catch((e: unknown) => !cancelled && setFailure(errorText(e)))
    }
    return () => {
      cancelled = true
    }
  }, [id, isNew, version])

  const reload = () => setVersion((v) => v + 1)
  const h = data?.household
  const title = isNew ? 'Nova família' : h ? `${h.code} · ${h.name}` : 'Família'
  const latest = data?.latest
  const planHidden = latest !== null && latest !== undefined && latest.snapshot === undefined

  const onPlanSaved = (r: SavedPlanVersion) => {
    setSaved(
      `Versão ${r.version} gravada, com mês-base ${formatMonthLabel(r.base_month.slice(0, 7))}.` +
        (r.months_reset > 0 ? ` ${plural(r.months_reset, 'mês voltou', 'meses voltaram')} para importado: confira e rode de novo.` : ''),
    )
    reload()
  }

  return (
    <>
      <PageTitle title={title}>
        <Button variant="outline" asChild>
          <Link to="/familias">
            <ArrowLeft />
            Famílias
          </Link>
        </Button>
      </PageTitle>
      <div className="flex flex-col gap-6">
        {failure ? <Alert tone="error">{failure}</Alert> : null}
        {h ? (
          <div className="flex flex-wrap gap-2">
            <Badge tone="primary">{CHANNEL_LABELS[h.channel]}</Badge>
            <Badge tone={h.status === 'ativa' ? 'green' : 'neutral'}>{h.status === 'ativa' ? 'Ativa' : 'Encerrada'}</Badge>
            {data?.last_closed_month ? <Badge tone="neutral">Último mês fechado: {formatMonthLabel(data.last_closed_month.slice(0, 7))}</Badge> : null}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Cadastro</CardTitle>
            <CardDescription>Canal, responsável ou banker, intermediário, origem dos pesos, suitability, custo e semente.</CardDescription>
          </CardHeader>
          <CardContent>
            {options && (isNew || data) ? (
              <Registration
                key={`${h?.id ?? 'nova'}-${version}`}
                data={data}
                options={options}
                canEdit={isNew ? session.has('gestao') : (data?.can_edit_registration ?? false)}
                onSaved={(newId, created) => (created ? navigate(`/familias/${newId}`) : reload())}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            )}
          </CardContent>
        </Card>

        {!isNew ? (
          <Card>
            <CardHeader>
              <CardTitle>Plano</CardTitle>
              <CardDescription>
                {latest
                  ? `Versão ${latest.version}, com valores em reais de ${formatMonthLabel(latest.base_month.slice(0, 7))}. Gravar cria uma versão nova.`
                  : 'Família sem plano: preencha e grave a primeira versão.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {saved ? <Alert tone="success">{saved}</Alert> : null}
              {data && options ? (
                planHidden ? (
                  <Alert tone="info">Sem permissão para ver os valores em reais: o plano não aparece.</Alert>
                ) : (
                  <PlanEditor
                    key={`${latest?.id ?? 'sem-plano'}-${version}`}
                    householdId={data.household.id}
                    latest={latest?.snapshot ? { version: latest.version, base_month: latest.base_month, snapshot: latest.snapshot } : null}
                    lastClosedMonth={data.last_closed_month}
                    classes={options.classes}
                    canEdit={data.can_edit_plan}
                    onSaved={onPlanSaved}
                  />
                )
              ) : (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {data && data.versions.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Versões do plano</CardTitle>
              <CardDescription>A versão em vigor num mês é a mais recente com mês-base até ele.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Versão</TableHead>
                    <TableHead>Mês-base</TableHead>
                    <TableHead>O que mudou</TableHead>
                    <TableHead>Quem gravou</TableHead>
                    <TableHead className="text-right">Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.versions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.version}</TableCell>
                      <TableCell>{formatMonthLabel(v.base_month.slice(0, 7))}</TableCell>
                      <TableCell>{v.note ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{v.created_by_email ?? 'Carga inicial'}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{new Date(v.created_at).toLocaleString('pt-BR')}</TableCell>
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
