// Cenários da conversa do mês (página 6 do relatório): os gravados no rascunho, com a chance contra a do plano oficial,
// e o formulário de um cenário novo. O navegador confere as mudanças com a mesma regra do servidor e mostra o nome
// automático; o servidor confere de novo e roda as 10.000 trajetórias com os sorteios da rodada oficial.

import { LoaderCircle, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { StoredReportScenario } from '../../lib/apiTypes.ts'
import { formatPp, formatProbability, formatRealReturn } from '../../lib/format.ts'
import { MAX_REPORT_SCENARIOS, MAX_SCENARIO_CHANGES, SHOCK_PRESETS, scenarioIssues, scenarioName, type ReportScenarioParams, type ScenarioContext } from '../../report/scenarios.ts'
import {
  availableKinds,
  CHANGE_LABELS,
  issuesByRow,
  kindAllowed,
  newChange,
  planHint,
  scenarioFromChanges,
  SHOCK_OPTIONS,
  SPENDING_OPTIONS,
  type ChangeKind,
  type ScenarioChange,
} from '../scenarioForm.ts'
import { Button } from '../../ui/button.tsx'
import { Input, Select } from '../../ui/input.tsx'

const MONTH_OPTIONS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Retorno que o plano precisa no cenário, como na página 6. */
function requiredText(s: Pick<StoredReportScenario, 'requiredReturn' | 'requiredReturnStatus'>): string {
  if (s.requiredReturnStatus === 'folga_total') return 'folga total'
  if (s.requiredReturnStatus === 'inviavel' || s.requiredReturn === null) return 'inviável sem ajustes'
  return formatRealReturn(s.requiredReturn)
}

export function ScenarioList(props: {
  scenarios: StoredReportScenario[]
  planProbability: number
  canRemove: boolean
  busy: boolean
  onRemove: (s: StoredReportScenario) => void
}) {
  if (props.scenarios.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum cenário. A página 6 mostra só o plano oficial do mês.</p>
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Cenários do relatório">
      {props.scenarios.map((s) => (
        <li key={s.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm" data-testid="cenario">
          <div className="min-w-0">
            <p className="font-medium">{s.name}</p>
            <p className="text-muted-foreground">
              Chance {formatProbability(s.probability)} ({formatPp(s.probability - props.planProbability, 0)} contra o plano) · retorno que o plano precisa:{' '}
              {requiredText(s)}
            </p>
          </div>
          {props.canRemove ? (
            <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onRemove(s)} aria-label={`Tirar o cenário ${s.name}`}>
              Tirar
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Um cenário novo: até três mudanças, conferidas no navegador antes de ir ao servidor. */
export function ScenarioBuilder(props: {
  ctx: ScenarioContext
  existing: StoredReportScenario[]
  busy: boolean
  onRun: (params: ReportScenarioParams) => Promise<boolean>
}) {
  const kinds = availableKinds(props.ctx)
  const [changes, setChanges] = useState<ScenarioChange[]>([])
  const [running, setRunning] = useState(false)
  const full = props.existing.length >= MAX_REPORT_SCENARIOS

  const { params, rowOf } = scenarioFromChanges(changes)
  const issues = changes.length === 0 ? [] : scenarioIssues(params, props.ctx)
  const { rows, general } = issuesByRow(issues, rowOf)
  const name = changes.length > 0 && issues.length === 0 ? scenarioName(params, props.ctx) : null
  const repeated = name !== null && props.existing.some((s) => s.name === name)

  const update = (i: number, patch: Partial<ScenarioChange>) => setChanges((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const setKind = (i: number, kind: ChangeKind) => setChanges((cs) => cs.map((c, j) => (j === i ? newChange(kind, props.ctx) : c)))
  const add = () => {
    const kind = kinds.find((k) => kindAllowed(k, changes))
    if (kind) setChanges((cs) => [...cs, newChange(kind, props.ctx)])
  }
  const run = async () => {
    setRunning(true)
    try {
      if (await props.onRun(params)) setChanges([])
    } finally {
      setRunning(false)
    }
  }

  if (full) return <p className="text-sm text-muted-foreground">O relatório já tem três cenários. Para outro, tire um deles.</p>

  return (
    <div className="flex flex-col gap-3" aria-label="Cenário novo">
      {changes.map((c, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border p-3" data-testid="mudanca">
          <div className="flex items-center gap-2">
            <Select aria-label={`Tipo da mudança ${i + 1}`} value={c.kind} onChange={(e) => setKind(i, e.target.value as ChangeKind)} className="min-w-0 flex-1">
              {kinds.map((k) => (
                <option key={k} value={k} disabled={!kindAllowed(k, changes, i)}>
                  {CHANGE_LABELS[k]}
                </option>
              ))}
            </Select>
            <Button size="icon" variant="ghost" onClick={() => setChanges((cs) => cs.filter((_, j) => j !== i))} aria-label={`Tirar a mudança ${i + 1}`}>
              <X />
            </Button>
          </div>
          <ChangeFields change={c} ctx={props.ctx} onChange={(patch) => update(i, patch)} />
          {planHint(c, props.ctx) ? <p className="text-xs text-muted-foreground">{planHint(c, props.ctx)}</p> : null}
          {rows.get(i)?.map((m) => (
            <p key={m} className="text-xs text-destructive">
              {m}
            </p>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={add} disabled={changes.length >= MAX_SCENARIO_CHANGES || running}>
          <Plus />
          {changes.length === 0 ? 'Montar um cenário' : 'Mais uma mudança'}
        </Button>
        {changes.length > 0 ? (
          <Button size="sm" onClick={() => void run()} disabled={issues.length > 0 || repeated || running || props.busy}>
            {running ? <LoaderCircle className="animate-spin" /> : null}
            {running ? 'Rodando 10.000 trajetórias…' : 'Rodar o cenário'}
          </Button>
        ) : null}
      </div>
      {general.map((m) => (
        <p key={m} className="text-xs text-destructive">
          {m}
        </p>
      ))}
      {name ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Nome no relatório: </span>
          {name}
          {repeated ? <span className="text-destructive"> (já está no relatório)</span> : null}
        </p>
      ) : null}
    </div>
  )
}

/** Os campos de uma mudança, conforme o tipo. */
function ChangeFields({ change: c, ctx, onChange }: { change: ScenarioChange; ctx: ScenarioContext; onChange: (patch: Partial<ScenarioChange>) => void }) {
  const label = CHANGE_LABELS[c.kind]
  switch (c.kind) {
    case 'retirementAge':
    case 'horizonAge':
      return (
        <Input
          aria-label={c.kind === 'retirementAge' ? 'Nova idade de aposentadoria' : 'Novo horizonte (idade)'}
          inputMode="numeric"
          placeholder={String(c.kind === 'retirementAge' ? (ctx.planRetirementAge ?? '') : ctx.horizonAge)}
          value={c.value}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      )
    case 'essentialMonthly':
    case 'lifestyleMonthly':
      return (
        <Input
          aria-label={`Novo ${label.toLowerCase()} (R$)`}
          inputMode="decimal"
          placeholder="Valor em reais por mês"
          value={c.value}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      )
    case 'spendingMultiplier':
      return (
        <Select aria-label="Gasto total em relação ao plano" value={c.value} onChange={(e) => onChange({ value: e.target.value })}>
          {SPENDING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )
    case 'income':
      return (
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Renda" value={c.target} onChange={(e) => onChange({ target: e.target.value })}>
            {ctx.incomes.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name}
              </option>
            ))}
          </Select>
          <Input aria-label="Nova renda mensal (R$)" inputMode="decimal" placeholder="Valor por mês" value={c.value} onChange={(e) => onChange({ value: e.target.value })} />
        </div>
      )
    case 'extraFlow':
      return (
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Aporte ou resgate" value={c.target} onChange={(e) => onChange({ target: e.target.value })}>
            <option value="aporte">Aporte</option>
            <option value="resgate">Resgate</option>
          </Select>
          <Input aria-label="Valor (R$)" inputMode="decimal" placeholder="Valor" value={c.value} onChange={(e) => onChange({ value: e.target.value })} />
          <Select aria-label="Mês" value={c.month} onChange={(e) => onChange({ month: e.target.value })}>
            {MONTH_OPTIONS.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </Select>
          <Input aria-label="Ano" inputMode="numeric" value={c.year} onChange={(e) => onChange({ year: e.target.value })} />
        </div>
      )
    case 'propertySale':
      return (
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Imóvel" value={c.target} onChange={(e) => onChange({ target: e.target.value })}>
            {ctx.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Input aria-label="Ano da venda" inputMode="numeric" value={c.year} onChange={(e) => onChange({ year: e.target.value })} />
        </div>
      )
    case 'firstYearShock':
      return (
        <Select aria-label="Choque no 1º ano" value={c.value} onChange={(e) => onChange({ value: e.target.value })}>
          {SHOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )
    case 'shockPreset':
      return (
        <Select aria-label="Cenário pronto de choque" value={c.target} onChange={(e) => onChange({ target: e.target.value })}>
          {SHOCK_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )
    case 'rulesEnabled':
      return (
        <Select aria-label="Ajustes de gasto em anos ruins" value={c.target} onChange={(e) => onChange({ target: e.target.value })}>
          <option value="com">Com ajustes de gasto em anos ruins</option>
          <option value="sem">Sem ajustes de gasto</option>
        </Select>
      )
  }
}
