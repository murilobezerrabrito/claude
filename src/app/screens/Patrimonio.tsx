// Patrimônio (SPEC, "4. Patrimônio"): a carteira na corretora por classe (barras com % e R$, sem alocação-alvo), os
// outros bens declarados, o rendimento real realizado contra o retorno que o plano precisa (o CDI como referência
// secundária) e a data das posições.

import { formatDate, formatMoney, formatMonthLabel, formatPercent, formatSignedPercent } from '../../lib/format.ts'
import type { PeriodReturn } from '../../report/performance.ts'
import { useClientView } from '../data.ts'
import { Footer, ScreenTitle, Section, Term } from '../parts.tsx'

function Period({ label, p }: { label: string; p: PeriodReturn | null }) {
  return (
    <tr className="border-t">
      <td className="py-2">{label}</td>
      <td className="py-2 text-right">{p ? formatSignedPercent(p.real) : '—'}</td>
      <td className="py-2 text-right">{p && p.benchmark !== null ? formatSignedPercent(p.benchmark) : '—'}</td>
      <td className="py-2 text-right text-muted-foreground">{p && p.cdi !== null ? formatSignedPercent(p.cdi) : '—'}</td>
    </tr>
  )
}

export function Patrimonio() {
  const view = useClientView()
  const s = view.snapshot
  const pf = s.portfolio
  const perf = s.performance.summary
  return (
    <>
      <ScreenTitle title="Patrimônio">Posições de {formatDate(s.refDate)}.</ScreenTitle>
      <Section title="Carteira na corretora">
        <p className="mb-3 font-serif text-3xl font-semibold">{formatMoney(pf.total)}</p>
        <ul className="flex flex-col gap-3" aria-label="Carteira por classe">
          {pf.classes.map((c) => (
            <li key={c.code}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span>{c.name}</span>
                <span className="whitespace-nowrap">
                  <span className="font-medium">{formatPercent(c.share)}</span> <span className="text-muted-foreground">· {formatMoney(c.value)}</span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden>
                <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(1, c.share * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Section>
      {pf.otherAssets.length > 0 ? (
        <Section title="Outros bens declarados">
          <ul className="flex flex-col divide-y text-sm">
            {pf.otherAssets.map((a) => (
              <li key={a.name} className="flex justify-between gap-2 py-2">
                <span>
                  {a.name}
                  {a.inSimulation ? <span className="block text-xs text-muted-foreground">Entra na simulação</span> : null}
                </span>
                <span className="whitespace-nowrap">{formatMoney(a.value)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title="Rendimento acima da inflação">
        {perf ? (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="pb-1 text-left font-normal">Período</th>
                  <th className="pb-1 text-right font-normal">Carteira</th>
                  <th className="pb-1 text-right font-normal">
                    <Term explain="O retorno acima da inflação que o plano precisa, acumulado no mesmo período.">Plano precisa</Term>
                  </th>
                  <th className="pb-1 text-right font-normal">CDI</th>
                </tr>
              </thead>
              <tbody>
                <Period label={`No mês (${formatMonthLabel(s.refMonth)})`} p={perf.month} />
                <Period label="No ano" p={perf.yearToDate} />
                <Period label="Em 12 meses" p={perf.twelveMonths} />
                <Period label="Desde o início" p={perf.sinceStart} />
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              Acompanhamento desde {formatMonthLabel(perf.trackingSince)}. Rendimento da carteira descontada a inflação (IPCA); o CDI é só uma
              referência, também descontada a inflação; um traço indica que ainda não há o período inteiro.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">O rendimento aparece a partir do segundo mês do acompanhamento.</p>
        )}
      </Section>
      <Footer />
    </>
  )
}
