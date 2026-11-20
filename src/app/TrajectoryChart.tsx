// Gráfico de trajetória do app (SPEC, "Gráfico de trajetória"): eixo em idade, faixa do cenário ruim ao bom em tom claro,
// faixa central mais escura, cenário do meio em linha grossa, cenário ruim em linha fina vermelha, marcos tracejados e
// eixo vertical em "R$ mi de hoje" a partir de zero. Ao tocar, idade, ano e os três cenários. Em comparações, a mediana
// de cada cenário por cima. Largura total e cerca de 260 px de altura. O resumo em texto é a frase de leitura, ao lado.

import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '../lib/format.ts'

export interface Fan {
  ages: number[]
  years: number[]
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
}

export interface Overlay {
  label: string
  ages: number[]
  p50: number[]
  /** Cor da linha (as do tema). */
  color: string
  dashed?: boolean
}

const HEIGHT = 260
const PAD = { left: 34, right: 10, top: 12, bottom: 26 }

/** Eixo vertical em passos redondos (1, 2, 5, 10 ou 20 milhões), com até cinco linhas. */
function axis(v: number): { max: number; step: number } {
  const mi = Math.max(v, 1) / 1e6
  const step = [1, 2, 5, 10, 20, 50].find((s) => mi / s <= 4) ?? 100
  return { max: Math.ceil(mi / step) * step * 1e6, step: step * 1e6 }
}

export function TrajectoryChart(props: { fan: Fan; markers?: { age: number; label: string }[]; overlays?: Overlay[]; label: string }) {
  const { fan, markers = [], overlays = [] } = props
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(343)
  const [focus, setFocus] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ages = fan.ages
  const minAge = ages[0]
  const maxAge = Math.max(ages[ages.length - 1], ...overlays.map((o) => o.ages[o.ages.length - 1]))
  const { max: yMax, step: yStep } = axis(Math.max(...fan.p90, ...overlays.flatMap((o) => o.p50)))
  const w = width - PAD.left - PAD.right
  const h = HEIGHT - PAD.top - PAD.bottom
  const x = (age: number) => PAD.left + ((age - minAge) / (maxAge - minAge || 1)) * w
  const y = (v: number) => PAD.top + h - (Math.max(0, Math.min(v, yMax)) / yMax) * h
  const line = (xs: number[], vs: number[]) => xs.map((a, i) => `${i === 0 ? 'M' : 'L'}${x(a).toFixed(1)},${y(vs[i]).toFixed(1)}`).join('')
  const area = (lo: number[], hi: number[]) =>
    `${ages.map((a, i) => `${i === 0 ? 'M' : 'L'}${x(a).toFixed(1)},${y(hi[i]).toFixed(1)}`).join('')}${ages
      .map((_, k) => {
        const i = ages.length - 1 - k
        return `L${x(ages[i]).toFixed(1)},${y(lo[i]).toFixed(1)}`
      })
      .join('')}Z`
  const ticksY = Array.from({ length: Math.round(yMax / yStep) + 1 }, (_, i) => yStep * i)
  const firstTen = Math.ceil(minAge / 10) * 10
  const ticksX = Array.from({ length: Math.floor((maxAge - firstTen) / 10) + 1 }, (_, i) => firstTen + i * 10)

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    const age = minAge + ((clientX - rect.left - PAD.left) / w) * (maxAge - minAge)
    let best = 0
    for (let i = 1; i < ages.length; i++) if (Math.abs(ages[i] - age) < Math.abs(ages[best] - age)) best = i
    setFocus(best)
  }

  return (
    <div ref={box} className="relative w-full select-none">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={props.label}
        className="touch-pan-y"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons > 0 ? pick(e.clientX) : undefined)}
        onPointerLeave={(e) => (e.pointerType === 'mouse' ? setFocus(null) : undefined)}
      >
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {(t / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={9} fontSize={10} fill="var(--muted-foreground)">
          R$ mi de hoje
        </text>
        {ticksX.map((a) => (
          <text key={a} x={x(a)} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
            {a}
          </text>
        ))}
        <path d={area(fan.p10, fan.p90)} fill="var(--primary)" fillOpacity={0.1} />
        <path d={area(fan.p25, fan.p75)} fill="var(--primary)" fillOpacity={0.18} />
        {markers.map((m) => (
          <line key={m.label} x1={x(m.age)} x2={x(m.age)} y1={PAD.top} y2={PAD.top + h} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeWidth={1} />
        ))}
        <path d={line(ages, fan.p10)} fill="none" stroke="var(--band-red)" strokeWidth={1.3} />
        <path d={line(ages, fan.p50)} fill="none" stroke="var(--primary)" strokeWidth={2.5} />
        {overlays.map((o) => (
          <path key={o.label} d={line(o.ages, o.p50)} fill="none" stroke={o.color} strokeWidth={2} strokeDasharray={o.dashed ? '5 4' : undefined} />
        ))}
        {focus !== null ? <line x1={x(ages[focus])} x2={x(ages[focus])} y1={PAD.top} y2={PAD.top + h} stroke="var(--foreground)" strokeWidth={1} /> : null}
      </svg>
      {focus !== null ? (
        <div className="pointer-events-none absolute top-1 right-1 rounded-md border bg-card/95 px-2.5 py-1.5 text-xs shadow-sm" role="status">
          <p className="font-medium">
            Aos {Math.floor(ages[focus] + 1e-9)} anos ({fan.years[focus]})
          </p>
          <p>Cenário bom: {formatMoney(fan.p90[focus])}</p>
          <p>Cenário do meio: {formatMoney(fan.p50[focus])}</p>
          <p className="text-band-red">Cenário ruim: {formatMoney(fan.p10[focus])}</p>
        </div>
      ) : null}
      {overlays.length > 0 || markers.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {overlays.map((o) => (
            <li key={o.label} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: o.color }} aria-hidden />
              {o.label}
            </li>
          ))}
          {markers.map((m) => (
            <li key={m.label}>
              ┆ {m.label} ({Math.floor(m.age + 1e-9)})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
