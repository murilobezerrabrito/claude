// O "E se?" do app: um Web Worker por mês aberto, com pedidos e respostas por número. A moldura do app cria o worker e
// pede o plano logo ao abrir (o sorteio do mercado, a parte demorada, acontece enquanto o cliente lê a Visão geral).

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import type { IpcaSeries } from '../report/inflation.ts'
import type { MonthPackage } from '../report/officialRun.ts'
import type { ReportScenarioParams } from '../report/scenarios.ts'
import type { SustainableResult, WhatIfRun } from './whatIf.ts'
import type { WhatIfRequest, WhatIfResponse } from './whatIfMessages.ts'

type Pending = Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
type Body = WhatIfRequest extends infer R ? (R extends WhatIfRequest ? Omit<R, 'id'> : never) : never

export function useWhatIf(pkg: MonthPackage | null, ipca: IpcaSeries | null) {
  const state = useRef<{ worker: Worker; pending: Pending; next: number } | null>(null)
  // Pedidos feitos antes de o worker existir (a tela filha roda os efeitos antes da moldura): saem quando ele nasce.
  const queue = useRef<{ body: Body; resolve: (v: unknown) => void; reject: (e: Error) => void }[]>([])
  useEffect(() => {
    if (!pkg || !ipca) return
    const worker = new Worker(new URL('./whatIf.worker.ts', import.meta.url), { type: 'module' })
    const pending: Pending = new Map()
    worker.onmessage = (e: MessageEvent<WhatIfResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data.result)
      else p.reject(new Error(e.data.error))
    }
    state.current = { worker, pending, next: 1 }
    worker.postMessage({ id: 0, type: 'init', pkg, ipca } satisfies WhatIfRequest)
    // Aquece: o plano oficial sorteia o mercado do horizonte máximo; a resposta não é usada aqui.
    pending.set(-1, { resolve: () => undefined, reject: () => undefined })
    worker.postMessage({ id: -1, type: 'run', params: {} } satisfies WhatIfRequest)
    for (const q of queue.current.splice(0)) {
      const id = state.current.next++
      pending.set(id, { resolve: q.resolve, reject: q.reject })
      worker.postMessage({ ...q.body, id } as WhatIfRequest)
    }
    return () => {
      // A tela saiu ou o mês mudou: os pedidos em andamento ficam sem resposta (não é erro para mostrar).
      worker.terminate()
      pending.clear()
      state.current = null
    }
  }, [pkg, ipca])

  const call = useCallback(<T,>(body: Body): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const s = state.current
      if (!s) {
        queue.current.push({ body, resolve: resolve as (v: unknown) => void, reject })
        return
      }
      const id = s.next++
      s.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      s.worker.postMessage({ ...body, id } as WhatIfRequest)
    })
  }, [])

  const run = useCallback((params: ReportScenarioParams) => call<WhatIfRun>({ type: 'run', params }), [call])
  const sustainable = useCallback((params: ReportScenarioParams) => call<SustainableResult>({ type: 'sustainable', params }), [call])
  return { run, sustainable }
}

export type WhatIfApi = ReturnType<typeof useWhatIf>

export const WhatIfContext = createContext<WhatIfApi | null>(null)

export function useWhatIfApi(): WhatIfApi {
  const api = useContext(WhatIfContext)
  if (!api) throw new Error('useWhatIfApi fora do app.')
  return api
}
