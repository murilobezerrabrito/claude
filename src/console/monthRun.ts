// Rodada oficial em lote (SPEC, "Mês": rodada oficial em lote): família por família, uma simulação por chamada à
// função `official-run` (D-061). As partes de uma família vão em paralelo, até `parallel` chamadas de cada vez; a
// família só conclui com todas as partes gravadas. Uma parte que falha por erro do servidor (não por regra) é pedida
// de novo uma vez: a parte é gravada por cima, então repetir não muda nada. A chamada à função vem de fora (`call`),
// para testar sem servidor.

export type RunAction =
  | { acao: 'partes'; household_id: string; ref_date: string }
  | { acao: 'parte'; household_id: string; ref_date: string; parte: string }
  | { acao: 'concluir'; household_id: string; ref_date: string }

export type RunCall = <T>(body: RunAction) => Promise<T>

export interface FamilyRunState {
  household_id: string
  code: string
  state: 'esperando' | 'rodando' | 'rodada' | 'erro'
  partsDone: number
  partsTotal: number | null
  probability?: number
  /** Maior tempo de cálculo de uma parte, em ms (o limite de CPU vale por chamada). */
  maxPartMs?: number
  error?: string
}

/** Erro que vale tentar de novo: falha do servidor ou da rede, não recusa por regra (4xx). */
export const isRetryable = (e: unknown) => {
  const status = (e as { status?: number } | null)?.status
  return status === undefined || status >= 500
}

/** Até `limit` tarefas de cada vez. Depois do primeiro erro, não começa outras; espera as que já foram e repassa o erro. */
async function pool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  let failure: { error: unknown } | null = null
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (failure === null && next < items.length) {
      const item = items[next++]
      try {
        await worker(item)
      } catch (error) {
        failure ??= { error }
      }
    }
  })
  await Promise.all(lanes)
  if (failure !== null) throw (failure as { error: unknown }).error
}

async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (!isRetryable(e)) throw e
    return fn()
  }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Roda as famílias dadas (conferidas) no mês, uma de cada vez, e avisa o andamento a cada mudança. Uma família com
 * erro não para as outras. Devolve o estado final de cada uma.
 */
export async function runMonthBatch(
  families: readonly { household_id: string; code: string }[],
  refDate: string,
  call: RunCall,
  onProgress: (states: FamilyRunState[]) => void,
  parallel = 4,
): Promise<FamilyRunState[]> {
  const states: FamilyRunState[] = families.map((f) => ({ household_id: f.household_id, code: f.code, state: 'esperando', partsDone: 0, partsTotal: null }))
  const update = (i: number, patch: Partial<FamilyRunState>) => {
    states[i] = { ...states[i], ...patch }
    onProgress([...states])
  }
  onProgress([...states])

  for (let i = 0; i < states.length; i++) {
    const where = { household_id: states[i].household_id, ref_date: refDate }
    update(i, { state: 'rodando' })
    try {
      const { partes } = await withOneRetry(() => call<{ partes: string[] }>({ acao: 'partes', ...where }))
      update(i, { partsTotal: partes.length })
      let maxPartMs = 0
      await pool(partes, parallel, async (parte) => {
        const r = await withOneRetry(() => call<{ tempo_de_calculo_ms: number }>({ acao: 'parte', parte, ...where }))
        maxPartMs = Math.max(maxPartMs, r.tempo_de_calculo_ms)
        update(i, { partsDone: states[i].partsDone + 1, maxPartMs })
      })
      const done = await withOneRetry(() => call<{ probability: number }>({ acao: 'concluir', ...where }))
      update(i, { state: 'rodada', probability: done.probability })
    } catch (e) {
      update(i, { state: 'erro', error: errorText(e) })
    }
  }
  return states
}
