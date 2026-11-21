// Convite do cliente AI (Fase 3, etapa 3c; SPEC, "1. Entrar"; D-071 e D-074). O console pede
//   { household_id, email }
// com o token de quem convida (a gestão ou o responsável da família, com segundo fator). O banco confere o pedido; o
// Auth cria a conta e manda o link de primeiro acesso para o e-mail do cliente; o banco grava o papel de cliente na
// família e a auditoria. A resposta não traz o link: só o próprio cliente o recebe.

import { authInvite, authRecover, bearer, CORS, HttpError, reply, rpc } from '../_shared/server.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Para onde o link do e-mail leva: a tela de entrada do app, no mesmo endereço do console que pediu. */
function appEntry(req: Request): string {
  const origin = req.headers.get('Origin') ?? Deno.env.get('APP_ORIGIN') ?? ''
  try {
    return new URL('/app/entrar', origin).toString()
  } catch {
    throw new HttpError(400, 'Pedido sem a origem do console.')
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply(405, { erro: 'Use POST.' })
  try {
    const token = bearer(req, 'Entre no console para convidar o cliente.')
    const body = (await req.json().catch(() => null)) as { household_id?: unknown; email?: unknown } | null
    if (!body || typeof body.household_id !== 'string' || !UUID.test(body.household_id)) throw new HttpError(400, 'Pedido sem a família.')
    if (typeof body.email !== 'string') throw new HttpError(400, 'Pedido sem o e-mail.')
    const check = await rpc<{ actor: string; email: string; user_id: string | null; state: 'novo' | 'reenvio'; confirmed: boolean }>(
      'client_invite_check',
      { p_household: body.household_id, p_email: body.email },
      { user: token },
    )
    let userId: string
    if (check.user_id && check.confirmed) {
      // Já abriu o convite: recebe o link de criar senha.
      await authRecover(check.email, appEntry(req))
      userId = check.user_id
    } else {
      userId = await authInvite(check.email, appEntry(req))
    }
    const recorded = await rpc<{ email: string; state: string }>(
      'record_client_invite',
      { p_actor: check.actor, p_household: body.household_id, p_user: userId, p_email: check.email },
      'servidor',
    )
    return reply(200, { email: recorded.email, envio: check.state, situacao: recorded.state })
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { erro: e.message })
    console.error(e)
    return reply(500, { erro: 'Erro inesperado no convite. Tente de novo; se continuar, avise a equipe técnica.' })
  }
})
