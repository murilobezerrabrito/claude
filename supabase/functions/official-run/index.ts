// Rodada oficial do mês (SPEC, "Onde roda a rodada oficial"): uma simulação por chamada, para caber no limite de CPU
// das Edge Functions. O console pede, família por família:
//   { acao: 'partes' }   quais partes rodar (sem simular);
//   { acao: 'parte', parte }   uma simulação, guardada no banco, com o tempo de cálculo;
//   { acao: 'concluir' }   monta a rodada, a ponte e a rentabilidade a partir das partes e grava (família rodada).
// Quem pede precisa ser da gestão, com segundo fator (o banco confere com o token de quem pede). Entradas, partes e
// gravação usam a chave do servidor, que nunca vai ao navegador.
// Respostas de erro como em _shared/server.ts. O tempo de cálculo gravado cobre a montagem das entradas e a simulação.

import { ReportInputError } from '../_shared/aware/report/errors.ts'
import { bearer, CORS, HttpError, reply, rpc } from '../_shared/server.ts'
import { assembleRun, runPart, runTasks, type PartOutcome, type RunInputs, type RunPart } from '../_shared/aware/report/runTasks.ts'

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
    const actor = await rpc<string>('run_permission', {}, { user: bearer(req, 'Entre no console para rodar o mês.') })
    const body = (await req.json()) as Request_
    const where = { p_household: body.household_id, p_ref_date: body.ref_date }
    const loaded = await rpc<{ inputs: RunInputs; cma_version_id: string; plan_version_id: string }>('run_inputs', { ...where, p_actor: actor }, 'servidor')
    const t0 = performance.now()
    const tasks = runTasks(loaded.inputs)

    if (body.acao === 'partes') return reply(200, { partes: tasks.parts })

    if (body.acao === 'parte') {
      const part = body.parte
      if (!part || !tasks.parts.includes(part)) throw new HttpError(400, `Parte desconhecida: ${String(part)}.`)
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
