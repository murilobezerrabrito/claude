// A visão do mês do cliente AI montada a partir de `client_month`: o exemplo da Andrade gravado sai do mesmo caminho
// (números congelados), sem mês fechado não há visão, e texto legal faltando ou meses fora de ordem viram erro de
// montagem, não números errados.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { andradeClientInputs, APP_EXAMPLE_PATH } from '../../../scripts/appExample.ts'
import { ReportInputError } from '../../report/errors.ts'
import { buildClientView, clientHistory } from '../clientView.ts'
import type { ClientMonthInputs, ClientMonthView } from '../types.ts'

const inputs = andradeClientInputs()
const frozen = JSON.parse(readFileSync(APP_EXAMPLE_PATH, 'utf8')) as ClientMonthView

describe('visão do mês do cliente', () => {
  it('o exemplo gravado é o que buildClientView monta das entradas no formato do banco (rode npm run app:example)', () => {
    const view = buildClientView(inputs, { example: true })
    expect(JSON.parse(JSON.stringify(view))).toEqual(frozen)
  })

  it('sem perfis-modelo e sem o banker nas entradas, a rodada da carteira atual dá os mesmos números', () => {
    const last = inputs.months[inputs.months.length - 1]
    expect(last.pkg.profiles).toEqual([])
    expect('bankerId' in last.pkg.household).toBe(false)
    expect(frozen.snapshot.summary.probability).toBeCloseTo(0.5927, 4)
  })

  it('o histórico traz a rodada publicada de cada mês e o rendimento real a partir do segundo', () => {
    const h = clientHistory(inputs)
    expect(h.map((m) => m.month)).toEqual(inputs.months.map((m) => m.run.refMonth))
    expect(h[0].realReturn).toBeNull()
    expect(h[1].realReturn).toEqual(expect.any(Number))
    expect(h[1].probability).toBe(inputs.months[1].run.probability)
  })

  it('família sem mês fechado: sem visão', () => {
    const empty: ClientMonthInputs = { ...inputs, ref_date: null, months: [], bridge: null }
    expect(buildClientView(empty)).toBeNull()
  })

  it('texto legal que falta é erro de montagem', () => {
    const without = (key: string) => Object.fromEntries(Object.entries(inputs.legal).filter(([k]) => k !== key))
    expect(() => buildClientView({ ...inputs, legal: without('rodape_app') })).toThrow(ReportInputError)
    expect(() => buildClientView({ ...inputs, legal: without('nota_ponte') })).toThrow(/nota_ponte/)
  })

  it('meses fora de sequência, último mês trocado ou formato novo são erro de montagem', () => {
    expect(() => buildClientView({ ...inputs, months: [inputs.months[1]] })).toThrow(ReportInputError)
    expect(() => buildClientView({ ...inputs, ref_date: '2026-09-30' })).toThrow(/2026-09-30/)
    expect(() => buildClientView({ ...inputs, schema: 2 as unknown as 1 })).toThrow(/formato novo/)
  })

  it('cenários salvos e sugestões passam para a visão', () => {
    const view = buildClientView({
      ...inputs,
      scenarios: [{ id: 's1', name: 'Aposentar antes', params: { retirementAge: 59 }, created_at: '2026-11-21T10:00:00Z' }],
      requests: [{ id: 'q1', text: 'A faculdade começa antes.', status: 'pendente', created_at: '2026-11-21T10:00:00Z', reviewed_at: null, review_note: null }],
    })
    expect(view?.scenarios[0].name).toBe('Aposentar antes')
    expect(view?.requests[0].status).toBe('pendente')
    expect(view?.example).toBe(false)
  })
})
