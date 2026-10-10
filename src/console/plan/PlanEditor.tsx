// Editor do plano (SPEC, "Console interno": "Cadastro e plano"): pessoas, renda e gastos, eventos com mês, bens
// declarados, metas e regras de gasto flexível. Valida com o esquema do plano (o mesmo das entradas do motor) antes de
// pedir a confirmação; o banco confere de novo e devolve os problemas por campo. Cada gravação é uma versão nova, com
// mês-base.

import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { get, useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form'
import type { SavedPlanVersion, SaveResult } from '../../lib/apiTypes.ts'
import { formatMonthLabel, monthName } from '../../lib/format.ts'
import { emptyPlanForm, formToSnapshot, snapshotToForm, type PlanForm } from '../../lib/planForm.ts'
import { brazilToday, planSnapshotSchema } from '../../lib/planSchema.ts'
import { cn } from '../../lib/utils.ts'
import type { PlanSnapshot } from '../../report/types.ts'
import { errorText, rpc } from '../api.ts'
import { Alert } from '../ui/alert.tsx'
import { Button } from '../ui/button.tsx'
import { ConfirmDialog } from '../ui/dialog.tsx'
import { Input, Select } from '../ui/input.tsx'
import { allowedBaseMonths } from './baseMonths.ts'
import { describeIssue, planFormPath, planFormResolver } from './formErrors.ts'

const newId = () => crypto.randomUUID().slice(0, 8)
const today = () => brazilToday()

const KINDS_CASH = { renda: 'Renda do trabalho', dividendos: 'Dividendos', aluguel: 'Aluguel', gasto_essencial: 'Gasto essencial', gasto_estilo: 'Gasto de estilo de vida' }
const KINDS_ASSET = { imovel: 'Imóvel', empresa: 'Empresa', previdencia: 'Previdência', exterior: 'No exterior' }
const ROLES = { titular: 'Titular', conjuge: 'Cônjuge', filho: 'Filho ou filha' }
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(`2026-${String(i + 1).padStart(2, '0')}`) }))

/** Campo com rótulo visível e a mensagem de erro logo abaixo. */
function F({ label, error, className, children }: { label: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  )
}

function Section({ title, description, error, onAdd, addLabel, children }: { title: string; description?: string; error?: string; onAdd?: () => void; addLabel?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border p-4">
      <legend className="px-1 font-medium">{title}</legend>
      {description ? <p className="-mt-1 text-xs text-muted-foreground">{description}</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {children}
      {onAdd ? (
        <div>
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus />
            {addLabel}
          </Button>
        </div>
      ) : null}
    </fieldset>
  )
}

function Row({ children, onRemove, removeLabel }: { children: ReactNode; onRemove?: () => void; removeLabel: string }) {
  return (
    <div className="flex items-start gap-2 border-t pt-3 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">{children}</div>
      {onRemove ? (
        <Button size="icon" variant="ghost" className="mt-5" onClick={onRemove} aria-label={removeLabel} title={removeLabel}>
          <Trash2 />
        </Button>
      ) : null}
    </div>
  )
}

export interface PlanEditorProps {
  householdId: string
  /** A versão mais recente (null: família sem plano). */
  latest: { version: number; base_month: string; snapshot: PlanSnapshot } | null
  lastClosedMonth: string | null
  classes: { class_code: string; name: string }[]
  canEdit: boolean
  onSaved: (saved: SavedPlanVersion) => void
}

export function PlanEditor(props: PlanEditorProps) {
  const classCodes = useMemo(() => props.classes.map((c) => c.class_code), [props.classes])
  const form = useForm<PlanForm>({
    defaultValues: props.latest ? snapshotToForm(props.latest.snapshot) : emptyPlanForm(newId),
    resolver: planFormResolver({ classes: classCodes }),
  })
  const { register, control, handleSubmit, setError, formState } = form
  const errors = formState.errors
  const err = (path: string): string | undefined => get(errors, path)?.message
  const people = useFieldArray({ control, name: 'people' })
  const assets = useFieldArray({ control, name: 'otherAssets' })
  const flows = useFieldArray({ control, name: 'cashFlows' })
  const events = useFieldArray({ control, name: 'events' })
  const goals = useFieldArray({ control, name: 'goals' })
  const watchedPeople = useWatch({ control, name: 'people' })
  const watchedAssets = useWatch({ control, name: 'otherAssets' })
  const watchedEvents = useWatch({ control, name: 'events' })

  const months = useMemo(
    () => allowedBaseMonths({ lastClosedMonth: props.lastClosedMonth, latestBaseMonth: props.latest?.base_month ?? null, today: today() }),
    [props.lastClosedMonth, props.latest],
  )
  const [baseMonth, setBaseMonth] = useState(months[0] ?? '')
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [pending, setPending] = useState<PlanSnapshot | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [serverIssues, setServerIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const replacing = props.latest !== null && props.latest.base_month.slice(0, 7) === baseMonth
  const nextVersion = (props.latest?.version ?? 0) + 1

  const onValid = (values: PlanForm) => {
    setFailure(null)
    setServerIssues([])
    if (note.trim() === '') {
      setNoteError('Diga em poucas palavras o que mudou.')
      return
    }
    setNoteError(null)
    setPending(planSnapshotSchema({ classes: classCodes }).parse(formToSnapshot(values)))
  }

  const save = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const r = await rpc<SaveResult<SavedPlanVersion>>('save_plan_version', { p_household: props.householdId, p_base_month: `${baseMonth}-01`, p_snapshot: pending, p_note: note.trim() })
      if (!r.ok) {
        // Cada problema no campo dele, quando há campo, e todos na lista da recusa (nenhum fica sem aparecer).
        const lifeGoals = form.getValues('goals').length
        for (const issue of r.errors) {
          if (issue.path === 'note') setNoteError(issue.message)
          else setError(planFormPath(issue.path, lifeGoals) as FieldPath<PlanForm>, { type: 'server', message: issue.message })
        }
        setServerIssues(r.errors.filter((i) => i.path !== 'note').map(describeIssue))
        setFailure('O banco recusou a versão:')
        return
      }
      setNote('')
      props.onSaved(r)
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  const ro = !props.canEdit
  const ageInput = (name: FieldPath<PlanForm>, label: string) => <Input inputMode="numeric" aria-label={label} {...register(name)} />

  return (
    <form onSubmit={(e) => void handleSubmit(onValid)(e)} noValidate className="flex flex-col gap-4">
      <fieldset disabled={ro || busy} className="flex flex-col gap-4">
        {err('root.server') ? <Alert tone="error">{err('root.server')}</Alert> : null}

        <Section
          title="Pessoas"
          description="O horizonte vai até o membro mais jovem do casal completar a idade-limite do cadastro."
          error={err('people.root')}
          onAdd={ro ? undefined : () => people.append({ id: newId(), name: '', birthDate: '', sex: '', role: 'filho', retirementAge: '' })}
          addLabel="Adicionar pessoa"
        >
          {people.fields.map((f, i) => (
            <Row key={f.id} onRemove={ro ? undefined : () => people.remove(i)} removeLabel={`Remover a pessoa ${i + 1}`}>
              <F label="Nome" error={err(`people.${i}.name`)} className="col-span-2">
                <Input aria-label={`Nome da pessoa ${i + 1}`} {...register(`people.${i}.name`)} />
              </F>
              <F label="Nascimento" error={err(`people.${i}.birthDate`)}>
                <Input inputMode="numeric" placeholder="dd/mm/aaaa" aria-label={`Nascimento da pessoa ${i + 1}`} {...register(`people.${i}.birthDate`)} />
              </F>
              <F label="Sexo" error={err(`people.${i}.sex`)}>
                <Select aria-label={`Sexo da pessoa ${i + 1}`} {...register(`people.${i}.sex`)}>
                  <option value="">—</option>
                  <option value="F">Feminino</option>
                  <option value="M">Masculino</option>
                </Select>
              </F>
              <F label="Papel" error={err(`people.${i}.role`)}>
                <Select aria-label={`Papel da pessoa ${i + 1}`} {...register(`people.${i}.role`)}>
                  {Object.entries(ROLES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </F>
              <F label="Aposentadoria (idade)" error={err(`people.${i}.retirementAge`)}>
                {ageInput(`people.${i}.retirementAge`, `Idade de aposentadoria da pessoa ${i + 1}`)}
              </F>
            </Row>
          ))}
        </Section>

        <Section
          title="Renda e gastos"
          description="Valores anuais em reais do mês-base, sem inflação; de um ano a outro, inclusive."
          error={err('cashFlows.root')}
          onAdd={ro ? undefined : () => flows.append({ kind: 'gasto_essencial', name: '', annualAmountReal: '', startYear: today().slice(0, 4), endYear: '', otherAssetId: '' })}
          addLabel="Adicionar renda ou gasto"
        >
          {flows.fields.map((f, i) => (
            <Row key={f.id} onRemove={ro ? undefined : () => flows.remove(i)} removeLabel={`Remover a renda ou gasto ${i + 1}`}>
              <F label="Tipo" error={err(`cashFlows.${i}.kind`)}>
                <Select aria-label={`Tipo da renda ou gasto ${i + 1}`} {...register(`cashFlows.${i}.kind`)}>
                  {Object.entries(KINDS_CASH).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </F>
              <F label="Nome" error={err(`cashFlows.${i}.name`)} className="col-span-2">
                <Input aria-label={`Nome da renda ou gasto ${i + 1}`} {...register(`cashFlows.${i}.name`)} />
              </F>
              <F label="Valor anual (R$)" error={err(`cashFlows.${i}.annualAmountReal`)}>
                <Input inputMode="decimal" aria-label={`Valor anual da renda ou gasto ${i + 1}`} {...register(`cashFlows.${i}.annualAmountReal`)} />
              </F>
              <F label="De (ano)" error={err(`cashFlows.${i}.startYear`)}>
                <Input inputMode="numeric" aria-label={`Ano de início da renda ou gasto ${i + 1}`} {...register(`cashFlows.${i}.startYear`)} />
              </F>
              <F label="Até (ano)" error={err(`cashFlows.${i}.endYear`)}>
                <Input inputMode="numeric" aria-label={`Ano de fim da renda ou gasto ${i + 1}`} {...register(`cashFlows.${i}.endYear`)} />
              </F>
              <F label="Bem ligado" error={err(`cashFlows.${i}.otherAssetId`)}>
                <Select aria-label={`Bem ligado à renda ou gasto ${i + 1}`} {...register(`cashFlows.${i}.otherAssetId`)}>
                  <option value="">Nenhum</option>
                  {watchedAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || 'Bem sem nome'}
                    </option>
                  ))}
                </Select>
              </F>
            </Row>
          ))}
        </Section>

        <Section
          title="Eventos"
          description="Entradas e saídas pontuais ou recorrentes, em reais do mês-base. Sem mês, o evento entra em julho."
          error={err('events.root')}
          onAdd={ro ? undefined : () => events.append({ name: '', direction: 'saida', amountReal: '', year: '', month: '', recurrence: 'unica', everyN: '', endYear: '' })}
          addLabel="Adicionar evento"
        >
          {events.fields.map((f, i) => {
            const recurrence = watchedEvents[i]?.recurrence ?? 'unica'
            return (
              <Row key={f.id} onRemove={ro ? undefined : () => events.remove(i)} removeLabel={`Remover o evento ${i + 1}`}>
                <F label="Nome" error={err(`events.${i}.name`)} className="col-span-2">
                  <Input aria-label={`Nome do evento ${i + 1}`} {...register(`events.${i}.name`)} />
                </F>
                <F label="Tipo" error={err(`events.${i}.direction`)}>
                  <Select aria-label={`Tipo do evento ${i + 1}`} {...register(`events.${i}.direction`)}>
                    <option value="saida">Saída</option>
                    <option value="entrada">Entrada</option>
                  </Select>
                </F>
                <F label="Valor (R$)" error={err(`events.${i}.amountReal`)}>
                  <Input inputMode="decimal" aria-label={`Valor do evento ${i + 1}`} {...register(`events.${i}.amountReal`)} />
                </F>
                <F label="Ano" error={err(`events.${i}.year`)}>
                  <Input inputMode="numeric" aria-label={`Ano do evento ${i + 1}`} {...register(`events.${i}.year`)} />
                </F>
                <F label="Mês" error={err(`events.${i}.month`)}>
                  <Select aria-label={`Mês do evento ${i + 1}`} {...register(`events.${i}.month`)}>
                    <option value="">Sem mês (julho)</option>
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </F>
                <F label="Recorrência" error={err(`events.${i}.recurrence`)}>
                  <Select aria-label={`Recorrência do evento ${i + 1}`} {...register(`events.${i}.recurrence`)}>
                    <option value="unica">Uma vez</option>
                    <option value="anual">Todo ano</option>
                    <option value="a_cada_n">A cada N anos</option>
                  </Select>
                </F>
                {recurrence === 'a_cada_n' ? (
                  <F label="A cada (anos)" error={err(`events.${i}.everyN`)}>
                    <Input inputMode="numeric" aria-label={`Intervalo do evento ${i + 1}`} {...register(`events.${i}.everyN`)} />
                  </F>
                ) : null}
                {recurrence !== 'unica' ? (
                  <F label="Até (ano)" error={err(`events.${i}.endYear`)}>
                    <Input inputMode="numeric" aria-label={`Ano de fim do evento ${i + 1}`} {...register(`events.${i}.endYear`)} />
                  </F>
                ) : null}
              </Row>
            )
          })}
        </Section>

        <Section
          title="Bens declarados"
          description="Imóveis, empresa, previdência e bens no exterior. Só entra no patrimônio simulado o que for marcado (ex.: VGBL), com a classe."
          error={err('otherAssets.root')}
          onAdd={ro ? undefined : () => assets.append({ id: newId(), kind: 'imovel', name: '', value: '', annualIncome: '', canBeSold: false, netSaleValue: '', inSimulation: false, classCode: '' })}
          addLabel="Adicionar bem"
        >
          {assets.fields.map((f, i) => {
            const a = watchedAssets[i]
            return (
              <Row key={f.id} onRemove={ro ? undefined : () => assets.remove(i)} removeLabel={`Remover o bem ${i + 1}`}>
                <F label="Tipo" error={err(`otherAssets.${i}.kind`)}>
                  <Select aria-label={`Tipo do bem ${i + 1}`} {...register(`otherAssets.${i}.kind`)}>
                    {Object.entries(KINDS_ASSET).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </F>
                <F label="Nome" error={err(`otherAssets.${i}.name`)} className="col-span-2">
                  <Input aria-label={`Nome do bem ${i + 1}`} {...register(`otherAssets.${i}.name`)} />
                </F>
                <F label="Valor (R$)" error={err(`otherAssets.${i}.value`)}>
                  <Input inputMode="decimal" aria-label={`Valor do bem ${i + 1}`} {...register(`otherAssets.${i}.value`)} />
                </F>
                <F label="Renda anual (R$)" error={err(`otherAssets.${i}.annualIncome`)}>
                  <Input inputMode="decimal" aria-label={`Renda anual do bem ${i + 1}`} {...register(`otherAssets.${i}.annualIncome`)} />
                </F>
                <F label="Venda">
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-primary" {...register(`otherAssets.${i}.canBeSold`)} />
                    Pode ser vendido
                  </label>
                </F>
                {a?.canBeSold ? (
                  <F label="Líquido na venda (R$)" error={err(`otherAssets.${i}.netSaleValue`)}>
                    <Input inputMode="decimal" aria-label={`Valor líquido de venda do bem ${i + 1}`} {...register(`otherAssets.${i}.netSaleValue`)} />
                  </F>
                ) : null}
                <F label="Simulação">
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-primary" {...register(`otherAssets.${i}.inSimulation`)} />
                    Entra no patrimônio
                  </label>
                </F>
                {a?.inSimulation || a?.classCode ? (
                  <F label="Classe" error={err(`otherAssets.${i}.classCode`)}>
                    <Select aria-label={`Classe do bem ${i + 1}`} {...register(`otherAssets.${i}.classCode`)}>
                      <option value="">—</option>
                      {props.classes.map((c) => (
                        <option key={c.class_code} value={c.class_code}>
                          {c.class_code} · {c.name}
                        </option>
                      ))}
                    </Select>
                  </F>
                ) : null}
              </Row>
            )
          })}
        </Section>

        <Section
          title="Metas"
          description="Padrão de vida: até que idade da pessoa o plano precisa se sustentar. Legado: o mínimo a deixar no fim do horizonte."
          error={err('goals.root')}
          onAdd={ro ? undefined : () => goals.append({ personId: '', targetAge: '95' })}
          addLabel="Adicionar meta de padrão de vida"
        >
          <div className="grid grid-cols-2 gap-3 sm:max-w-xs sm:grid-cols-1">
            <F label="Legado mínimo (R$)" error={err('legacyMin')}>
              <Input inputMode="decimal" aria-label="Legado mínimo" {...register('legacyMin')} />
            </F>
          </div>
          {goals.fields.map((f, i) => (
            <Row key={f.id} onRemove={ro ? undefined : () => goals.remove(i)} removeLabel={`Remover a meta ${i + 1}`}>
              <F label="Pessoa" error={err(`goals.${i}.personId`)} className="col-span-2">
                <Select aria-label={`Pessoa da meta ${i + 1}`} {...register(`goals.${i}.personId`)}>
                  <option value="">—</option>
                  {watchedPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || 'Pessoa sem nome'}
                    </option>
                  ))}
                </Select>
              </F>
              <F label="Até a idade" error={err(`goals.${i}.targetAge`)}>
                {ageInput(`goals.${i}.targetAge`, `Idade da meta ${i + 1}`)}
              </F>
            </Row>
          ))}
        </Section>

        <Section title="Regras de gasto flexível" description="Só o estilo de vida, a partir da aposentadoria. Percentuais sobre a referência e sobre o estilo de vida inicial.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
            <F label="Situação">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" {...register('rules.enabled')} />
                Regras ligadas
              </label>
            </F>
            <F label="Modo" error={err('rules.mode')} className="col-span-2">
              <Select aria-label="Modo das regras" {...register('rules.mode')}>
                <option value="trajetoria_referencia">Trajetória de referência</option>
                <option value="guyton_klinger">Guyton-Klinger</option>
              </Select>
            </F>
            {(
              [
                ['lower', 'Gatilho inferior (%)'],
                ['upper', 'Gatilho superior (%)'],
                ['cut', 'Corte (%)'],
                ['raise', 'Aumento (%)'],
                ['floor', 'Piso (%)'],
                ['cap', 'Teto (%)'],
              ] as const
            ).map(([k, label]) => (
              <F key={k} label={label} error={err(`rules.${k}`)}>
                <Input inputMode="decimal" aria-label={label} {...register(`rules.${k}`)} />
              </F>
            ))}
            <F label="Últimos anos sem corte" error={err('rules.noCutLastYears')}>
              <Input inputMode="numeric" aria-label="Últimos anos sem corte" {...register('rules.noCutLastYears')} />
            </F>
          </div>
        </Section>
      </fieldset>

      {ro ? (
        <p className="text-sm text-muted-foreground">Só a gestão, ou o responsável pela família AI, muda o plano.</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <F label="Mês-base dos valores">
              <Select aria-label="Mês-base" value={baseMonth} onChange={(e) => setBaseMonth(e.target.value)} disabled={busy || months.length === 0}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthName(m)} de {m.slice(0, 4)}
                  </option>
                ))}
              </Select>
            </F>
            <F label="O que mudou" error={noteError ?? undefined} className="min-w-64 flex-1">
              <Input aria-label="O que mudou" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} disabled={busy} />
            </F>
            <Button type="submit" disabled={busy || months.length === 0}>
              Gravar versão {nextVersion}
            </Button>
          </div>
          {months.length === 0 ? <Alert tone="warning">O mês de hoje já está fechado para esta família: o plano novo espera o mês seguinte.</Alert> : null}
          {Object.keys(errors).length > 0 && !failure ? <Alert tone="error">Corrija os campos marcados antes de gravar.</Alert> : null}
          {failure ? (
            <Alert tone="error">
              {failure}
              {serverIssues.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {serverIssues.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !busy && setPending(null)}
        title={`Gravar a versão ${nextVersion} do plano?`}
        description={
          <>
            Os valores ficam em reais de {baseMonth ? formatMonthLabel(baseMonth) : '—'} e valem a partir desse mês.
            {replacing ? ` Ela substitui a versão ${props.latest?.version}, do mesmo mês-base; a anterior fica na auditoria.` : ''} Os meses a partir de{' '}
            {baseMonth ? formatMonthLabel(baseMonth) : '—'} que já foram conferidos ou rodados voltam para importado, para conferir e rodar de novo com o plano novo.
          </>
        }
        confirmLabel="Gravar versão"
        onConfirm={() => void save()}
      />
    </form>
  )
}
