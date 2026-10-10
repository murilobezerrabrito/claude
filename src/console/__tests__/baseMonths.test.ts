import { describe, expect, it } from 'vitest'
import { allowedBaseMonths } from '../plan/baseMonths.ts'

describe('meses-base da nova versão do plano', () => {
  it('depois do último mês fechado e não antes da versão mais recente, até o mês de hoje', () => {
    expect(allowedBaseMonths({ lastClosedMonth: '2026-08-31', latestBaseMonth: '2026-07-01', today: '2026-10-10' })).toEqual(['2026-10', '2026-09'])
    expect(allowedBaseMonths({ lastClosedMonth: '2026-08-31', latestBaseMonth: '2026-10-01', today: '2026-10-10' })).toEqual(['2026-10'])
  })

  it('família sem histórico: até 12 meses para trás; virada do ano', () => {
    const months = allowedBaseMonths({ lastClosedMonth: null, latestBaseMonth: null, today: '2027-01-05' })
    expect(months[0]).toBe('2027-01')
    expect(months[1]).toBe('2026-12')
    expect(months).toHaveLength(13)
    expect(months[12]).toBe('2026-01')
  })

  it('mês de hoje já fechado: nenhum mês-base possível', () => {
    expect(allowedBaseMonths({ lastClosedMonth: '2026-10-31', latestBaseMonth: null, today: '2026-10-10' })).toEqual([])
  })
})
