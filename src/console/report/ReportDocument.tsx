// Relatório mensal da família CADM (SPEC, "Conteúdo do relatório"): sete páginas em A4 paisagem, geradas por um único
// componente de layout a partir dos números congelados (`ReportSnapshot`). Nada é recalculado aqui.

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import {
  formatAge,
  formatDate,
  formatFrequency,
  formatMoney,
  formatMonthLabel,
  formatPercent,
  formatPp,
  formatProbability,
  formatRealReturn,
  formatSignedPercent,
  formatTenthsPercent,
  formatTenthsPp,
  monthName,
} from '../../lib/format.ts'
import type { PeriodReturn } from '../../report/performance.ts'
import type { ReportSnapshot } from '../../report/snapshot.ts'
import { BAND_LABELS, methodologyParagraphs, stepDescription } from '../../report/texts.ts'
import { BridgeChart, FanChart } from './charts.tsx'
import { BAND_STYLE, COLORS, FONTS } from './theme.ts'

const PAGES = 7
const PAGE_W = 841.89
const MARGIN = 40
const CONTENT_W = PAGE_W - 2 * MARGIN

const s = StyleSheet.create({
  page: { backgroundColor: COLORS.page, paddingTop: 30, paddingBottom: 46, paddingHorizontal: MARGIN, fontFamily: FONTS.body, fontSize: 10, color: COLORS.fg },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.6, borderBottomColor: COLORS.line, paddingBottom: 6, marginBottom: 14 },
  headerText: { fontSize: 8, color: COLORS.muted, letterSpacing: 0.3 },
  title: { fontFamily: FONTS.display, fontSize: 22, fontWeight: 600, color: COLORS.accent },
  question: { fontSize: 10.5, color: COLORS.muted, fontStyle: 'italic', marginTop: 2, marginBottom: 14 },
  footer: { position: 'absolute', left: MARGIN, right: MARGIN, bottom: 18, borderTopWidth: 0.6, borderTopColor: COLORS.line, paddingTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: COLORS.muted, width: CONTENT_W - 190, lineHeight: 1.35 },
  footerRight: { fontSize: 7, color: COLORS.muted, width: 180, textAlign: 'right', lineHeight: 1.35 },
  card: { backgroundColor: COLORS.soft, borderRadius: 4, padding: 16 },
  label: { fontSize: 8.5, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  big: { fontFamily: FONTS.display, fontSize: 64, fontWeight: 600, color: COLORS.fg, lineHeight: 1.05 },
  medium: { fontFamily: FONTS.display, fontSize: 26, fontWeight: 600, color: COLORS.fg },
  body: { fontSize: 10.5, lineHeight: 1.45 },
  small: { fontSize: 8.5, color: COLORS.muted, lineHeight: 1.4 },
  row: { flexDirection: 'row' },
  th: { fontSize: 8, color: COLORS.muted, fontWeight: 500, paddingVertical: 4 },
  td: { fontSize: 9.5, paddingVertical: 4 },
  rule: { borderBottomWidth: 0.6, borderBottomColor: COLORS.line },
})

function Frame(props: { snap: ReportSnapshot; n: number; title: string; question: string; children: ReactNode }) {
  const { snap, n } = props
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <View style={s.header} fixed>
        <Text style={s.headerText}>AWARE OBJECTIVE · {snap.family.name.toUpperCase()}</Text>
        <Text style={s.headerText}>{formatMonthLabel(snap.refMonth)}</Text>
      </View>
      <Text style={s.title}>{props.title}</Text>
      <Text style={s.question}>{props.question}</Text>
      {props.children}
      <Footer snap={snap} n={n} />
    </Page>
  )
}

function Footer(props: { snap: ReportSnapshot; n: number }) {
  const { snap } = props
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{snap.texts.footer}</Text>
      <Text style={s.footerRight}>
        Posições de {formatDate(snap.refDate)}
        {'\n'}Premissas {snap.run.cmaVersion} · página {props.n} de {PAGES}
      </Text>
    </View>
  )
}

function BandBadge(props: { band: ReportSnapshot['summary']['band'] }) {
  const style = BAND_STYLE[props.band]
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: style.soft, borderRadius: 3, paddingVertical: 3, paddingHorizontal: 8, marginTop: 8 }}>
      <Text style={{ color: style.color, fontSize: 9.5, fontWeight: 600 }}>{BAND_LABELS[props.band]}</Text>
    </View>
  )
}

function Cover({ snap }: { snap: ReportSnapshot }) {
  const month = monthName(snap.refMonth)
  return (
    <Page size="A4" orientation="landscape" style={{ ...s.page, paddingTop: 0, paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={{ flexDirection: 'row', height: '100%' }}>
        <View style={{ width: 230, backgroundColor: COLORS.accent, padding: 36, justifyContent: 'space-between' }}>
          <Text style={{ color: '#ffffff', fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: 1 }}>AWARE{'\n'}Investments</Text>
          <Text style={{ color: COLORS.accentSoft, fontSize: 8.5, lineHeight: 1.4 }}>AWARE Objective{'\n'}Carteira administrada</Text>
        </View>
        <View style={{ flex: 1, padding: 56, justifyContent: 'center' }}>
          <View style={{ alignSelf: 'flex-start', borderWidth: 0.8, borderColor: COLORS.warn, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, marginBottom: 22 }}>
            <Text style={{ color: COLORS.warn, fontSize: 8, fontWeight: 600, letterSpacing: 0.5 }}>EXEMPLO COM DADOS FICTÍCIOS</Text>
          </View>
          <Text style={{ ...s.label, marginBottom: 6 }}>Relatório de acompanhamento do plano</Text>
          <Text style={{ fontFamily: FONTS.display, fontSize: 34, fontWeight: 600, color: COLORS.fg }}>{snap.family.name}</Text>
          <Text style={{ fontFamily: FONTS.display, fontSize: 22, color: COLORS.accent, marginTop: 6 }}>
            {month.charAt(0).toUpperCase() + month.slice(1)} de {snap.refMonth.slice(0, 4)}
          </Text>
          <View style={{ marginTop: 34, borderTopWidth: 0.6, borderTopColor: COLORS.line, paddingTop: 14 }}>
            {[
              ['Data das posições', formatDate(snap.refDate)],
              ['Premissas', snap.run.cmaVersion],
              ['Gestor responsável', snap.family.manager],
              ['Preparado por', 'Gestão da Aware Investments'],
            ].map(([k, v]) => (
              <View key={k} style={{ ...s.row, marginBottom: 6 }}>
                <Text style={{ width: 150, color: COLORS.muted, fontSize: 10 }}>{k}</Text>
                <Text style={{ fontSize: 10 }}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={{ position: 'absolute', left: 266, right: MARGIN, bottom: 18 }}>
        <Text style={{ ...s.footerText, width: '100%' }}>{snap.texts.footer}</Text>
      </View>
    </Page>
  )
}

function Summary({ snap }: { snap: ReportSnapshot }) {
  const m = snap.summary
  const prevMonth = snap.bridge.kind === 'ponte' ? formatMonthLabel(snap.bridge.fromMonth) : null
  const variation = snap.bridge.kind === 'ponte' ? snap.bridge.display.endTenths - snap.bridge.display.startTenths : null
  return (
    <Frame snap={snap} n={2} title="Resumo" question="O plano continua de pé?">
      <View style={{ ...s.row, gap: 16 }}>
        <View style={{ ...s.card, flex: 1.1 }}>
          <Text style={s.label}>Chance de o plano dar certo</Text>
          <Text style={{ ...s.big, marginTop: 6 }}>{formatProbability(m.probability)}</Text>
          <Text style={{ fontSize: 11, color: COLORS.muted }}>{formatFrequency(m.probability)}</Text>
          <BandBadge band={m.band} />
          {variation !== null && m.previousProbability !== null && prevMonth ? (
            <Text style={{ ...s.body, marginTop: 10 }}>
              {formatTenthsPp(variation)} desde {prevMonth} ({formatTenthsPercent(snap.bridge.kind === 'ponte' ? snap.bridge.display.startTenths : 0)})
            </Text>
          ) : (
            <Text style={{ ...s.body, marginTop: 10 }}>Primeiro mês do acompanhamento.</Text>
          )}
          {m.probabilityWithRules !== null ? (
            <Text style={{ ...s.small, marginTop: 6 }}>Com ajustes de gasto em anos ruins: {formatProbability(m.probabilityWithRules)}</Text>
          ) : null}
        </View>
        <View style={{ ...s.card, flex: 1 }}>
          <Text style={s.label}>Retorno que o seu plano precisa</Text>
          <Text style={{ ...s.medium, marginTop: 8 }}>{m.requiredReturn === null ? '—' : formatRealReturn(m.requiredReturn)}</Text>
          <View style={{ marginTop: 16, ...s.rule }} />
          {[
            ['Retorno esperado da carteira', formatRealReturn(m.expectedCompositeReturn)],
            ['Margem de segurança', m.slack === null ? '—' : formatPp(m.slack)],
            ['Chance de deixar o legado', m.legacyProbability === null ? '—' : `${formatProbability(m.legacyProbability)} (${formatMoney(m.legacy)})`],
            ['Patrimônio considerado', formatMoney(m.wealth)],
          ].map(([k, v]) => (
            <View key={k} style={{ ...s.row, justifyContent: 'space-between', paddingVertical: 5, ...s.rule }}>
              <Text style={{ fontSize: 10, color: COLORS.muted }}>{k}</Text>
              <Text style={{ fontSize: 10.5, fontWeight: 500 }}>{v}</Text>
            </View>
          ))}
          <Text style={{ ...s.small, marginTop: 10 }}>{snap.texts.slack}</Text>
        </View>
      </View>
      <View style={{ marginTop: 16, borderLeftWidth: 3, borderLeftColor: BAND_STYLE[m.band].color, paddingLeft: 12 }}>
        <Text style={{ ...s.label, marginBottom: 4 }}>Leitura</Text>
        <Text style={{ fontSize: 12, lineHeight: 1.45 }}>{snap.texts.reading}</Text>
        <Text style={{ fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{snap.texts.median}</Text>
      </View>
    </Frame>
  )
}

function WhatChanged({ snap }: { snap: ReportSnapshot }) {
  const b = snap.bridge
  if (b.kind !== 'ponte') {
    return (
      <Frame snap={snap} n={3} title="O que mudou" question="Por que a chance mudou?">
        <Text style={{ fontSize: 13, lineHeight: 1.5 }}>{snap.texts.bridge}</Text>
      </Frame>
    )
  }
  const ctx = {
    nominalReturn: b.monthNominalReturn,
    plannedFlow: b.plannedFlow,
    ipcaMonth: snap.summary.ipcaMonth ?? 0,
    flows: b.externalFlows,
    planBaseMonth: snap.planVersion.baseMonth,
    cmaVersion: snap.run.cmaVersion,
  }
  return (
    <Frame snap={snap} n={3} title="O que mudou" question="Por que a chance mudou?">
      <Text style={{ fontSize: 12.5, lineHeight: 1.45, marginBottom: 10 }}>{snap.texts.bridge}</Text>
      <View style={{ ...s.row, gap: 18 }}>
        <View style={{ width: 430 }}>
          <BridgeChart
            startTenths={b.display.startTenths}
            endTenths={b.display.endTenths}
            bars={b.display.bars}
            fromLabel={formatMonthLabel(b.fromMonth)}
            toLabel={formatMonthLabel(b.toMonth)}
            width={430}
            height={250}
          />
        </View>
        <View style={{ flex: 1 }}>
          {b.display.bars.map((bar) => {
            const step = b.steps.find((x) => x.id === bar.id)
            return (
              <View key={bar.id} style={{ paddingVertical: 4.5, ...s.rule }}>
                <View style={{ ...s.row, justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 9.5, fontWeight: 600 }}>{bar.label}</Text>
                  <Text style={{ fontSize: 9.5, fontWeight: 600, color: bar.noEffect ? COLORS.muted : bar.tenths < 0 ? COLORS.bad : COLORS.good }}>
                    {bar.noEffect ? 'sem efeito' : formatTenthsPp(bar.tenths)}
                  </Text>
                </View>
                <Text style={{ ...s.small, fontSize: 8 }}>
                  {stepDescription(bar.id, ctx)}
                  {step?.requiredReturnDelta ? ` Retorno que o plano precisa: ${formatPp(step.requiredReturnDelta, 2)}` : ''}
                </Text>
              </View>
            )
          })}
        </View>
      </View>
      {snap.texts.benchmark ? <Text style={{ ...s.body, marginTop: 10 }}>{snap.texts.benchmark}</Text> : null}
      <Text style={{ ...s.small, marginTop: 6 }}>{snap.texts.bridgeNote}</Text>
    </Frame>
  )
}

function PerformanceRow(props: { label: string; period: PeriodReturn | null; since: string }) {
  const p = props.period
  const diff = p && p.benchmark !== null ? p.real - p.benchmark : null
  return (
    <View style={{ ...s.row, ...s.rule }}>
      <Text style={{ ...s.td, width: 120 }}>
        {props.label}
        {p?.approximateDates ? '*' : ''}
      </Text>
      <Text style={{ ...s.td, width: 110, textAlign: 'right' }}>{p ? formatSignedPercent(p.real) : '—'}</Text>
      <Text style={{ ...s.td, width: 130, textAlign: 'right' }}>{p && p.benchmark !== null ? formatSignedPercent(p.benchmark) : '—'}</Text>
      <Text style={{ ...s.td, width: 90, textAlign: 'right' }}>{diff === null ? '—' : formatPp(diff)}</Text>
      <Text style={{ ...s.td, flex: 1, paddingLeft: 12, color: COLORS.muted, fontSize: 8 }}>{p ? '' : `acompanhamento desde ${props.since}`}</Text>
    </View>
  )
}

function anyApproximate(perf: ReportSnapshot['performance']['summary']): boolean {
  if (!perf) return false
  return [perf.month, perf.yearToDate, perf.twelveMonths, perf.sinceStart].some((p) => p?.approximateDates === true)
}

function Portfolio({ snap }: { snap: ReportSnapshot }) {
  const perf = snap.performance.summary
  const since = perf ? formatMonthLabel(perf.trackingSince) : formatMonthLabel(snap.refMonth)
  const pf = snap.portfolio
  const maxShare = Math.max(...pf.classes.map((c) => Math.max(c.share, c.target ?? 0)))
  return (
    <Frame snap={snap} n={4} title="Carteira" question="A carteira entrega o que o plano exige?">
      <View style={{ ...s.row, gap: 24 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...s.label, marginBottom: 6 }}>Rendimento acima da inflação</Text>
          <View style={{ ...s.row, ...s.rule }}>
            <Text style={{ ...s.th, width: 120 }}>Período</Text>
            <Text style={{ ...s.th, width: 110, textAlign: 'right' }}>Carteira</Text>
            <Text style={{ ...s.th, width: 130, textAlign: 'right' }}>Retorno que o plano precisa</Text>
            <Text style={{ ...s.th, width: 90, textAlign: 'right' }}>Diferença</Text>
            <Text style={{ ...s.th, flex: 1 }} />
          </View>
          <PerformanceRow label={`No mês (${formatMonthLabel(snap.refMonth)})`} period={perf ? perf.month : null} since={since} />
          <PerformanceRow label="No ano" period={perf ? perf.yearToDate : null} since={since} />
          <PerformanceRow label="Em 12 meses" period={perf ? perf.twelveMonths : null} since={since} />
          <PerformanceRow label="Desde o início" period={perf ? perf.sinceStart : null} since={since} />
          <Text style={{ ...s.small, marginTop: 8 }}>
            Rentabilidade da carteira pelo método de Dietz modificado, com os aportes e resgates do mês, descontada a inflação (IPCA).
            {anyApproximate(perf) ? ' * Datas aproximadas: algum movimento do período entrou sem data e foi contado no meio do mês.' : ''} O CDI, como
            referência secundária, entra com a série do Banco Central na próxima fase.
          </Text>
        </View>
      </View>
      <Text style={{ ...s.label, marginTop: 18, marginBottom: 6 }}>
        Patrimônio por classe{pf.profileName ? ` contra o perfil ${pf.profileName}` : ''} · {formatMoney(pf.total)}
      </Text>
      <View style={{ ...s.row, ...s.rule }}>
        <Text style={{ ...s.th, width: 170 }}>Classe</Text>
        <Text style={{ ...s.th, width: 100, textAlign: 'right' }}>Valor</Text>
        <Text style={{ ...s.th, width: 60, textAlign: 'right' }}>Carteira</Text>
        {pf.profileName ? <Text style={{ ...s.th, width: 60, textAlign: 'right' }}>Perfil</Text> : null}
        <Text style={{ ...s.th, flex: 1, paddingLeft: 16 }} />
      </View>
      {pf.classes.map((c) => (
        <View key={c.code} style={{ ...s.row, alignItems: 'center', ...s.rule }}>
          <Text style={{ ...s.td, width: 170, paddingVertical: 3 }}>{c.name}</Text>
          <Text style={{ ...s.td, width: 100, textAlign: 'right', paddingVertical: 3 }}>{formatMoney(c.value)}</Text>
          <Text style={{ ...s.td, width: 60, textAlign: 'right', paddingVertical: 3 }}>{formatPercent(c.share)}</Text>
          {c.target !== null ? <Text style={{ ...s.td, width: 60, textAlign: 'right', paddingVertical: 3, color: COLORS.muted }}>{formatPercent(c.target, 0)}</Text> : null}
          <View style={{ flex: 1, paddingLeft: 16 }}>
            {/* Barra e marca do perfil na mesma caixa, sem recuo, para usarem a mesma escala. */}
            <View style={{ height: 12, justifyContent: 'center' }}>
              <View style={{ height: 7, width: `${(c.share / maxShare) * 100}%`, backgroundColor: COLORS.accent, borderRadius: 1 }} />
              {c.target !== null ? (
                <View style={{ position: 'absolute', left: `${(c.target / maxShare) * 100}%`, top: 0, width: 1.2, height: 12, marginLeft: -0.6, backgroundColor: COLORS.fg }} />
              ) : null}
            </View>
          </View>
        </View>
      ))}
      <Text style={{ ...s.small, marginTop: 8 }}>
        Outros bens declarados: {pf.otherAssets.map((a) => `${a.name} ${formatMoney(a.value)}${a.inSimulation ? ' (entra na simulação)' : ''}`).join(' · ')}.
      </Text>
    </Frame>
  )
}

function Trajectory({ snap }: { snap: ReportSnapshot }) {
  const t = snap.trajectory
  const legend: [string, string, 'band' | 'line'][] = [
    [COLORS.accentSoft, 'Do cenário ruim ao bom', 'band'],
    [COLORS.band, 'Faixa do meio', 'band'],
    [COLORS.accent, 'Cenário do meio', 'line'],
    [COLORS.bad, 'Cenário ruim', 'line'],
    [COLORS.fg, 'Realizado', 'line'],
  ]
  return (
    <Frame snap={snap} n={5} title="Trajetória" question="Onde a família está e para onde vai?">
      <View style={{ ...s.row, gap: 18 }}>
        <View style={{ width: 520 }}>
          <Text style={{ ...s.small, marginBottom: 2 }}>R$ mi de hoje</Text>
          <FanChart pointAges={t.pointAges} percentiles={t.percentiles} realized={t.realized} markers={t.markers} width={520} height={300} />
          <Text style={{ ...s.small, textAlign: 'center' }}>Idade do membro mais jovem do casal</Text>
        </View>
        <View style={{ flex: 1, paddingTop: 12 }}>
          {legend.map(([color, text, kind]) => (
            <View key={text} style={{ ...s.row, alignItems: 'center', marginBottom: 5 }}>
              <View style={{ width: 16, height: kind === 'band' ? 8 : 2, backgroundColor: color, marginRight: 6 }} />
              <Text style={{ fontSize: 9 }}>{text}</Text>
            </View>
          ))}
          <View style={{ marginTop: 8 }}>
            {t.markers.map((m, i) => (
              <Text key={m.label} style={{ fontSize: 9, marginBottom: 3 }}>
                {i + 1}. {m.label} ({formatAge(Math.floor(m.age + 1e-9))})
              </Text>
            ))}
          </View>
          <Text style={{ ...s.body, marginTop: 12 }}>{snap.texts.median}</Text>
          <Text style={{ ...s.body, marginTop: 6 }}>{snap.texts.reading}</Text>
          <Text style={{ ...s.small, marginTop: 8 }}>
            Patrimônio financeiro simulado (carteira e bens que entram na simulação), em valores de hoje. O realizado vai a reais de{' '}
            {formatMonthLabel(snap.refMonth)} pelo IPCA.
          </Text>
        </View>
      </View>
    </Frame>
  )
}

function Conversation({ snap }: { snap: ReportSnapshot }) {
  const m = snap.summary
  const rows: [string, number, number | null][] = [['Plano oficial do mês', m.probability, m.requiredReturn], ...snap.scenarios.map((x): [string, number, number | null] => [x.name, x.probability, x.requiredReturn])]
  return (
    <Frame snap={snap} n={6} title="Conversa do mês" question="O que discutir?">
      <Text style={{ ...s.label, marginBottom: 6 }}>Cenários "E se?" para a conversa</Text>
      <View style={{ ...s.row, ...s.rule }}>
        <Text style={{ ...s.th, width: 250 }}>Cenário</Text>
        <Text style={{ ...s.th, width: 90, textAlign: 'right' }}>Chance</Text>
        <Text style={{ ...s.th, width: 110, textAlign: 'right' }}>Diferença</Text>
        <Text style={{ ...s.th, width: 170, textAlign: 'right' }}>Retorno que o plano precisa</Text>
      </View>
      {rows.map(([name, p, r], i) => (
        <View key={name} style={{ ...s.row, ...s.rule }}>
          <Text style={{ ...s.td, width: 250, fontWeight: i === 0 ? 600 : 400 }}>{name}</Text>
          <Text style={{ ...s.td, width: 90, textAlign: 'right' }}>{formatProbability(p)}</Text>
          <Text style={{ ...s.td, width: 110, textAlign: 'right', color: COLORS.muted }}>{i === 0 ? '' : formatPp(p - m.probability, 0)}</Text>
          <Text style={{ ...s.td, width: 170, textAlign: 'right' }}>{r === null ? '—' : formatRealReturn(r)}</Text>
        </View>
      ))}
      <Text style={{ ...s.small, marginTop: 6 }}>
        Diferença em pontos percentuais contra o plano oficial do mês, com os mesmos cenários de mercado da rodada oficial; a chance é sem ajustes de gasto em anos ruins.
      </Text>
      <View style={{ ...s.card, marginTop: 18 }}>
        <View style={{ ...s.row, justifyContent: 'space-between' }}>
          <Text style={s.label}>Comentário da gestão</Text>
          {snap.comment.example ? <Text style={{ fontSize: 8, color: COLORS.warn, fontWeight: 600 }}>EXEMPLO</Text> : null}
        </View>
        <Text style={{ ...s.body, marginTop: 6 }}>{snap.comment.text}</Text>
      </View>
      <Text style={{ ...s.label, marginTop: 18, marginBottom: 4 }}>Dados do plano</Text>
      <Text style={s.body}>
        Versão do plano em vigor revisada em {formatMonthLabel(snap.planVersion.baseMonth)}. Mudanças na vida da família (renda, gastos, eventos, metas)
        entram numa nova versão do plano, revisada pela gestão.
      </Text>
    </Frame>
  )
}

function Notes({ snap }: { snap: ReportSnapshot }) {
  const a = snap.assumptions
  return (
    <Frame snap={snap} n={7} title="Notas" question="Como ler os números?">
      <View style={{ ...s.row, gap: 24 }}>
        <View style={{ width: 300 }}>
          <Text style={{ ...s.label, marginBottom: 6 }}>Premissas {a.version}</Text>
          <View style={{ ...s.row, ...s.rule }}>
            <Text style={{ ...s.th, width: 150 }}>Classe</Text>
            <Text style={{ ...s.th, width: 75, textAlign: 'right' }}>Rendimento</Text>
            <Text style={{ ...s.th, width: 75, textAlign: 'right' }}>Oscilação</Text>
          </View>
          {a.classes.map((c) => (
            <View key={c.code} style={{ ...s.row, ...s.rule }}>
              <Text style={{ ...s.td, width: 150, fontSize: 9 }}>{c.name}</Text>
              <Text style={{ ...s.td, width: 75, fontSize: 9, textAlign: 'right' }}>{formatPercent(c.mu)}</Text>
              <Text style={{ ...s.td, width: 75, fontSize: 9, textAlign: 'right' }}>{formatPercent(c.vol)}</Text>
            </View>
          ))}
          <Text style={{ ...s.small, marginTop: 6 }}>
            Rendimento acima da inflação e oscilação por ano, definidos pelo comitê de investimentos. Valores ilustrativos nesta versão.
          </Text>
          <Text style={{ ...s.small, marginTop: 6 }}>
            Cálculo: motor {snap.run.engineVersion}, {snap.run.paths.toLocaleString('pt-BR')} cenários, registro {snap.run.inputsHash}.
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...s.label, marginBottom: 6 }}>Como calculamos</Text>
          {methodologyParagraphs({ paths: snap.run.paths, feeRate: snap.summary.feeRate, horizonAge: snap.summary.horizonAge }).map((p, i) => (
            <Text key={i} style={{ fontSize: 9, lineHeight: 1.45, marginBottom: 5 }}>
              {p}
            </Text>
          ))}
          <Text style={{ ...s.label, marginTop: 8, marginBottom: 4 }}>Aviso</Text>
          <Text style={{ fontSize: 8.5, lineHeight: 1.45, color: COLORS.muted }}>{snap.texts.disclaimer}</Text>
        </View>
      </View>
    </Frame>
  )
}

/** O relatório inteiro: sete páginas a partir dos números congelados do mês. */
export function ReportDocument({ snapshot }: { snapshot: ReportSnapshot }) {
  return (
    <Document
      title={`Relatório de acompanhamento · ${snapshot.family.name} · ${formatMonthLabel(snapshot.refMonth)}`}
      author="Gestão da Aware Investments"
      language="pt-BR"
    >
      <Cover snap={snapshot} />
      <Summary snap={snapshot} />
      <WhatChanged snap={snapshot} />
      <Portfolio snap={snapshot} />
      <Trajectory snap={snapshot} />
      <Conversation snap={snapshot} />
      <Notes snap={snapshot} />
    </Document>
  )
}
