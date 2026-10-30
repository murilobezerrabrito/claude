// O que as funções do servidor têm em comum: CORS para o console, erros com status HTTP e chamadas às funções do
// banco com o token de quem pede ou com a chave do servidor (que nunca vai ao navegador).
// Respostas de erro: 403 sem permissão; 422 recusa por regra (não adianta repetir); 503 falha do banco ou da rede
// (o console tenta de novo uma vez).

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const reply = (status: number, body: unknown) => Response.json(body, { status, headers: CORS })

/** Função do banco: com o token de quem pede (`user`) ou com a chave do servidor. */
export async function rpc<T>(fn: string, args: Record<string, unknown>, as: { user: string } | 'servidor'): Promise<T> {
  const headers =
    as === 'servidor'
      ? { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
      : { apikey: ANON_KEY, Authorization: as.user, 'Content-Type': 'application/json' }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) })
  const text = await res.text()
  let body: { message?: string; code?: string } | null = null
  try {
    body = text === '' ? null : (JSON.parse(text) as { message?: string; code?: string } | null)
  } catch {
    // Resposta sem JSON (gateway): fica o status.
  }
  if (!res.ok) {
    if (res.status >= 500) throw new HttpError(503, 'O banco não respondeu agora. Tente de novo em instantes.')
    const denied = res.status === 401 || res.status === 403 || body?.code === '42501'
    throw new HttpError(denied ? 403 : 422, body?.message ?? `Erro ${res.status} em ${fn}.`)
  }
  return body as T
}

/** O token de quem pede, do cabeçalho Authorization; sem ele, a função recusa. */
export function bearer(req: Request, refusal: string): string {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) throw new HttpError(401, refusal)
  return authorization
}
