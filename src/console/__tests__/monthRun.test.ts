import { describe, expect, it } from 'vitest'
import { runMonthBatch, type FamilyRunState, type RunAction, type RunCall } from '../monthRun.ts'

class HttpFailure extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Servidor falso: registra as chamadas, quantas já estavam em andamento quando cada uma começou e o máximo. */
function fakeServer(opts: { parts?: string[]; fail?: (a: RunAction, attempt: number) => Error | null } = {}) {
  const calls: RunAction[] = []
  const busyAtStart: number[] = []
  const attempts = new Map<string, number>()
  let inFlight = 0
  let maxInFlight = 0
  const call: RunCall = async <T,>(a: RunAction): Promise<T> => {
    calls.push(a)
    busyAtStart.push(inFlight)
    const key = `${a.household_id}:${a.acao}:${a.acao === 'parte' ? a.parte : ''}`
    const attempt = (attempts.get(key) ?? 0) + 1
    attempts.set(key, attempt)
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((r) => setTimeout(r, 2))
    inFlight--
    const err = opts.fail?.(a, attempt)
    if (err) throw err
    if (a.acao === 'partes') return { partes: opts.parts ?? ['principal', 'inicio', 'mercado', 'carteira', 'plano'] } as T
    if (a.acao === 'parte') return { parte: a.parte, tempo_de_calculo_ms: a.parte.length * 100 } as T
    return { probability: a.household_id === 'h1' ? 0.6195 : 0.9 } as T
  }
  return { call, calls, busyAtStart, maxInFlight: () => maxInFlight }
}

const families = [
  { household_id: 'h1', code: 'AND001' },
  { household_id: 'h2', code: 'COS001' },
]

describe('rodada oficial em lote', () => {
  it('cada família: partes, uma simulação por chamada (duas de cada vez, ou até `parallel`) e concluir', async () => {
    const server = fakeServer()
    const seen: FamilyRunState[][] = []
    const states = await runMonthBatch(families, '2026-10-31', server.call, (s) => seen.push(s))
    expect(states.map((s) => [s.code, s.state, s.probability, s.partsDone, s.partsTotal])).toEqual([
      ['AND001', 'rodada', 0.6195, 5, 5],
      ['COS001', 'rodada', 0.9, 5, 5],
    ])
    expect(states[0].maxPartMs).toBe('principal'.length * 100)
    expect(server.maxInFlight()).toBe(2)
    const wide = fakeServer()
    await runMonthBatch(families, '2026-10-31', wide.call, () => {}, 4)
    expect(wide.maxInFlight()).toBe(4)
    // A segunda família só começa depois que a primeira conclui.
    const order = server.calls.map((c) => `${c.household_id}:${c.acao}`)
    expect(order.indexOf('h1:concluir')).toBeLessThan(order.indexOf('h2:partes'))
    expect(order.filter((c) => c === 'h1:parte')).toHaveLength(5)
    expect(server.calls.every((c) => c.ref_date === '2026-10-31')).toBe(true)
    // O andamento começa com todas na fila.
    expect(seen[0].map((s) => s.state)).toEqual(['esperando', 'esperando'])
  })

  it('erro do servidor numa parte: as outras seguem, e ela é pedida de novo uma vez, sozinha', async () => {
    const server = fakeServer({ fail: (a, attempt) => (a.acao === 'parte' && a.parte === 'mercado' && attempt === 1 ? new HttpFailure(546, 'limite de recursos') : null) })
    const states = await runMonthBatch(families.slice(0, 1), '2026-10-31', server.call, () => {})
    expect(states[0]).toMatchObject({ state: 'rodada', partsDone: 5, partsTotal: 5 })
    const tries = server.calls.flatMap((c, i) => (c.acao === 'parte' && c.parte === 'mercado' ? [i] : []))
    expect(tries).toHaveLength(2)
    // A nova tentativa vem depois de todas as outras partes e começa sem nenhuma outra chamada em andamento.
    expect(server.calls.slice(tries[1] + 1).map((c) => c.acao)).toEqual(['concluir'])
    expect(server.busyAtStart[tries[1]]).toBe(0)
  })

  it('recusa por regra numa parte: não começa outras partes nem conclui', async () => {
    const server = fakeServer({
      parts: ['principal', 'inicio', 'mercado', 'carteira', 'plano', 'passagem_do_tempo', 'aportes_e_resgates', 'gasto_flexivel'],
      fail: (a) => (a.acao === 'parte' && a.parte === 'principal' ? new HttpFailure(422, 'A parte "principal" foi rodada com outras entradas.') : null),
    })
    const states = await runMonthBatch(families.slice(0, 1), '2026-10-31', server.call, () => {}, 2)
    expect(states[0]).toMatchObject({ state: 'erro', error: 'A parte "principal" foi rodada com outras entradas.' })
    expect(server.calls.some((c) => c.acao === 'concluir')).toBe(false)
    expect(server.calls.filter((c) => c.acao === 'parte').length).toBeLessThan(8)
  })

  it('"concluir" não se repete: a gravação muda o status, e a segunda vez seria recusada', async () => {
    const server = fakeServer({ fail: (a) => (a.acao === 'concluir' ? new HttpFailure(504, 'tempo esgotado no gateway') : null) })
    const states = await runMonthBatch(families.slice(0, 1), '2026-10-31', server.call, () => {})
    expect(states[0]).toMatchObject({ state: 'erro', error: 'tempo esgotado no gateway' })
    expect(server.calls.filter((c) => c.acao === 'concluir')).toHaveLength(1)
  })

  it('recusa por regra (4xx) não se repete; a família fica com o erro e as outras rodam', async () => {
    const server = fakeServer({ fail: (a) => (a.household_id === 'h1' && a.acao === 'partes' ? new HttpFailure(422, 'O mês anterior (09/2026) ainda não foi fechado.') : null) })
    const states = await runMonthBatch(families, '2026-10-31', server.call, () => {})
    expect(states[0]).toMatchObject({ state: 'erro', error: 'O mês anterior (09/2026) ainda não foi fechado.' })
    expect(states[1].state).toBe('rodada')
    expect(server.calls.filter((c) => c.household_id === 'h1')).toHaveLength(1)
  })

  it('parte que falha duas vezes por erro do servidor: a família fica com o erro, sem concluir', async () => {
    const server = fakeServer({ fail: (a) => (a.acao === 'parte' && a.parte === 'principal' ? new HttpFailure(500, 'Erro inesperado na rodada.') : null) })
    const states = await runMonthBatch(families.slice(0, 1), '2026-10-31', server.call, () => {}, 2)
    expect(states[0]).toMatchObject({ state: 'erro', error: 'Erro inesperado na rodada.', partsDone: 4 })
    expect(server.calls.filter((c) => c.acao === 'parte' && c.parte === 'principal')).toHaveLength(2)
    expect(server.calls.some((c) => c.acao === 'concluir')).toBe(false)
  })

  it('uma chamada de cada vez quando pedido (db:import)', async () => {
    const server = fakeServer()
    await runMonthBatch(families, '2026-10-31', server.call, () => {}, 1)
    expect(server.maxInFlight()).toBe(1)
  })
})
