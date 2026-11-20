// Plano (SPEC, "5. Plano"): a linha do tempo da família (idades, aposentadoria, eventos e metas), as rendas e os gastos e
// as metas, como estão na versão do plano em vigor no mês. O cliente sugere mudanças; elas vão para o responsável
// confirmar (na etapa 3a, o exemplo não envia nada).

import { useState } from 'react'
import type { CashFlow, PlanEvent, PersonRole } from '../../engine/types.ts'
import { formatMoney, formatMonthLabel } from '../../lib/format.ts'
import { Button } from '../../ui/button.tsx'
import { Textarea } from '../../ui/input.tsx'
import { Alert } from '../../ui/alert.tsx'
import { useClientView } from '../data.ts'
import { Footer, ScreenTitle, Section } from '../parts.tsx'

const ROLE: Record<PersonRole, string> = { titular: 'Titular', conjuge: 'Cônjuge', filho: 'Filho ou filha' }
const INCOME_KINDS: CashFlow['kind'][] = ['renda', 'dividendos', 'aluguel']

const ageAt = (birthDate: string, month: string) => {
  const [by, bm] = birthDate.split('-').map(Number)
  const [y, m] = month.split('-').map(Number)
  return Math.floor((y * 12 + m - (by * 12 + bm)) / 12)
}

function eventText(e: PlanEvent): string {
  const value = `${e.direction === 'entrada' ? '+' : '−'}${formatMoney(e.amountReal)}`
  if (e.recurrence === 'anual') return `${value} por ano, de ${e.year} a ${e.endYear ?? e.year}`
  if (e.recurrence === 'a_cada_n') return `${value} a cada ${e.everyN} anos, de ${e.year} a ${e.endYear ?? e.year}`
  return `${value} em ${e.month ? formatMonthLabel(`${e.year}-${String(e.month).padStart(2, '0')}`) : e.year}`
}

const SUGGESTION_MAX = 1000

export function Plano() {
  const view = useClientView()
  const plan = view.pkg.planVersion.snapshot
  const month = view.snapshot.refMonth
  const titular = plan.people.find((p) => p.role === 'titular')
  const retirementYear = titular?.retirementAge !== undefined ? Number(titular.birthDate.slice(0, 4)) + titular.retirementAge : null
  const milestones = [
    ...(titular && retirementYear !== null ? [{ year: retirementYear, text: `Aposentadoria de ${titular.name.split(' ')[0]} (aos ${titular.retirementAge})` }] : []),
    ...plan.events.map((e) => ({ year: e.year, text: `${e.name}: ${eventText(e)}` })),
  ].sort((a, b) => a.year - b.year)
  const incomes = plan.cashFlows.filter((f) => INCOME_KINDS.includes(f.kind))
  const expenses = plan.cashFlows.filter((f) => !INCOME_KINDS.includes(f.kind))
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)

  return (
    <>
      <ScreenTitle title="Plano">Versão do plano em vigor em {formatMonthLabel(month)}, revisada em {formatMonthLabel(view.snapshot.planVersion.baseMonth)}.</ScreenTitle>
      <Section title="Família">
        <ul className="divide-y text-sm">
          {plan.people.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 py-2">
              <span>
                {p.name}
                <span className="block text-xs text-muted-foreground">{ROLE[p.role]}</span>
              </span>
              <span className="text-right whitespace-nowrap">
                {ageAt(p.birthDate, month)} anos
                {p.retirementAge !== undefined ? <span className="block text-xs text-muted-foreground">aposenta aos {p.retirementAge}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Linha do tempo">
        <ol className="relative ml-2 border-l pl-4 text-sm">
          {milestones.map((m) => (
            <li key={m.text} className="mb-3">
              <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-primary" aria-hidden />
              <span className="font-medium">{m.year}</span> · {m.text}
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Rendas e gastos">
        <h3 className="mb-1 text-sm font-medium">Rendas</h3>
        <ul className="mb-3 divide-y text-sm">
          {incomes.map((f) => (
            <li key={f.name} className="flex justify-between gap-2 py-1.5">
              <span>
                {f.name}
                <span className="block text-xs text-muted-foreground">
                  de {f.startYear} a {f.endYear}
                </span>
              </span>
              <span className="whitespace-nowrap">{formatMoney(f.annualAmountReal / 12)} por mês</span>
            </li>
          ))}
        </ul>
        <h3 className="mb-1 text-sm font-medium">Gastos</h3>
        <ul className="divide-y text-sm">
          {expenses.map((f) => (
            <li key={f.name} className="flex justify-between gap-2 py-1.5">
              <span>
                {f.name}
                <span className="block text-xs text-muted-foreground">
                  de {f.startYear} a {f.endYear}
                </span>
              </span>
              <span className="whitespace-nowrap">{formatMoney(f.annualAmountReal / 12)} por mês</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Em valores de hoje, corrigidos pela inflação.</p>
      </Section>
      <Section title="Metas">
        <ul className="list-disc pl-5 text-sm">
          {plan.goals.map((g, i) =>
            g.kind === 'padrao_de_vida' ? (
              <li key={i}>
                Manter o padrão de vida até os {g.targetAge} anos
                {g.personId ? ` (${plan.people.find((p) => p.id === g.personId)?.name.split(' ')[0] ?? ''})` : ''}
              </li>
            ) : (
              <li key={i}>Deixar um legado mínimo de {formatMoney(plan.legacyMin ?? g.amount ?? 0)}</li>
            ),
          )}
        </ul>
      </Section>
      <Section title="Algo mudou na vida da família?">
        {sent ? (
          <Alert tone="success">
            {view.example
              ? 'No exemplo, a sugestão não é enviada. Com a sua conta, ela vai para o seu assessor, que confirma a mudança no plano.'
              : 'Sugestão enviada ao seu assessor. Ele confirma a mudança no plano.'}
          </Alert>
        ) : open ? (
          <div className="flex flex-col gap-2">
            <Textarea
              aria-label="Sugestão de mudança no plano"
              value={text}
              maxLength={SUGGESTION_MAX}
              rows={4}
              onChange={(e) => setText(e.target.value)}
              placeholder="Por exemplo: a faculdade da Laura vai começar um ano antes."
            />
            <div className="flex gap-2">
              <Button disabled={text.trim().length < 5} onClick={() => setSent(true)}>
                Enviar ao assessor
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted-foreground">Sugira a mudança; o seu assessor confirma antes de ela entrar no plano.</p>
            <Button variant="outline" onClick={() => setOpen(true)}>
              Sugerir uma mudança
            </Button>
          </>
        )}
      </Section>
      <Footer />
    </>
  )
}
