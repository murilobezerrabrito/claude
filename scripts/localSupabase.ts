// Supabase LOCAL para os comandos e os testes de ponta a ponta: endereço e chaves (`supabase status`), chamadas à API
// e usuários fictícios com senha e segundo fator. Recusa qualquer Supabase que não seja local (127.0.0.1 ou
// localhost); a chave secreta local serve só para criar os usuários fictícios.

import { execFileSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'

export interface Local {
  url: string
  publishable: string
  secret: string
}

/** Endereço e chaves do Supabase local (`supabase status`). Recusa o que não for local. */
export function localStack(): Local {
  let out: string
  try {
    out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    throw new Error('O Supabase local não está rodando: use npm run db:start.')
  }
  const s = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>
  const host = new URL(s.API_URL).hostname
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Só o Supabase local: ${s.API_URL} não é local.`)
  return { url: s.API_URL, publishable: s.PUBLISHABLE_KEY, secret: s.SECRET_KEY }
}

export async function call(local: Local, path: string, init: { method?: string; token?: string; admin?: boolean; body?: unknown }): Promise<unknown> {
  const headers: Record<string, string> = { apikey: init.admin ? local.secret : local.publishable, 'Content-Type': 'application/json' }
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  const res = await fetch(`${local.url}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await res.text()
  const body: unknown = text === '' ? null : JSON.parse(text)
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>
    throw new Error(`${path}: ${String(b.message ?? b.msg ?? b.error_description ?? res.status)}`)
  }
  return body
}

/** Código TOTP de 6 dígitos (RFC 6238, passo de 30 s) a partir do segredo em base32. */
export function totp(secret: string, now = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bytes: number[] = []
  let bits = 0
  let value = 0
  for (const c of secret.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(c)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)))
  const h = createHmac('sha1', Buffer.from(bytes)).update(counter).digest()
  const offset = h[h.length - 1] & 15
  return String((h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

/** Senha forte nova (12 ou mais caracteres, com maiúscula, minúscula, número e símbolo; D-042). */
export const newPassword = () => `${randomBytes(18).toString('base64url')}aA1!`

/**
 * Usuário fictício no Auth local, com o papel, a senha dada e nenhum segundo fator cadastrado (cada uso cadastra de
 * novo). Devolve o id.
 */
export async function ensureUser(local: Local, email: string, role: string, password: string): Promise<string> {
  const list = (await call(local, '/auth/v1/admin/users?per_page=1000', { admin: true })) as { users: { id: string; email: string }[] }
  let user = list.users.find((u) => u.email === email)
  if (user) await call(local, `/auth/v1/admin/users/${user.id}`, { method: 'PUT', admin: true, body: { password } })
  else user = (await call(local, '/auth/v1/admin/users', { admin: true, body: { email, password, email_confirm: true } })) as { id: string; email: string }
  const roles = (await call(local, `/rest/v1/user_roles?user_id=eq.${user.id}&role=eq.${role}&select=id`, { admin: true })) as unknown[]
  if (roles.length === 0) await call(local, '/rest/v1/user_roles', { admin: true, body: { user_id: user.id, role } })
  const factors = (await call(local, `/auth/v1/admin/users/${user.id}/factors`, { admin: true })) as { id: string }[]
  for (const f of factors) await call(local, `/auth/v1/admin/users/${user.id}/factors/${f.id}`, { method: 'DELETE', admin: true })
  return user.id
}
