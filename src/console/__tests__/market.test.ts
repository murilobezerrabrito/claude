import { describe, expect, it } from 'vitest'
import type { MarketStatusRow } from '../../lib/apiTypes.ts'
import { seriesValueText, seriesViews, staleSeries } from '../market.ts'

// Valores fictícios, no formato em que o Banco Central publica (D-051).
function row(code: MarketStatusRow['code'], date: string | null, value = 1): MarketStatusRow {
  return {
    code,
    last: date === null ? null : { date, value, source: 'ficticio' },
    last_sync: null,
    last_success_at: null,
  }
}

describe('séries do Banco Central no console', () => {
  it('valor como o Banco Central publica: CDI em % ao dia, IPCA em % no mês, dólar em reais', () => {
    expect(seriesValueText('cdi', 0.055131, '2026-10-28')).toBe('0,055131% ao dia')
    expect(seriesValueText('cdi', 0.04, '2026-10-28')).toBe('0,04% ao dia')
    expect(seriesValueText('ipca', 0.48, '2026-09-01')).toBe('0,48% (setembro de 2026)')
    expect(seriesValueText('ipca', -0.21, '2026-08-01')).toBe('-0,21% (agosto de 2026)')
    expect(seriesValueText('dolar', 5.04, '2026-10-30')).toBe('R$ 5,0400')
  })

  it('situação de cada série na ordem recebida, com o nome e o atraso', () => {
    // Sexta, 30/10/2026: o dólar de 23/10 está há 4 dias úteis sem dado novo (26 a 29); o CDI de 28/10, há 1.
    const views = seriesViews([row('cdi', '2026-10-28', 0.055), row('ipca', '2026-09-01', 0.48), row('dolar', '2026-10-23', 5.04)], '2026-10-30')
    expect(views.map((v) => v.name)).toEqual(['CDI', 'IPCA', 'Dólar de venda'])
    expect(views.map((v) => v.lag.stale)).toEqual([false, false, true])
    expect(views[2].lag.message).toBe('Dólar de venda: o último dado é de 23/10/2026, há 4 dias úteis sem dado novo.')
  })

  it('o aviso lista só as séries atrasadas, inclusive a que nunca recebeu dado', () => {
    // O IPCA de setembro era esperado até 15/10/2026; em 30/10, são 10 dias úteis de atraso.
    const stale = staleSeries([row('cdi', null), row('ipca', '2026-08-01', 0.23), row('dolar', '2026-10-29', 5.03)], '2026-10-30')
    expect(stale.map((v) => v.lag.message)).toEqual([
      'CDI: nenhum dado gravado ainda.',
      'IPCA: falta o de setembro de 2026, esperado até 15/10/2026; 10 dias úteis de atraso.',
    ])
    expect(staleSeries([row('cdi', '2026-10-29'), row('ipca', '2026-09-01'), row('dolar', '2026-10-29')], '2026-10-30')).toEqual([])
  })
})
