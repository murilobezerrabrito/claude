// Os arquivos de exemplo fictícios, com a classe de cada ativo e o dólar fictício, geram exatamente os fechamentos da
// Família Andrade usados no relatório de exemplo (src/data/andrade-fechamentos.json).

import { describe, expect, it } from 'vitest'
import fechamentos from '../../data/andrade-fechamentos.json'
import exemplo from '../../data/importacao/exemplo-classes.json'
import { closingFromRows } from '../closing.ts'
import { previewFlows, previewPositions } from '../preview.ts'
import { readFlows, readOfficialPl, readPositions } from '../read.ts'
import type { FlowRow, ReadResult } from '../types.ts'
import { toBrl } from '../values.ts'
import { exampleSheet } from './helpers.ts'

const classes: Record<string, string> = exemplo.classes
const dollar: Record<string, number> = exemplo.dolar

function rowsOf<T>(r: ReadResult<T>): T[] {
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join(' | '))
  return r.rows
}

/** Dólar de venda na data de referência ou no último dia útil antes dela (31/10/2026 é sábado). */
const dollarOn = (refDate: string) => dollar[refDate] ?? dollar[refDate.replace('-31', '-30')]

function closingOf(month: '2026-09' | '2026-10', client: string) {
  const refDate = month === '2026-09' ? '2026-09-30' : '2026-10-31'
  const positions = rowsOf(readPositions(exampleSheet(`exemplo-posicoes-${month}.csv`))).filter((p) => p.clientCode === client)
  const flows: FlowRow[] = month === '2026-10' ? rowsOf(readFlows(exampleSheet('exemplo-movimentos-2026-10.csv'))).filter((f) => f.clientCode === client) : []
  const pl = rowsOf(readOfficialPl(exampleSheet(`exemplo-pl-${month}.csv`))).find((p) => p.clientCode === client)
  return closingFromRows(
    refDate,
    pl?.officialPl ?? NaN,
    positions.map((p) => ({ classCode: classes[p.assetCode], netValueBrl: p.currency === 'USD' ? toBrl(p.netValue, dollarOn(refDate)) : p.netValue })),
    flows.map((f) => ({ ...(f.date ? { date: f.date } : {}), kind: f.kind, amountBrl: f.amount, ...(f.description ? { description: f.description } : {}) })),
  )
}

describe('exemplos da importação', () => {
  it('os arquivos de setembro e outubro da Andrade dão os fechamentos do relatório de exemplo', () => {
    expect(closingOf('2026-09', 'AND001')).toEqual(fechamentos.closings[0])
    expect(closingOf('2026-10', 'AND001')).toEqual(fechamentos.closings[1])
  })

  it('a soma das posições bate com o PL oficial em todas as famílias e meses', () => {
    for (const month of ['2026-09', '2026-10'] as const) {
      for (const client of ['AND001', 'BAR001', 'COS001']) {
        const c = closingOf(month, client)
        const sum = Object.values(c.positionsByClass).reduce((a, b) => a + b, 0)
        expect(Math.round(sum * 100), `${client} ${month}`).toBe(Math.round(c.officialPl * 100))
      }
    }
  })

  it('prévia das posições: famílias em ordem, custodiantes e totais por moeda', () => {
    const preview = previewPositions('2026-09-30', rowsOf(readPositions(exampleSheet('exemplo-posicoes-2026-09.csv'))))
    expect(preview.families).toEqual([
      { clientCode: 'AND001', rows: 11, custodians: ['Custodiante A', 'Custodiante B', 'Custodiante C'], assets: 11, netByCurrency: { BRL: 11_040_000, USD: 192_000 } },
      { clientCode: 'BAR001', rows: 4, custodians: ['Corretora X'], assets: 4, netByCurrency: { BRL: 1_500_000 } },
      { clientCode: 'COS001', rows: 4, custodians: ['Custodiante B'], assets: 4, netByCurrency: { BRL: 6_000_000 } },
    ])
    expect(preview.assetCodes).toHaveLength(13)
  })

  it('prévia dos movimentos: datas aproximadas e aviso de possível transferência', () => {
    const rows = rowsOf(readFlows(exampleSheet('exemplo-movimentos-2026-10.csv')))
    const preview = previewFlows('2026-10-31', rows)
    expect(preview.families.find((f) => f.clientCode === 'COS001')).toEqual({ clientCode: 'COS001', rows: 1, contributions: {}, withdrawals: { BRL: 40_000 }, approximateDates: 1 })
    expect(preview.warnings).toEqual([])
    const transfer: FlowRow = { ...rows[0], line: 5, kind: 'aporte', custodian: 'Custodiante B' }
    const warned = previewFlows('2026-10-31', [...rows, transfer])
    expect(warned.warnings).toEqual([
      {
        line: 5,
        message: 'AND001: aporte (linha 5) e resgate (linha 2) do mesmo valor em 2026-10-15 parecem transferência entre contas da família, que não conta como aporte nem resgate. Confira antes de confirmar.',
      },
    ])
  })
})
