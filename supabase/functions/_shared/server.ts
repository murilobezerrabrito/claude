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

/** Envia um arquivo novo para uma pasta privada do Storage, com a chave do servidor (nunca sobrescreve). */
export async function storageUpload(bucket: string, path: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': contentType, 'x-upsert': 'false' },
    body: bytes,
  })
  if (!res.ok) {
    const text = await res.text()
    if (res.status >= 500) throw new HttpError(503, 'O Storage não respondeu agora. Tente de novo em instantes.')
    throw new HttpError(422, `O Storage recusou o arquivo (${res.status}): ${text.slice(0, 200)}`)
  }
}

/** Apaga um arquivo de uma pasta privada do Storage (o envio que não chegou a ser anexado); falha não interrompe. */
export async function storageRemove(bucket: string, path: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] }),
    })
  } catch {
    // Fica um arquivo sem uso na pasta privada; ninguém o baixa (o link sai só do caminho anexado).
  }
}

/**
 * Link assinado de curta duração para baixar um arquivo de uma pasta privada. Devolve o caminho a partir de
 * /storage/v1: o console junta o endereço do Supabase que ele conhece (o da função, dentro do servidor, é outro).
 */
export async function storageSignedPath(bucket: string, path: string, expiresIn: number, downloadName: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  })
  const body = (await res.json().catch(() => ({}))) as { signedURL?: string }
  if (!res.ok || !body.signedURL) {
    if (res.status >= 500) throw new HttpError(503, 'O Storage não respondeu agora. Tente de novo em instantes.')
    throw new HttpError(422, 'Não foi possível gerar o link do arquivo.')
  }
  return `/storage/v1${body.signedURL}&download=${encodeURIComponent(downloadName)}`
}

/** O token de quem pede, do cabeçalho Authorization; sem ele, a função recusa. */
export function bearer(req: Request, refusal: string): string {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) throw new HttpError(401, refusal)
  return authorization
}

/**
 * Convite por e-mail pelo Auth, com a chave do servidor: o Auth cria a conta (sem senha) e manda o link para o próprio
 * cliente; o link nunca volta para quem convidou (D-071). `redirectTo` precisa estar na lista do Auth
 * (site_url ou additional_redirect_urls); fora dela, o Auth usa o site_url. Devolve o id da conta.
 */
export async function authInvite(email: string, redirectTo: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const body = (await res.json().catch(() => ({}))) as { id?: string; msg?: string; message?: string; error_code?: string }
  if (!res.ok || !body.id) {
    if (res.status >= 500) throw new HttpError(503, 'O serviço de e-mail não respondeu agora. Tente de novo em instantes.')
    if (res.status === 429) throw new HttpError(422, 'Convite enviado há pouco para este e-mail. Espere um minuto antes de reenviar.')
    throw new HttpError(422, `O Auth recusou o convite: ${body.msg ?? body.message ?? res.status}`)
  }
  return body.id
}

/**
 * Link de criar senha para quem já abriu o convite e não terminou o cadastro (o Auth não convida de novo uma conta com
 * e-mail confirmado). Vai para o e-mail da conta, como o convite.
 */
export async function authRecover(email: string, redirectTo: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    if (res.status >= 500) throw new HttpError(503, 'O serviço de e-mail não respondeu agora. Tente de novo em instantes.')
    if (res.status === 429) throw new HttpError(422, 'E-mail enviado há pouco para este endereço. Espere um minuto antes de reenviar.')
    const body = (await res.json().catch(() => ({}))) as { msg?: string; message?: string }
    throw new HttpError(422, `O Auth recusou o envio: ${body.msg ?? body.message ?? res.status}`)
  }
}
