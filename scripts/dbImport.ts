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
//   rodar <AAAA-MM-DD>                                     rodada oficial das famílias conferidas (Edge Function)
//   fechar <AAAA-MM-DD> <cadm|ai>                          fecha o mês do canal
//   exemplo                                                set e out/2026 das famílias fictícias, de ponta a ponta,
//                                                          com as rodadas e a comparação com src/report

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
import type { CheckResult, ImportConfirmResult, ImportPreviewResult, MappingQueue, MonthOverview, OfficialPlResult } from '../src/lib/apiTypes.ts'
import { formatMoneyExact, formatSignedPercent } from '../src/lib/format.ts'
import { readSheetFile } from '../src/lib/planilhas.ts'
import { call, ensureUser, localStack, newPassword, totp, type Local } from './localSupabase.ts'
import type { Cma, Profile } from '../src/engine/types.ts'
import { monthAttribution, type Bridge } from '../src/report/attribution.ts'
import { planVersionFor } from '../src/report/monthInputs.ts'
import { officialRun, type MonthPackage } from '../src/report/officialRun.ts'
import { monthReturn } from '../src/report/performance.ts'
import type { HouseholdMonths } from '../src/report/types.ts'

const root = new URL('..', import.meta.url)

// Usuários fictícios do comando: criados no Auth local e ligados ao papel; senha nova e segundo fator novo a cada uso.
const USERS = {
  gestao: { email: 'importacao.gestao@exemplo.invalid', role: 'gestao' },
  comite: { email: 'importacao.comite@exemplo.invalid', role: 'comite' },
} as const
type UserKind = keyof typeof USERS

/** Entra como o usuário fictício, com senha e segundo fator (aal2). Devolve o token de acesso. */
async function login(local: Local, kind: UserKind): Promise<string> {
  const { email, role } = USERS[kind]
  const password = newPassword()
  await ensureUser(local, email, role, password)
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

  /** Edge Function, com o token de quem está logado. */
  async fn<T>(as: UserKind, name: string, body: Record<string, unknown>): Promise<T> {
    await this.rpc(as, 'run_permission')
    const res = await fetch(`${this.local.url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: this.local.publishable, Authorization: `Bearer ${this.tokens.get(as)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as T & { erro?: string }
    if (!res.ok) throw new Error(`${name}: ${json.erro ?? res.status}`)
    return json
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
  const p = await api.rpc<ImportPreviewResult>('gestao', 'import_preview', { p_kind: kind, p_file_name: basename(path), p_rows: rows })
  if (!p.ok) {
    printIssues('  O banco recusou o arquivo (nada foi gravado):', p.errors)
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
  const done = await api.rpc<ImportConfirmResult>('gestao', 'import_confirm', { p_batch: p.batch_id })
  console.log(`  Confirmado: ${done.rows} linhas gravadas, ${done.replaced} substituídas, ${done.new_assets} ativos novos.`)
}

async function officialPl(api: Api, path: string) {
  console.log(`\n▸ PL oficial: ${basename(path)}`)
  const file = readFile(path, readOfficialPl)
  const r = await api.rpc<OfficialPlResult>('gestao', 'set_official_pl', { p_rows: officialPlToRpc(file.rows) })
  if (!r.ok) {
    printIssues('  O banco recusou o arquivo:', r.errors)
    process.exit(1)
  }
  console.log(`  ${r.families} famílias; ${r.changed} com PL novo.`)
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

async function queue(api: Api): Promise<MappingQueue> {
  const q = await api.rpc<MappingQueue>('comite', 'unmapped_assets')
  console.log(`\n▸ Fila de mapeamento: ${q.assets.length} ativos sem classe`)
  for (const a of q.assets) {
    const s = a.suggestion ? ` (sugestão: ${a.suggestion.class_code}, como ${a.suggestion.asset_code})` : ''
    console.log(`  ${a.asset_code} ${a.name}: ${plural(a.families_waiting, 'família esperando', 'famílias esperando')}${s}`)
  }
  console.log(`  Classes vigentes: ${q.classes.map((c) => c.class_code).join(', ')}`)
  return q
}

async function mapAsset(api: Api, q: MappingQueue, code: string, classCode: string) {
  const asset = q.assets.find((a) => a.asset_code === code)
  if (!asset) throw new Error(`O ativo ${code} não está na fila.`)
  const r = await api.rpc<{ months_reset: number }>('comite', 'map_asset', { p_asset: asset.id, p_class_code: classCode })
  console.log(`  ${code} → ${classCode} (meses reabertos para a conferência: ${r.months_reset})`)
}

async function overview(api: Api, refDate: string, channel?: string) {
  const o = await api.rpc<MonthOverview>('gestao', 'month_overview', { p_ref_date: refDate, ...(channel ? { p_channel: channel } : {}) })
  console.log(`\n▸ Situação de ${refDate}`)
  for (const f of o.families) console.log(`  [${f.channel}] ${f.code} ${f.name}: ${f.status} (${plural(f.positions, 'posição', 'posições')}, ${plural(f.flows, 'movimento', 'movimentos')})`)
  for (const c of o.closings) console.log(`  Canal ${c.channel}: ${c.status}`)
  for (const b of o.batches) console.log(`  Lote ${b.kind} ${b.file_name}: ${b.status}, ${b.rows} linhas`)
}

interface FamilyRun {
  code: string
  probability: number
  parts: number
  maxMs: number
}

/** Rodada oficial das famílias conferidas no mês, uma simulação por chamada à função `official-run`. */
async function runMonth(api: Api, refDate: string): Promise<FamilyRun[]> {
  console.log(`\n▸ Rodada oficial de ${refDate}`)
  const o = await api.rpc<MonthOverview>('gestao', 'month_overview', { p_ref_date: refDate })
  const out: FamilyRun[] = []
  for (const f of o.families.filter((x) => x.status === 'conferido')) {
    const where = { household_id: f.household_id, ref_date: refDate }
    const { partes } = await api.fn<{ partes: string[] }>('gestao', 'official-run', { acao: 'partes', ...where })
    const times: number[] = []
    for (const parte of partes) {
      const r = await api.fn<{ tempo_de_calculo_ms: number }>('gestao', 'official-run', { acao: 'parte', parte, ...where })
      times.push(r.tempo_de_calculo_ms)
    }
    const done = await api.fn<{ probability: number }>('gestao', 'official-run', { acao: 'concluir', ...where })
    const maxMs = Math.max(...times)
    console.log(`  ${f.code}: chance ${(done.probability * 100).toFixed(2).replace('.', ',')}% · ${partes.length} partes (${partes.join(', ')}) · cálculo por chamada: ${times.join(', ')} ms`)
    out.push({ code: f.code, probability: done.probability, parts: partes.length, maxMs })
  }
  if (out.length === 0) console.log('  Nenhuma família conferida para rodar.')
  return out
}

async function closeMonth(api: Api, refDate: string, channel: 'cadm' | 'ai') {
  const r = await api.rpc<{ closed: string[]; left_out: { code: string; status: string }[] }>('gestao', 'close_month', { p_ref_date: refDate, p_channel: channel })
  const left = r.left_out.length > 0 ? `; de fora: ${r.left_out.map((f) => `${f.code} (${f.status})`).join(', ')}` : ''
  console.log(`  Mês ${channel.toUpperCase()} de ${refDate} fechado com ${r.closed.join(', ')}${left}.`)
}

async function example(api: Api) {
  const file = (name: string) => fileURLToPath(new URL(`src/data/importacao/${name}`, root))
  const classes = (JSON.parse(readFileSync(new URL('src/data/importacao/exemplo-classes.json', root), 'utf8')) as { classes: Record<string, string> }).classes
  const september = await api.rpc<MonthOverview>('gestao', 'month_overview', { p_ref_date: '2026-09-30' })
  const sepClosed = ['AND001', 'BAR001', 'COS001'].every((c) => september.families.find((f) => f.code === c)?.status === 'fechado')
  if (sepClosed) console.log('\n▸ Setembro/2026 já está fechado para as três famílias: segue para outubro.')
  else {
    await preview(api, 'posicoes', file('exemplo-posicoes-2026-09.csv'), true)
    await officialPl(api, file('exemplo-pl-2026-09.csv'))
    await check(api, '2026-09-30')
    const q = await queue(api)
    console.log('\n▸ O comitê mapeia os ativos de exemplo')
    for (const a of q.assets) if (classes[a.asset_code]) await mapAsset(api, q, a.asset_code, classes[a.asset_code])
    await check(api, '2026-09-30')
    await runMonth(api, '2026-09-30')
    console.log('\n▸ Fechamento de setembro')
    await closeMonth(api, '2026-09-30', 'cadm')
    await closeMonth(api, '2026-09-30', 'ai')
  }
  await preview(api, 'posicoes', file('exemplo-posicoes-2026-10.csv'), true)
  await preview(api, 'movimentos', file('exemplo-movimentos-2026-10.csv'), true)
  await officialPl(api, file('exemplo-pl-2026-10.csv'))
  const october = await check(api, '2026-10-31')
  const runs = await runMonth(api, '2026-10-31')
  await overview(api, '2026-10-31')

  // Confere o resultado: as três famílias conferidas e a rentabilidade da Andrade igual à de src/report.
  const months = JSON.parse(readFileSync(new URL('src/data/andrade-fechamentos.json', root), 'utf8')) as HouseholdMonths
  const [sep, oct] = months.closings
  const expected = monthReturn({ refDate: oct.refDate, startValue: sep.officialPl, endValue: oct.officialPl, flows: oct.flows, ipca: months.ipca })
  const andrade = october.find((r) => r.code === 'AND001')
  // A rodada do servidor e a ponte contra o cálculo direto de src/report, com os mesmos dados (fechamentos fictícios).
  const cmaData = JSON.parse(readFileSync(new URL('src/data/premissas-ilustrativas-2026-10.json', root), 'utf8')) as Cma & { profiles: Profile[] }
  const pkgOf = (i: number): MonthPackage => ({
    household: months.household,
    planVersion: planVersionFor(months.planVersions, months.closings[i].refDate.slice(0, 7)),
    closing: months.closings[i],
    cma: cmaData,
    profiles: cmaData.profiles,
  })
  const publishedSep = officialRun(pkgOf(0), months.ipca)
  const expectedRun = officialRun(pkgOf(1), months.ipca)
  const expectedBridge = monthAttribution({ previous: { pkg: pkgOf(0), published: publishedSep }, current: pkgOf(1), ipca: months.ipca }) as Bridge
  const families = await api.rpc<{ code: string; latest: { probability: number } | null; previous_probability: number | null }[]>('gestao', 'families_overview', {})
  const andradeRun = families.find((f) => f.code === 'AND001')
  const andradeDelta = andradeRun?.latest && andradeRun.previous_probability !== null ? Math.round((andradeRun.latest.probability - andradeRun.previous_probability) * 10_000) : null
  const problems = [
    ...(runs.find((r) => r.code === 'AND001')?.probability === expectedRun.probability
      ? []
      : [`chance da Andrade em out/2026 ${runs.find((r) => r.code === 'AND001')?.probability} diferente da de src/report (${expectedRun.probability})`]),
    ...(andradeDelta === expectedBridge.totalSuccessDelta ? [] : [`variação da Andrade ${andradeDelta} trajetórias, diferente da ponte de src/report (${expectedBridge.totalSuccessDelta})`]),
    ...runs.filter((r) => r.maxMs > 1500).map((r) => `${r.code}: uma chamada levou ${r.maxMs} ms de cálculo, acima de 1,5 s`),
    ...['AND001', 'BAR001', 'COS001'].filter((code) => october.find((r) => r.code === code)?.status !== 'conferido').map((code) => `${code} não ficou conferida`),
    ...(andrade?.checks.real_return !== undefined && andrade.checks.real_return !== null && Math.abs(andrade.checks.real_return - expected.real) < 1e-12
      ? []
      : [`rentabilidade real da Andrade ${andrade?.checks.real_return} diferente da de src/report (${expected.real})`]),
  ]
  if (problems.length > 0) throw new Error(`Exemplo com problema: ${problems.join('; ')}.`)
  console.log(
    `\n✔ Exemplo conferido: 3 famílias rodadas em out/2026; Andrade com a chance (${(expectedRun.probability * 100).toFixed(2).replace('.', ',')}%), a variação no mês (${expectedBridge.totalSuccessDelta} trajetórias) e a rentabilidade real (${formatSignedPercent(expected.real, 4)}) iguais às de src/report; cálculo por chamada até ${Math.max(...runs.map((r) => r.maxMs))} ms.`,
  )
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
    case 'rodar':
      return void (await runMonth(api, args[0]))
    case 'fechar':
      if (args[1] !== 'cadm' && args[1] !== 'ai') throw new Error('Use: fechar <AAAA-MM-DD> <cadm|ai>')
      return closeMonth(api, args[0], args[1])
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
