// Como calculamos (SPEC, "6. Como calculamos"): a simulação em linguagem simples, o que significa a chance, o retorno que
// o plano precisa, as premissas em vigor, as limitações, as duas frases do canal (carteira atual rebalanceada uma vez
// por ano; o custo considerado) e o aviso legal completo aprovado pela compliance.

import { formatFrequency, formatPercent, formatProbability } from '../../lib/format.ts'
import { methodologyParagraphs } from '../../report/texts.ts'
import { useClientView } from '../data.ts'
import { ScreenTitle, Section } from '../parts.tsx'

export function ComoCalculamos() {
  const view = useClientView()
  const s = view.snapshot
  const m = s.summary
  return (
    <>
      <ScreenTitle title="Como calculamos" />
      <Section title="A simulação">
        {methodologyParagraphs({ paths: s.run.paths, feeRate: m.feeRate, horizonAge: m.horizonAge }).map((p) => (
          <p key={p} className="mb-2 text-sm">
            {p}
          </p>
        ))}
      </Section>
      <Section title={`O que significa "${formatProbability(m.probability)}"`}>
        <p className="text-sm">
          Em {formatFrequency(m.probability)}, o dinheiro dura até os {m.horizonAge} anos pagando os gastos do plano. Não é uma previsão: é a parte dos
          cenários em que o plano funciona. Quanto mais perto de 100, mais folga.
        </p>
      </Section>
      <Section title="Neste canal">
        <ul className="list-disc pl-5 text-sm">
          <li>A simulação usa a sua carteira atual por classe de ativo, rebalanceada uma vez por ano.</li>
          <li>
            Considera um custo de {formatPercent(m.feeRate, 2)} ao ano sobre a carteira, ainda a validar: as premissas são de índices e não descontam o custo
            dos produtos.
          </li>
          <li>Os números do mês são os da rodada oficial do fechamento. No "E se?", o seu aparelho refaz o cálculo com 5.000 cenários.</li>
        </ul>
      </Section>
      <Section title={`Premissas ${s.assumptions.version}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="pb-1 text-left font-normal">Classe</th>
              <th className="pb-1 text-right font-normal">Rendimento</th>
              <th className="pb-1 text-right font-normal">Oscilação</th>
            </tr>
          </thead>
          <tbody>
            {s.assumptions.classes.map((c) => (
              <tr key={c.code} className="border-t">
                <td className="py-1.5">{c.name}</td>
                <td className="py-1.5 text-right">{formatPercent(c.mu)}</td>
                <td className="py-1.5 text-right">{formatPercent(c.vol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">Rendimento acima da inflação e oscilação por ano, definidos pelo comitê de investimentos.</p>
      </Section>
      <Section title="Limitações">
        <ul className="list-disc pl-5 text-sm">
          <li>As premissas são estimativas de longo prazo; o mercado de verdade pode ser melhor ou pior.</li>
          <li>Impostos e longevidade acima do horizonte ainda não entram na simulação.</li>
          <li>Os valores em reais de hoje supõem que rendas e gastos acompanham a inflação.</li>
        </ul>
      </Section>
      <Section title="Aviso">
        <p className="text-sm text-muted-foreground" data-testid="aviso-completo">
          {view.legal.aviso_completo.body}
        </p>
      </Section>
    </>
  )
}
