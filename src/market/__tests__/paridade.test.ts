import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildMarketCasesSql, marketCases, OUTPUT } from '../../../scripts/marketCases.ts'
import { parseSgs, SgsError, toSgsDate } from '../index.ts'

const cases = marketCases()

describe('paridade entre a leitura do SGS e a gravação do banco (faixas e séries de src/market)', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const read = () => parseSgs([{ data: toSgsDate(c.date), valor: c.value }], c.code, c.date)
    if (c.ok) expect(read()).toEqual([{ date: c.date, value: Number(c.value) }])
    else expect(read).toThrow(SgsError)
  })

  it('o teste pgTAP gerado está em dia (npm run db:market-cases)', () => {
    expect(readFileSync(new URL(`../../../${OUTPUT}`, import.meta.url), 'utf8')).toBe(buildMarketCasesSql(cases))
  })
})
