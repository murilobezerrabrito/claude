// E se? (SPEC, "3. E se?" e "Controles"): os controles do plano (sem perfil: só a carteira atual, D-071), os cenários
// prontos em botões, o recálculo 250 ms depois de soltar o controle, com indicador, e sempre a diferença para o plano
// oficial ("59% → 47%"): a chance oficial é a da rodada do mês, e a diferença sai do aparelho, cenário menos plano, os
// dois com 5.000 trajetórias e os mesmos sorteios. Até três cenários salvos lado a lado, o gasto sustentável sob demanda
// e "Voltar ao plano oficial". Os cenários salvos ficam na conta do cliente (no exemplo, só nesta tela; D-075).

import { LoaderCircle, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatAge, formatMoney, formatMonthLabel, formatPercent, formatPp, formatProbability, formatRealReturn } from '../../lib/format.ts'
import { canonicalJson } from '../../engine/hash.ts'
import { scenarioIssues, scenarioName, SHOCK_PRESETS, type ReportScenarioParams, type ScenarioContext } from '../../report/scenarios.ts'
import { Alert } from '../../ui/alert.tsx'
import { Button } from '../../ui/button.tsx'
import { Input, Select } from '../../ui/input.tsx'
import { fromParams, planValues, presets, ranges, toParams, type ControlValues, type Range } from '../controls.ts'
import { useClientActions } from '../actions.ts'
import { useClientView } from '../data.ts'
import { Footer, ScreenTitle, Section, Term } from '../parts.tsx'
import { TrajectoryChart, type Overlay } from '../TrajectoryChart.tsx'
import type { SavedScenario } from '../types.ts'
import { useWhatIfApi } from '../useWhatIf.ts'
import type { SustainableResult, WhatIfRun } from '../whatIf.ts'

const DEBOUNCE_MS = 250
const MAX_SAVED = 3
/** Cenários salvos na conta (o banco recusa o 21º). */
const MAX_MINE = 20
const SAVED_COLORS = ['var(--band-blue)', 'var(--band-yellow)', 'var(--band-green)']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

interface Saved {
  /** Cenário salvo na conta que está na comparação. */
  id?: string
  name: string
  params: ReportScenarioParams
  run: WhatIfRun
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const requiredText = (r: WhatIfRun) =>
  r.requiredReturnStatus === 'folga_total' ? 'folga total' : r.requiredReturnStatus === 'inviavel' || r.requiredReturn === null ? 'inviável' : formatRealReturn(r.requiredReturn)

export function ESe() {
  const view = useClientView()
  const ctx = view.snapshot.scenarioContext
  const official = view.snapshot.summary.probability
  const { run, sustainable } = useWhatIfApi()
  const [values, setValues] = useState<ControlValues>(() => planValues(ctx))
  const [plan, setPlan] = useState<WhatIfRun | null>(null)
  const [result, setResult] = useState<{ key: string; run: WhatIfRun } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const actions = useClientActions()
  // Na comparação (até 3, nesta tela) e na conta (os salvos, pessoais).
  const [saved, setSaved] = useState<Saved[]>([])
  const [mine, setMine] = useState(view.scenarios)
  const [saveName, setSaveName] = useState<string | null>(null)
  // O que vai ser salvo: as hipóteses e o resultado de quando o formulário abriu (o nome sugerido é o delas).
  const [toSave, setToSave] = useState<{ params: ReportScenarioParams; run: WhatIfRun } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [spending, setSpending] = useState<{ key: string; r: SustainableResult } | 'calculando' | null>(null)

  const params = useMemo(() => toParams(values, ctx), [values, ctx])
  const key = JSON.stringify(params)
  const changed = key !== '{}'
  // O banco devolve as hipóteses com as chaves em outra ordem: a comparação usa a forma canônica.
  const sameAsCurrent = (p: ReportScenarioParams) => canonicalJson(p) === canonicalJson(params)
  const issues = useMemo(() => (Object.keys(params).length === 0 ? [] : scenarioIssues(params, ctx, { maxChanges: Infinity })), [params, ctx])

  useEffect(() => {
    run({})
      .then(setPlan)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [run])

  useEffect(() => {
    if (!changed || issues.length > 0) return
    const timer = setTimeout(() => {
      setError(null)
      run(params)
        .then((r) => setResult({ key, run: r }))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [key, changed, issues.length, params, run])

  const current = changed ? (result?.key === key ? result.run : null) : plan
  const calculating = changed ? current === null && issues.length === 0 : plan === null
  const shown = current && plan ? clamp01(official + (current.probability - plan.probability)) : null
  const set = (patch: Partial<ControlValues>) => setValues((v) => ({ ...v, ...patch }))
  const r = ranges(ctx)
  const name = changed ? scenarioName(params, ctx) : 'Plano oficial'

  const overlays: Overlay[] = [
    ...(changed && plan ? [{ label: 'Plano oficial (meio)', ages: plan.ages, p50: plan.p50, color: 'var(--muted-foreground)', dashed: true }] : []),
    ...saved.map((s, i) => ({ label: s.name, ages: s.run.ages, p50: s.run.p50, color: SAVED_COLORS[i] })),
  ]

  return (
    <>
      <ScreenTitle title="E se?">Mude uma hipótese e veja o efeito. Nada muda no seu plano oficial.</ScreenTitle>
      {error ? <Alert tone="error">Não foi possível calcular: {error}</Alert> : null}

      <Section className="sticky top-[57px] z-10 shadow-sm" testId="resultado">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium" title={name}>
            {name}
          </p>
          {calculating ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> Calculando
            </span>
          ) : null}
        </div>
        <p className="mt-1 font-serif text-4xl font-semibold" data-testid="chance-cenario">
          {formatProbability(official)}
          {changed ? (
            <>
              {' '}
              <span aria-hidden>→</span> <span className="sr-only">vai para</span>{' '}
              {shown !== null ? formatProbability(shown) : '…'}
            </>
          ) : null}
        </p>
        {changed && shown !== null && current && plan ? (
          <p className={`text-sm font-medium ${current.probability >= plan.probability ? 'text-band-green' : 'text-band-red'}`}>
            {formatPp(current.probability - plan.probability, 0)} contra o plano oficial
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Chance oficial de {formatMonthLabel(view.snapshot.refMonth)}</p>
        )}
        {current ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Retorno que o plano precisa: {requiredText(current)} · cenário ruim: {current.depletionAge === null ? `dura até os ${current.horizonAge}` : `acaba aos ${current.depletionAge}`}
          </p>
        ) : null}
        {issues.length > 0 ? <p className="mt-1 text-xs text-destructive">{issues.map((i) => i.message).join(' ')}</p> : null}
      </Section>

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Cenários prontos">
        {presets(ctx).map((p) => (
          <Button key={p.id} size="sm" variant="outline" onClick={() => setValues((v) => p.apply(v))}>
            {p.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={!changed}
          onClick={() => {
            setError(null)
            setValues(planValues(ctx))
          }}
        >
          <RotateCcw /> Voltar ao plano oficial
        </Button>
      </div>

      <Section title="Hipóteses">
        <div className="flex flex-col gap-5">
          {values.retirementAge !== null ? (
            <Slider label="Idade de aposentadoria" range={r.retirementAge} value={values.retirementAge} format={(v) => formatAge(v)} onChange={(v) => set({ retirementAge: v })} />
          ) : null}
          <Slider label="Gasto essencial por mês" range={r.essentialMonthly} value={values.essentialMonthly} format={formatMoney} onChange={(v) => set({ essentialMonthly: v })} />
          <Slider label="Estilo de vida por mês" range={r.lifestyleMonthly} value={values.lifestyleMonthly} format={formatMoney} onChange={(v) => set({ lifestyleMonthly: v })} />
          <Slider
            label="Gasto total em relação ao plano"
            range={{ min: 50, max: 200, step: 5 }}
            value={Math.round(values.spendingMultiplier * 100)}
            format={(v) => `${v}%`}
            onChange={(v) => set({ spendingMultiplier: v / 100 })}
          />
          {ctx.incomes.map((i) => (
            <Slider
              key={i.name}
              label={`${i.name} por mês`}
              range={r.income(i.monthly)}
              value={values.incomes[i.name]}
              format={formatMoney}
              onChange={(v) => set({ incomes: { ...values.incomes, [i.name]: v } })}
            />
          ))}
          <div>
            <Slider
              label="Aporte (+) ou resgate (−) pontual"
              range={r.flowAmount}
              value={values.flowAmount}
              format={(v) => (v === 0 ? 'Nenhum' : `${v > 0 ? 'Aporte de' : 'Resgate de'} ${formatMoney(Math.abs(v))}`)}
              onChange={(v) => set({ flowAmount: v })}
            />
            {values.flowAmount !== 0 ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Select aria-label="Mês do aporte ou resgate" value={values.flowMonth} onChange={(e) => set({ flowMonth: Number(e.target.value) })}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Ano do aporte ou resgate" value={values.flowYear} onChange={(e) => set({ flowYear: Number(e.target.value) })}>
                  {years(r.flowYear).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>
          {ctx.properties.length > 0 ? (
            <Field label="Venda de imóvel">
              <div className="grid grid-cols-2 gap-2">
                <Select
                  aria-label="Imóvel vendido"
                  value={values.saleProperty}
                  onChange={(e) => {
                    // Cada imóvel tem os seus anos de venda possíveis: a venda começa no primeiro.
                    const property = ctx.properties.find((p) => p.id === e.target.value)
                    set({ saleProperty: e.target.value, ...(property ? { saleYear: property.firstYear } : {}) })
                  }}
                >
                  <option value="">Nenhum</option>
                  {ctx.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Ano da venda"
                  disabled={values.saleProperty === ''}
                  value={values.saleYear}
                  onChange={(e) => set({ saleYear: Number(e.target.value) })}
                >
                  {years(saleYears(ctx, values.saleProperty)).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          ) : null}
          <div>
            <Slider
              label="Choque no 1º ano"
              range={{ min: -30, max: 0, step: 5 }}
              value={Math.round(values.shock * 100)}
              format={(v) => (v === 0 ? 'Nenhum' : `${formatPercent(v / 100, 0)}`)}
              onChange={(v) => set({ shock: v / 100, shockPresetId: null })}
            />
            {values.shockPresetId ? (
              <p className="mt-1 flex items-center gap-2 text-xs">
                Cenário pronto: {SHOCK_PRESETS.find((s) => s.id === values.shockPresetId)?.name}
                <button type="button" className="underline" onClick={() => set({ shockPresetId: null })}>
                  tirar
                </button>
              </p>
            ) : null}
          </div>
          <Slider label="Horizonte" range={r.horizonAge} value={values.horizonAge} format={(v) => `até os ${v} anos`} onChange={(v) => set({ horizonAge: v })} />
          <div className="flex items-start justify-between gap-3 text-sm">
            <Term explain="O estilo de vida cai em anos ruins e sobe em anos bons, dentro dos limites do plano.">Ajustes de gasto em anos ruins</Term>
            <input
              type="checkbox"
              aria-label="Ajustes de gasto em anos ruins"
              className="size-5 shrink-0 accent-[var(--primary)]"
              checked={values.rulesEnabled}
              onChange={(e) => set({ rulesEnabled: e.target.checked })}
            />
          </div>
          <p className="text-xs text-muted-foreground">Simulação com a sua carteira atual por classe.</p>
        </div>
      </Section>

      {current ? (
        <Section title="Trajetória do cenário">
          <TrajectoryChart
            fan={{ ages: current.ages, years: current.years, p10: current.p10, p25: current.p25, p50: current.p50, p75: current.p75, p90: current.p90 }}
            overlays={overlays}
            label={`Patrimônio do cenário por idade, em valores de hoje. No cenário do meio, ${current.medianFinal > 0 ? `chega aos ${current.horizonAge} anos com ${formatMoney(current.medianFinal)}` : `não chega aos ${current.horizonAge} anos`}.`}
          />
          <p className="mt-2 text-sm">
            No cenário do meio, {current.medianAt80 !== null ? `aos 80 anos ${formatMoney(current.medianAt80)}; ` : ''}aos {current.horizonAge}, {formatMoney(current.medianFinal)}, em
            valores de hoje.
          </p>
        </Section>
      ) : null}

      <Section title="Comparar cenários">
        {saved.length > 0 && plan ? <Compare plan={plan} official={official} saved={saved} onRemove={(i) => setSaved((s) => s.filter((_, j) => j !== i))} /> : null}
        {saveName === null ? (
          <Button
            variant="outline"
            disabled={!changed || !current || mine.length >= MAX_MINE || mine.some((s) => sameAsCurrent(s.params))}
            onClick={() => {
              if (!current) return
              setSaveError(null)
              setToSave({ params, run: current })
              setSaveName(name)
            }}
          >
            Salvar este cenário
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Input aria-label="Nome do cenário" value={saveName} maxLength={80} onChange={(e) => setSaveName(e.target.value)} />
            <div className="flex gap-2">
              <Button
                disabled={saveName.trim() === '' || !toSave || saving}
                onClick={() => {
                  if (!toSave) return
                  const draft = toSave
                  setSaving(true)
                  setSaveError(null)
                  actions
                    .saveScenario(saveName, draft.params)
                    .then((s) => {
                      setMine((m) => [...m, s])
                      setSaved((c) => (c.length >= MAX_SAVED ? c : [...c, { id: s.id, name: s.name, params: draft.params, run: draft.run }]))
                      setSaveName(null)
                      setToSave(null)
                    })
                    .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)))
                    .finally(() => setSaving(false))
                }}
              >
                Salvar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSaveName(null)
                  setToSave(null)
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {saveError ? (
          <Alert tone="error" className="mt-2">
            {saveError}
          </Alert>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Até {MAX_SAVED} cenários lado a lado, com os mesmos sorteios do plano oficial.
          {view.example ? ' No exemplo, os cenários salvos ficam só nesta tela.' : ` Os cenários salvos ficam na sua conta (até ${MAX_MINE}); só você os vê.`}
        </p>
      </Section>

      {mine.length > 0 ? (
        <MineSection
          mine={mine}
          compared={saved.map((s) => s.id)}
          full={saved.length >= MAX_SAVED}
          onOpen={(s) => setValues(fromParams(s.params, ctx))}
          onCompare={(s) =>
            run(s.params)
              .then((r) => setSaved((c) => (c.length >= MAX_SAVED || c.some((x) => x.id === s.id) ? c : [...c, { id: s.id, name: s.name, params: s.params, run: r }])))
              .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
          }
          onDelete={(s) =>
            actions
              .deleteScenario(s.id)
              .then(() => {
                setMine((m) => m.filter((x) => x.id !== s.id))
                setSaved((c) => c.filter((x) => x.id !== s.id))
              })
              .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
          }
        />
      ) : null}

      <Section title="Quanto posso gastar?">
        <SpendingAnswer state={spending} currentKey={key} />
        <Button
          variant="outline"
          disabled={spending === 'calculando' || issues.length > 0}
          onClick={() => {
            setSpending('calculando')
            sustainable(params)
              .then((res) => setSpending({ key, r: res }))
              .catch((e: unknown) => {
                setSpending(null)
                setError(e instanceof Error ? e.message : String(e))
              })
          }}
        >
          {spending === 'calculando' ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : null}
          {spending === 'calculando' ? 'Calculando…' : changed ? 'Calcular para este cenário' : 'Calcular para o plano'}
        </Button>
      </Section>
      <Footer />
    </>
  )
}

const years = (r: Range) => Array.from({ length: Math.max(0, r.max - r.min + 1) }, (_, i) => r.min + i)

function Field(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm">{props.label}</span>
      {props.children}
    </div>
  )
}

/** Controle deslizante com o campo numérico ao lado (SPEC, "Acessibilidade"); o valor vale ao soltar. */
function Slider(props: { label: string; range: Range; value: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const { min, max, step } = props.range
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? props.value
  const commit = (v: number) => {
    setDraft(null)
    const snapped = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min))
    if (snapped !== props.value) props.onChange(snapped)
  }
  const id = props.label.replace(/\W+/g, '-').toLowerCase()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={`${id}-numero`}>{props.label}</label>
        <span className="font-medium whitespace-nowrap">{props.format(shown)}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={props.label}
          className="min-w-0 flex-1 accent-[var(--primary)]"
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
          onBlur={() => (draft !== null ? commit(draft) : undefined)}
        />
        <Input
          id={`${id}-numero`}
          type="number"
          inputMode="numeric"
          className="w-28 shrink-0 text-right"
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={(e) => setDraft(Number(e.target.value))}
          onBlur={(e) => commit(Number(e.target.value))}
          onKeyDown={(e) => (e.key === 'Enter' ? commit(Number((e.target as HTMLInputElement).value)) : undefined)}
        />
      </div>
    </div>
  )
}

function SpendingAnswer({ state, currentKey }: { state: { key: string; r: SustainableResult } | 'calculando' | null; currentKey: string }) {
  if (state === null || state === 'calculando') {
    return <p className="mb-2 text-sm text-muted-foreground">O maior gasto mensal total com 90% de chance de o plano dar certo, calculado na hora.</p>
  }
  const { r } = state
  const stale = state.key !== currentKey
  const text =
    r.status === 'ok' && r.monthlySpending !== null
      ? `Com ${formatProbability(r.target)} de chance, vocês podem gastar até ${formatMoney(r.monthlySpending)} por mês (hoje, ${formatMoney(r.currentMonthlySpending)}).`
      : r.status === 'abaixo_do_minimo'
        ? `Nem com 30% do gasto de hoje a chance chega a ${formatProbability(r.target)}.`
        : `Mesmo com o triplo do gasto de hoje, a chance fica acima de ${formatProbability(r.target)}.`
  return (
    <p className="mb-2 text-sm" data-testid="gasto-sustentavel">
      {text}
      {stale ? <span className="block text-xs text-muted-foreground">Calculado para as hipóteses anteriores.</span> : null}
    </p>
  )
}

/** Os cenários salvos na conta: abrir nos controles, pôr na comparação ou apagar. O que não cabe mais no mês fica marcado. */
/** Os anos possíveis da venda do imóvel escolhido (sem imóvel escolhido, os do primeiro). */
function saleYears(ctx: ScenarioContext, propertyId: string): Range {
  const property = ctx.properties.find((p) => p.id === propertyId) ?? ctx.properties[0]
  return { min: property.firstYear, max: property.lastYear, step: 1 }
}

function MineSection(props: {
  mine: SavedScenario[]
  compared: (string | undefined)[]
  full: boolean
  onOpen: (s: SavedScenario) => void
  onCompare: (s: SavedScenario) => void
  onDelete: (s: SavedScenario) => void
}) {
  const ctx = useClientView().snapshot.scenarioContext
  return (
    <Section title="Meus cenários" testId="meus-cenarios">
      <ul className="flex flex-col divide-y">
        {props.mine.map((s) => {
          const issues = scenarioIssues(s.params, ctx, { maxChanges: Infinity })
          return (
            <li key={s.id} className="flex flex-col gap-1.5 py-2" data-testid="cenario-salvo">
              <p className="text-sm font-medium">{s.name}</p>
              {issues.length > 0 ? <p className="text-xs text-muted-foreground">Não cabe mais no plano deste mês: {issues.map((i) => i.message).join(' ')}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={issues.length > 0} onClick={() => props.onOpen(s)}>
                  Abrir
                </Button>
                <Button size="sm" variant="outline" disabled={issues.length > 0 || props.full || props.compared.includes(s.id)} onClick={() => props.onCompare(s)}>
                  Comparar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => props.onDelete(s)}>
                  Apagar
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function Compare(props: { plan: WhatIfRun; official: number; saved: Saved[]; onRemove: (i: number) => void }) {
  const cols = [{ name: 'Plano oficial', run: props.plan }, ...props.saved.map((s) => ({ name: s.name, run: s.run }))]
  const chance = (r: WhatIfRun) => formatProbability(clamp01(props.official + (r.probability - props.plan.probability)))
  const rows: [string, (r: WhatIfRun) => string][] = [
    ['Chance', chance],
    ['Retorno que precisa', requiredText],
    ['Meio aos 80 anos', (r) => (r.medianAt80 === null ? '—' : formatMoney(r.medianAt80))],
    ['Meio no fim', (r) => formatMoney(r.medianFinal)],
    ['Acaba no ruim', (r) => (r.depletionAge === null ? 'não acaba' : `aos ${r.depletionAge}`)],
  ]
  return (
    <table className="mb-3 w-full table-fixed text-xs" data-testid="comparacao">
      <thead>
        <tr>
          <th className="w-24 pb-1 text-left font-normal text-muted-foreground" />
          {cols.map((c, i) => (
            <th key={c.name} className="pb-1 text-right align-bottom font-medium">
              <span className="line-clamp-2 break-words">{c.name}</span>
              {i > 0 ? (
                <button type="button" aria-label={`Tirar ${c.name}`} className="ml-auto block text-muted-foreground [&_svg]:size-3.5" onClick={() => props.onRemove(i - 1)}>
                  <X />
                </button>
              ) : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, f]) => (
          <tr key={label} className="border-t">
            <td className="py-1.5 text-muted-foreground">{label}</td>
            {cols.map((c) => (
              <td key={c.name} className="py-1.5 text-right">
                {f(c.run)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
