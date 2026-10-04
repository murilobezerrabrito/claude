// Gráficos do relatório, desenhados com os componentes <Svg> do @react-pdf/renderer (o Recharts não roda no PDF).

import { Circle, G, Line, Path, Rect, Svg, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import type { Percentiles } from '../../engine/types.ts'
import type { BridgeBar } from '../../report/attribution.ts'
import { formatTenthsPercent, formatTenthsPp } from '../../lib/format.ts'
import { COLORS, FONTS } from './theme.ts'

/** Atributos de texto no <Svg>: fonte, tamanho e cor vão como propriedades. */
const label = { fontFamily: FONTS.body, fontSize: 8, fill: COLORS.muted }

interface SvgTextProps {
  x: number
  y: number
  fill?: string
  fontFamily?: string
  fontSize?: number
  textAnchor?: 'start' | 'middle' | 'end'
  children: string
}

/** Texto dentro do <Svg>. O react-pdf lê a fonte e o tamanho das propriedades, que os tipos dele não declaram. */
function SvgText(props: SvgTextProps) {
  const Untyped = Text as unknown as (p: SvgTextProps) => ReactElement
  return <Untyped {...props} />
}

/**
 * Ponte em cascata: coluna do mês anterior, uma barra por fator e coluna do mês. O eixo vertical não começa em zero
 * (as barras do mês são pequenas perto da chance), e as colunas dos extremos vão do pé do eixo até o valor.
 */
export function BridgeChart(props: { startTenths: number; endTenths: number; bars: BridgeBar[]; fromLabel: string; toLabel: string; width: number; height: number }) {
  const { startTenths, endTenths, bars, width, height } = props
  const levels = [startTenths]
  for (const b of bars) levels.push(levels[levels.length - 1] + b.tenths)
  const lo = Math.max(0, Math.floor((Math.min(...levels) - 40) / 100) * 100)
  const hi = Math.min(1000, Math.ceil((Math.max(...levels) + 20) / 100) * 100)
  const left = 34
  const top = 16
  const plotW = width - left
  const plotH = height - top - 4
  const y = (tenths: number) => top + plotH * (1 - (tenths - lo) / (hi - lo))
  const n = bars.length + 2
  const colW = plotW / n
  const barW = Math.min(colW * 0.56, 46)
  const x = (i: number) => left + colW * i + (colW - barW) / 2
  const ticks: number[] = []
  for (let t = lo; t <= hi; t += 100) ticks.push(t)

  const column = (i: number, value: number, color: string) => (
    <G key={`c${i}`}>
      <Rect x={x(i)} y={y(value)} width={barW} height={y(lo) - y(value)} fill={color} />
      <SvgText x={x(i) + barW / 2} y={y(value) - 5} {...label} fontSize={9} fill={COLORS.fg} textAnchor="middle">
        {formatTenthsPercent(value)}
      </SvgText>
    </G>
  )

  return (
    <View>
      <Svg width={width} height={height}>
        {ticks.map((t) => (
          <G key={`t${t}`}>
            <Line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke={COLORS.line} strokeWidth={0.6} />
            <SvgText x={left - 6} y={y(t) + 3} {...label} textAnchor="end">{`${t / 10}%`}</SvgText>
          </G>
        ))}
        {column(0, startTenths, COLORS.accent)}
        {bars.map((b, i) => {
          const from = levels[i]
          const to = levels[i + 1]
          const xi = x(i + 1)
          const connector = <Line x1={x(i) + barW} x2={xi} y1={y(from)} y2={y(from)} stroke={COLORS.muted} strokeWidth={0.6} strokeDasharray="2 2" />
          if (b.noEffect) {
            return (
              <G key={b.id}>
                {connector}
                <Line x1={xi} x2={xi + barW} y1={y(from)} y2={y(from)} stroke={COLORS.muted} strokeWidth={1.2} />
                <SvgText x={xi + barW / 2} y={y(from) - 5} {...label} textAnchor="middle">sem efeito</SvgText>
              </G>
            )
          }
          const topY = Math.min(y(from), y(to))
          const h = Math.max(Math.abs(y(to) - y(from)), 1)
          return (
            <G key={b.id}>
              {connector}
              <Rect x={xi} y={topY} width={barW} height={h} fill={b.tenths < 0 ? COLORS.bad : COLORS.good} />
              <SvgText x={xi + barW / 2} y={topY - 5} {...label} fontSize={9} fill={COLORS.fg} textAnchor="middle">
                {formatTenthsPp(b.tenths)}
              </SvgText>
            </G>
          )
        })}
        <Line x1={x(n - 2) + barW} x2={x(n - 1)} y1={y(endTenths)} y2={y(endTenths)} stroke={COLORS.muted} strokeWidth={0.6} strokeDasharray="2 2" />
        {column(n - 1, endTenths, COLORS.accent)}
      </Svg>
      <View style={{ flexDirection: 'row', marginLeft: left, marginTop: 4 }}>
        {[props.fromLabel, ...bars.map((b) => b.label), props.toLabel].map((text, i) => (
          <Text key={i} style={{ width: colW, fontFamily: FONTS.body, fontSize: 8, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 3 }}>
            {text}
          </Text>
        ))}
      </View>
    </View>
  )
}

/** Escala "bonita" para o eixo do patrimônio, em R$ mi: passo de 1, 2, 5, 10, 20 ou 50 mi com até 6 marcas. */
function niceAxis(maxMi: number): { top: number; step: number } {
  for (const step of [1, 2, 5, 10, 20, 50, 100]) {
    const top = Math.ceil(maxMi / step) * step
    if (top / step <= 6) return { top, step }
  }
  return { top: Math.ceil(maxMi / 200) * 200, step: 200 }
}

/**
 * Trajetória (página 5): patrimônio realizado desde o início do acompanhamento e o leque projetado por idade, com a
 * faixa do cenário ruim ao bom (P10 a P90) em tom claro, a faixa do meio (P25 a P75) mais escura, o cenário do meio
 * (P50) em linha grossa e o cenário ruim (P10) em linha fina vermelha. Eixo vertical em R$ mi de hoje, a partir de zero.
 */
export function FanChart(props: {
  pointAges: number[]
  percentiles: Percentiles
  realized: { age: number; wealth: number }[]
  markers: { age: number; label: string }[]
  width: number
  height: number
}) {
  const { pointAges, percentiles: p, realized, markers, width, height } = props
  const left = 40
  const bottom = 22
  const top = 10
  const right = 8
  const plotW = width - left - right
  const plotH = height - top - bottom
  const x0 = Math.floor(Math.min(pointAges[0], ...realized.map((r) => r.age)))
  const x1 = Math.ceil(pointAges[pointAges.length - 1])
  const maxMi = Math.max(...p.p90, ...realized.map((r) => r.wealth)) / 1e6
  const axis = niceAxis(maxMi)
  const x = (age: number) => left + (plotW * (age - x0)) / (x1 - x0)
  const y = (value: number) => top + plotH * (1 - value / 1e6 / axis.top)
  const line = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(pointAges[i]).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const band = (lower: number[], upper: number[]) => {
    const up = upper.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(pointAges[i]).toFixed(2)},${y(v).toFixed(2)}`)
    const down = lower.map((v, i) => `L${x(pointAges[i]).toFixed(2)},${y(v).toFixed(2)}`).reverse()
    return `${up.join(' ')} ${down.join(' ')} Z`
  }
  const yTicks: number[] = []
  for (let v = 0; v <= axis.top; v += axis.step) yTicks.push(v)
  const xTicks: number[] = []
  for (let a = Math.ceil(x0 / 5) * 5; a <= x1; a += 5) xTicks.push(a)

  return (
    <Svg width={width} height={height}>
      {yTicks.map((v) => (
        <G key={`y${v}`}>
          <Line x1={left} x2={width - right} y1={y(v * 1e6)} y2={y(v * 1e6)} stroke={COLORS.line} strokeWidth={0.6} />
          <SvgText x={left - 6} y={y(v * 1e6) + 3} {...label} textAnchor="end">{String(v)}</SvgText>
        </G>
      ))}
      {xTicks.map((a) => (
        <Text key={`x${a}`} x={x(a)} y={height - 8} {...label} textAnchor="middle">{String(a)}</Text>
      ))}
      <Path d={band(p.p10, p.p90)} fill={COLORS.accentSoft} />
      <Path d={band(p.p25, p.p75)} fill={COLORS.band} />
      {markers.map((m, i) => {
        // Marcos a menos de 2 anos um do outro ficam em alturas diferentes.
        const cy = top + 7 + (i > 0 && m.age - markers[i - 1].age < 2 ? 15 : 0)
        return (
          <G key={`m${i}`}>
            <Line x1={x(m.age)} x2={x(m.age)} y1={top} y2={top + plotH} stroke={COLORS.muted} strokeWidth={0.8} strokeDasharray="3 3" />
            <Circle cx={x(m.age)} cy={cy} r={6} fill={COLORS.page} stroke={COLORS.muted} strokeWidth={0.8} />
            <SvgText x={x(m.age)} y={cy + 3} {...label} fontSize={7.5} fill={COLORS.fg} textAnchor="middle">{String(i + 1)}</SvgText>
          </G>
        )
      })}
      <Path d={line(p.p50)} stroke={COLORS.accent} strokeWidth={2.4} fill="none" />
      <Path d={line(p.p10)} stroke={COLORS.bad} strokeWidth={1} fill="none" />
      <Path
        d={realized.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.age).toFixed(2)},${y(r.wealth).toFixed(2)}`).join(' ')}
        stroke={COLORS.fg}
        strokeWidth={1.6}
        fill="none"
      />
      {realized.map((r, i) => (
        <Circle key={`r${i}`} cx={x(r.age)} cy={y(r.wealth)} r={2.2} fill={COLORS.fg} />
      ))}
      <Line x1={left} x2={width - right} y1={top + plotH} y2={top + plotH} stroke={COLORS.muted} strokeWidth={0.8} />
    </Svg>
  )
}
