// npm run db:import: a importação do mês de ponta a ponta no Supabase LOCAL, pela API, com login de verdade (senha e
// segundo fator) em dois usuários fictícios: um da gestão e um do comitê. Serve para testar antes de o console existir.
// Recusa qualquer Supabase que não seja o local (127.0.0.1 ou localhost). Só arquivos fictícios; nada de dados reais.
//
// Comandos:
//   previa <posicoes|movimentos> <arquivo> [--confirmar]   prévia (e confirmação) de uma planilha
//   pl <arquivo>                                           PL oficial por família
//   conferir <AAAA-MM-DD>                                  conferência do mês
//   fila                                                   ativos sem classe (fila do comitê)
//   mapear <codigo_ativo> <classe>                         o comitê dá a classe de um ativo
//   situacao <AAAA-MM-DD> [cadm|ai]                        situação do mês
//   exemplo                                                os arquivos de exemplo da Andrade, Barbosa e Costa, de ponta a ponta

import { execFileSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  flowsToRpc,
  officialPlToRpc,
  positionsToRpc,
  previewFlows,
  previewPositions,
  readFlows,
  readOfficialPl,
  readPositions,
  type ImportIssue,
  type ReadResult,
} from '../src/import/index.ts'
import { formatMoneyExact, formatSignedPercent } from '../src/lib/format.ts'
import { readSheetFile } from '../src/lib/planilhas.ts'
import { monthReturn } from '../src/report/performance.ts'
import type { HouseholdMonths } from '../src/report/types.ts'

const root = new URL('..', import.meta.url)

interface Local {
  url: string
  publishable: string
  secret: string
}

/** Endereço e chaves do Supabase local (`supabase status`). Recusa o que não for local. */
function localStack(): Local {
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

// Usuários fictícios do comando: criados no Auth local e ligados ao papel; senha nova e segundo fator novo a cada uso.
const USERS = {
  gestao: { email: 'importacao.gestao@exemplo.invalid', role: 'gestao' },
  comite: { email: 'importacao.comite@exemplo.invalid', role: 'comite' },
} as const
type UserKind = keyof typeof USERS

async function call(local: Local, path: string, init: { method?: string; token?: string; admin?: boolean; body?: unknown }): Promise<unknown> {
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
function totp(secret: string, now = Date.now()): string {
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

/** Entra como o usuário fictício, com senha e segundo fator (aal2). Devolve o token de acesso. */
async function login(local: Local, kind: UserKind): Promise<string> {
  const { email, role } = USERS[kind]
  const password = `${randomBytes(18).toString('base64url')}aA1!`
  const list = (await call(local, '/auth/v1/admin/users?per_page=1000', { admin: true })) as { users: { id: string; email: string }[] }
  let user = list.users.find((u) => u.email === email)
  if (user) await call(local, `/auth/v1/admin/users/${user.id}`, { method: 'PUT', admin: true, body: { password } })
  else user = (await call(local, '/auth/v1/admin/users', { admin: true, body: { email, password, email_confirm: true } })) as { id: string; email: string }
  const roles = (await call(local, `/rest/v1/user_roles?user_id=eq.${user.id}&role=eq.${role}&select=id`, { admin: true })) as unknown[]
  if (roles.length === 0) await call(local, '/rest/v1/user_roles', { admin: true, body: { user_id: user.id, role } })
  const factors = (await call(local, `/auth/v1/admin/users/${user.id}/factors`, { admin: true })) as { id: string }[]
  for (const f of factors) await call(local, `/auth/v1/admin/users/${user.id}/factors/${f.id}`, { method: 'DELETE', admin: true })

  const session = (await call(local, '/auth/v1/token?grant_type=password', { body: { email, password } })) as { access_token: string }
  const factor = (await call(local, '/auth/v1/factors', { token: session.access_token, body: { factor_type: 'totp', friendly_name: 'db:import' } })) as {
    id: string
    totp: { secret: string }
  }
  const challenge = (await call(local, `/auth/v1/factors/${factor.id}/challenge`, { token: session.access_token, body: {} })) as { id: string }
  const verified = (await call(local, `/auth/v1/factors/${factor.id}/verify`, {
    token: session.access_token,
    body: { challenge_id: challenge.id, code: totp(factor.totp.secret) },
  })) as { access_token: string }
  return verified.access_token
}

class Api {
  private tokens = new Map<UserKind, string>()
  private local: Local

  constructor(local: Local) {
    this.local = local
  }

  async rpc<T>(as: UserKind, fn: string, args: Record<string, unknown> = {}): Promise<T> {
    let token = this.tokens.get(as)
    if (!token) {
      token = await login(this.local, as)
      this.tokens.set(as, token)
      console.log(`  (entrou como ${USERS[as].email}, com segundo fator)`)
    }
    return (await call(this.local, `/rest/v1/rpc/${fn}`, { token, body: args })) as T
  }
}

// Saída -----------------------------------------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const money = (v: unknown) => (typeof v === 'number' ? formatMoneyExact(v) : '—')
const byCurrency = (m: Record<string, number> | null | undefined) =>
  m ? Object.entries(m).map(([cur, v]) => (cur === 'BRL' ? money(v) : `${cur} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)).join(' + ') : '—'

function printIssues(title: string, issues: ImportIssue[]) {
  if (issues.length === 0) return
  console.log(title)
  for (const i of issues) console.log(`  ${i.line === undefined ? '' : `linha ${i.line}: `}${i.message}`)
}

function readFile<T>(path: string, read: (s: ReturnType<typeof readSheetFile>) => ReadResult<T>): { refDate: string; rows: T[] } {
  const result = read(readSheetFile(path, new Uint8Array(readFileSync(path))))
  printIssues('Avisos da planilha:', result.warnings)
  if (!result.ok) {
    printIssues(`${basename(path)}: arquivo recusado (nada foi enviado ao banco).`, result.errors)
    process.exit(1)
  }
  return result
}

interface ServerPreview {
  ok: boolean
  errors?: ImportIssue[]
  batch_id: string
  ref_date: string
  rows: number
  families: { code: string; name: string; rows: number; net_by_currency?: Record<string, number>; contributions?: Record<string, number>; withdrawals?: Record<string, number>; replaces: number; official_pl: number | null }[]
  new_assets: { asset_code: string }[]
  unmapped_assets: string[]
  warnings: ImportIssue[]
  total_value: number | null
}

async function preview(api: Api, kind: 'posicoes' | 'movimentos', path: string, confirm: boolean) {
  console.log(`\n▸ ${kind === 'posicoes' ? 'Posições' : 'Aportes e resgates'}: ${basename(path)}`)
  let rows: unknown[]
  if (kind === 'posicoes') {
    const file = readFile(path, readPositions)
    const local = previewPositions(file.refDate, file.rows)
    console.log(`  Planilha: ${file.rows.length} linhas, ${local.families.length} famílias, ${local.assetCodes.length} ativos, data de referência ${file.refDate}.`)
    rows = positionsToRpc(file.rows)
  } else {
    const file = readFile(path, readFlows)
    const local = previewFlows(file.refDate, file.rows)
    console.log(`  Planilha: ${file.rows.length} movimentos de ${local.families.length} famílias, data de referência ${file.refDate}.`)
    printIssues('  Avisos:', local.warnings)
    rows = flowsToRpc(file.rows)
  }
  const p = await api.rpc<ServerPreview>('gestao', 'import_preview', { p_kind: kind, p_file_name: basename(path), p_rows: rows })
  if (!p.ok) {
    printIssues('  O banco recusou o arquivo (nada foi gravado):', p.errors ?? [])
    process.exit(1)
  }
  console.log(`  Prévia do banco (lote ${p.batch_id}):`)
  for (const f of p.families) {
    const values = kind === 'posicoes' ? byCurrency(f.net_by_currency) : `aportes ${byCurrency(f.contributions)}; resgates ${byCurrency(f.withdrawals)}`
    const replaces = f.replaces > 0 ? `; substitui ${f.replaces} linhas` : ''
    console.log(`    ${f.code} ${f.name}: ${plural(f.rows, 'linha', 'linhas')}, ${values}${replaces}`)
  }
  if (kind === 'posicoes') {
    console.log(`  Total em reais: ${money(p.total_value)}. Ativos novos (entram sem classe): ${p.new_assets.length}.`)
  }
  printIssues('  Avisos:', p.warnings)
  if (!confirm) {
    console.log('  Prévia guardada; para gravar, rode de novo com --confirmar.')
    return
  }
  const done = await api.rpc<{ rows: number; replaced: number; new_assets: number }>('gestao', 'import_confirm', { p_batch: p.batch_id })
  console.log(`  Confirmado: ${done.rows} linhas gravadas, ${done.replaced} substituídas, ${done.new_assets} ativos novos.`)
}

async function officialPl(api: Api, path: string) {
  console.log(`\n▸ PL oficial: ${basename(path)}`)
  const file = readFile(path, readOfficialPl)
  const r = await api.rpc<{ ok: boolean; errors?: ImportIssue[]; families: number; changed: number }>('gestao', 'set_official_pl', { p_rows: officialPlToRpc(file.rows) })
  if (!r.ok) {
    printIssues('  O banco recusou o arquivo:', r.errors ?? [])
    process.exit(1)
  }
  console.log(`  ${r.families} famílias; ${r.changed} com PL novo.`)
}

interface CheckResult {
  code: string
  name: string
  status: string
  checks: { items: { code: string; level: string; message: string }[]; positions_total: number | null; official_pl: number | null; real_return: number | null; nominal_return: number | null }
}

async function check(api: Api, refDate: string): Promise<CheckResult[]> {
  console.log(`\n▸ Conferência de ${refDate}`)
  const results = await api.rpc<CheckResult[]>('gestao', 'check_month', { p_ref_date: refDate })
  for (const r of results) {
    const c = r.checks
    const ret = c.real_return !== null ? `; rentabilidade real ${formatSignedPercent(c.real_return, 2)}` : c.nominal_return !== null ? `; rentabilidade nominal ${formatSignedPercent(c.nominal_return, 2)}` : ''
    console.log(`  ${r.code} ${r.name}: ${r.status.toUpperCase()} (posições ${money(c.positions_total)}, PL ${money(c.official_pl)}${ret})`)
    for (const i of c.items) console.log(`    ${i.level === 'bloqueio' ? '✖' : '!'} ${i.message}`)
  }
  return results
}

interface Queue {
  assets: { id: string; asset_code: string; name: string; families_waiting: number; suggestion: { asset_code: string; class_code: string } | null }[]
  classes: { class_code: string; name: string }[]
}

async function queue(api: Api): Promise<Queue> {
  const q = await api.rpc<Queue>('comite', 'unmapped_assets')
  console.log(`\n▸ Fila de mapeamento: ${q.assets.length} ativos sem classe`)
  for (const a of q.assets) {
    const s = a.suggestion ? ` (sugestão: ${a.suggestion.class_code}, como ${a.suggestion.asset_code})` : ''
    console.log(`  ${a.asset_code} ${a.name}: ${plural(a.families_waiting, 'família esperando', 'famílias esperando')}${s}`)
  }
  console.log(`  Classes vigentes: ${q.classes.map((c) => c.class_code).join(', ')}`)
  return q
}

async function mapAsset(api: Api, q: Queue, code: string, classCode: string) {
  const asset = q.assets.find((a) => a.asset_code === code)
  if (!asset) throw new Error(`O ativo ${code} não está na fila.`)
  const r = await api.rpc<{ months_reset: number }>('comite', 'map_asset', { p_asset: asset.id, p_class_code: classCode })
  console.log(`  ${code} → ${classCode} (meses reabertos para a conferência: ${r.months_reset})`)
}

interface Overview {
  families: { code: string; name: string; channel: string; status: string; positions: number; flows: number }[]
  closings: { channel: string; status: string }[]
  batches: { kind: string; file_name: string; status: string; rows: number }[]
}

async function overview(api: Api, refDate: string, channel?: string) {
  const o = await api.rpc<Overview>('gestao', 'month_overview', { p_ref_date: refDate, ...(channel ? { p_channel: channel } : {}) })
  console.log(`\n▸ Situação de ${refDate}`)
  for (const f of o.families) console.log(`  [${f.channel}] ${f.code} ${f.name}: ${f.status} (${plural(f.positions, 'posição', 'posições')}, ${plural(f.flows, 'movimento', 'movimentos')})`)
  for (const c of o.closings) console.log(`  Canal ${c.channel}: ${c.status}`)
  for (const b of o.batches) console.log(`  Lote ${b.kind} ${b.file_name}: ${b.status}, ${b.rows} linhas`)
}

async function example(api: Api) {
  const file = (name: string) => fileURLToPath(new URL(`src/data/importacao/${name}`, root))
  const classes = (JSON.parse(readFileSync(new URL('src/data/importacao/exemplo-classes.json', root), 'utf8')) as { classes: Record<string, string> }).classes
  await preview(api, 'posicoes', file('exemplo-posicoes-2026-09.csv'), true)
  await officialPl(api, file('exemplo-pl-2026-09.csv'))
  await check(api, '2026-09-30')
  const q = await queue(api)
  console.log('\n▸ O comitê mapeia os ativos de exemplo')
  for (const a of q.assets) if (classes[a.asset_code]) await mapAsset(api, q, a.asset_code, classes[a.asset_code])
  await check(api, '2026-09-30')
  await preview(api, 'posicoes', file('exemplo-posicoes-2026-10.csv'), true)
  await preview(api, 'movimentos', file('exemplo-movimentos-2026-10.csv'), true)
  await officialPl(api, file('exemplo-pl-2026-10.csv'))
  const october = await check(api, '2026-10-31')
  await overview(api, '2026-10-31')

  // Confere o resultado: as três famílias conferidas e a rentabilidade da Andrade igual à de src/report.
  const months = JSON.parse(readFileSync(new URL('src/data/andrade-fechamentos.json', root), 'utf8')) as HouseholdMonths
  const [sep, oct] = months.closings
  const expected = monthReturn({ refDate: oct.refDate, startValue: sep.officialPl, endValue: oct.officialPl, flows: oct.flows, ipca: months.ipca })
  const andrade = october.find((r) => r.code === 'AND001')
  const problems = [
    ...['AND001', 'BAR001', 'COS001'].filter((code) => october.find((r) => r.code === code)?.status !== 'conferido').map((code) => `${code} não ficou conferida`),
    ...(andrade?.checks.real_return !== undefined && andrade.checks.real_return !== null && Math.abs(andrade.checks.real_return - expected.real) < 1e-12
      ? []
      : [`rentabilidade real da Andrade ${andrade?.checks.real_return} diferente da de src/report (${expected.real})`]),
  ]
  if (problems.length > 0) throw new Error(`Exemplo com problema: ${problems.join('; ')}.`)
  console.log(`\n✔ Exemplo conferido: 3 famílias conferidas; rentabilidade real da Andrade em out/2026 igual à de src/report (${formatSignedPercent(expected.real, 4)}).`)
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  const api = new Api(localStack())
  switch (cmd) {
    case 'previa':
      if (args[0] !== 'posicoes' && args[0] !== 'movimentos') throw new Error('Use: previa <posicoes|movimentos> <arquivo> [--confirmar]')
      return preview(api, args[0], args[1], args.includes('--confirmar'))
    case 'pl':
      return officialPl(api, args[0])
    case 'conferir':
      return check(api, args[0])
    case 'fila':
      return void (await queue(api))
    case 'mapear':
      return mapAsset(api, await queue(api), args[0], args[1])
    case 'situacao':
      return overview(api, args[0], args[1])
    case 'exemplo':
      return example(api)
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'))
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
