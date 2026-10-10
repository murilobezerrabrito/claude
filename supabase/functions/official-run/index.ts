// Rodada oficial do mês (SPEC, "Onde roda a rodada oficial"): uma simulação por chamada, para caber no limite de CPU
// das Edge Functions. O console pede, família por família:
//   { acao: 'partes' }   quais partes rodar (sem simular);
//   { acao: 'parte', parte }   uma simulação, guardada no banco, com o tempo de cálculo;
//   { acao: 'concluir' }   monta a rodada, a ponte e a rentabilidade a partir das partes e grava (família rodada).
// Quem pede precisa ser da gestão, com segundo fator (o banco confere com o token de quem pede). Entradas, partes e
// gravação usam a chave do servidor, que nunca vai ao navegador.

import { ReportInputError } from '../_shared/aware/report/errors.ts'
import { assembleRun, runPart, runTasks, type PartOutcome, type RunInputs, type RunPart } from '../_shared/aware/report/runTasks.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const reply = (status: number, body: unknown) => Response.json(body, { status, headers: CORS })

/** Função do banco: com o token de quem pede (`user`) ou com a chave do servidor. */
async function rpc<T>(fn: string, args: Record<string, unknown>, as: { user: string } | 'servidor'): Promise<T> {
  const headers =
    as === 'servidor'
      ? { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
      : { apikey: ANON_KEY, Authorization: as.user, 'Content-Type': 'application/json' }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) })
  const text = await res.text()
  const body = text === '' ? null : (JSON.parse(text) as { message?: string; code?: string } | null)
  if (!res.ok) {
    const denied = res.status === 401 || res.status === 403 || body?.code === '42501'
    throw new HttpError(denied ? 403 : 422, body?.message ?? `Erro ${res.status} em ${fn}.`)
  }
  return body as T
}

interface Request_ {
  acao: 'partes' | 'parte' | 'concluir'
  household_id: string
  ref_date: string
  parte?: RunPart
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply(405, { erro: 'Use POST.' })
  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) throw new HttpError(401, 'Entre no console para rodar o mês.')
    const actor = await rpc<string>('run_permission', {}, { user: authorization })
    const body = (await req.json()) as Request_
    const where = { p_household: body.household_id, p_ref_date: body.ref_date }
    const loaded = await rpc<{ inputs: RunInputs; cma_version_id: string; plan_version_id: string }>('run_inputs', { ...where, p_actor: actor }, 'servidor')
    const tasks = runTasks(loaded.inputs)

    if (body.acao === 'partes') return reply(200, { partes: tasks.parts })

    if (body.acao === 'parte') {
      const part = body.parte
      if (!part || !tasks.parts.includes(part)) throw new HttpError(400, `Parte desconhecida: ${String(part)}.`)
      const t0 = performance.now()
      const outcome = runPart(tasks, part)
      const ms = performance.now() - t0
      await rpc('record_run_part', { ...where, p_part: part, p_inputs_hash: outcome.inputsHash, p_result: outcome.result, p_compute_ms: ms, p_actor: actor }, 'servidor')
      return reply(200, { parte: part, tempo_de_calculo_ms: Math.round(ms) })
    }

    if (body.acao === 'concluir') {
      const stored = await rpc<Partial<Record<RunPart, PartOutcome>>>('run_parts', where, 'servidor')
      const assembled = assembleRun(loaded.inputs, tasks, stored)
      const snapshot = {
        cma_version_id: loaded.cma_version_id,
        plan_version_id: loaded.plan_version_id,
        realized_return_real: assembled.realizedReturnReal,
        attribution: assembled.attribution,
      }
      const recorded = await rpc('record_official_run', { ...where, p_actor: actor, p_inputs: loaded.inputs, p_run: assembled.run, p_snapshot: snapshot }, 'servidor')
      return reply(200, recorded)
    }
    throw new HttpError(400, 'Ação desconhecida.')
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { erro: e.message })
    if (e instanceof ReportInputError) return reply(422, { erro: e.message })
    console.error(e)
    return reply(500, { erro: 'Erro inesperado na rodada. Tente de novo; se continuar, avise a equipe técnica.' })
  }
})
