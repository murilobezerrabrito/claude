// Visão geral (SPEC, "2. Visão geral"): responde em cinco segundos "meu plano continua de pé?". A chance em destaque com
// a faixa e a variação do mês pelo maior fator da ponte, o retorno que o plano precisa com a margem de segurança, a
// trajetória por idade e a frase de leitura. Os números são os da rodada oficial do mês fechado.

import { formatFrequency, formatProbability, formatRealReturn, monthYearName } from '../../lib/format.ts'
import { bridgeHeadline, medianSentence, readingSentence, slackSentence } from '../../report/texts.ts'
import { useClientView } from '../data.ts'
import { BandBadge, Footer, Section, Term } from '../parts.tsx'
import { TrajectoryChart } from '../TrajectoryChart.tsx'

export function VisaoGeral() {
  const view = useClientView()
  const s = view.snapshot
  const m = s.summary
  const t = s.trajectory
  const reading = readingSentence({ probability: m.probability, horizonAge: m.horizonAge, depletionAge: m.depletionAge, band: m.band, channel: 'app' })
  const median = medianSentence({ horizonAge: m.horizonAge, medianFinal: m.medianFinal })
  return (
    <>
      <p className="mb-1 text-sm text-muted-foreground">Números de {monthYearName(s.refMonth)}</p>
      <Section testId="chance">
        <p className="text-sm text-muted-foreground">
          <Term explain="A parte dos milhares de cenários simulados em que o dinheiro dura até o fim do horizonte, pagando os gastos do plano.">
            Chance de o plano dar certo
          </Term>
        </p>
        <div className="mt-1 flex items-end gap-3">
          <p className="font-serif text-6xl leading-none font-semibold" data-testid="probabilidade">
            {formatProbability(m.probability)}
          </p>
          <div className="pb-1">
            <BandBadge band={m.band} />
          </div>
        </div>
        <p className="mt-2 text-sm">{formatFrequency(m.probability)}</p>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="variacao">
          {s.bridge.kind === 'ponte' ? bridgeHeadline(s.bridge) : 'Primeiro mês do acompanhamento.'}
        </p>
      </Section>

      <Section>
        <p className="text-sm text-muted-foreground">
          <Term explain="O menor rendimento acima da inflação, igual em todos os anos, que paga o plano inteiro e deixa o legado mínimo. É o seu benchmark pessoal.">
            Retorno que o seu plano precisa
          </Term>
        </p>
        <p className="mt-1 font-serif text-2xl font-semibold">
          {m.requiredReturnStatus === 'ok' && m.requiredReturn !== null
            ? `Sua carteira precisa render ${formatRealReturn(m.requiredReturn)}`
            : m.requiredReturnStatus === 'folga_total'
              ? 'Folga total'
              : 'Plano inviável sem ajustes'}
        </p>
        <p className="mt-2 text-sm">
          <Term explain="A diferença entre o que a carteira atual deve render, já descontado o custo, e o que o plano precisa.">Margem de segurança</Term>:{' '}
          {slackSentence({ expectedReturn: m.expectedCompositeReturn, requiredReturn: m.requiredReturn, status: m.requiredReturnStatus })}
        </p>
      </Section>

      <Section title="Trajetória do patrimônio">
        <TrajectoryChart
          fan={{ ages: t.pointAges, years: t.years, ...t.percentiles }}
          markers={t.markers}
          label={`Patrimônio financeiro por idade, em valores de hoje. ${median} ${reading}`}
        />
        <p className="mt-3 text-sm" data-testid="leitura">
          {median} {reading}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Faixa clara: do cenário ruim ao bom. Linha grossa: cenário do meio. Linha vermelha: cenário ruim. Em valores de hoje.
        </p>
      </Section>
      <Footer />
    </>
  )
}
