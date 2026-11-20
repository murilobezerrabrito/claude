// Passos da importação do mês pela API do Supabase LOCAL, em nome de usuários fictícios da gestão e do comitê: prévia e
// confirmação das planilhas, PL oficial, conferência, fila de mapeamento, rodada oficial em lote e situação do mês. Usados
// por `npm run db:import` e pelo teste do relatório no navegador (que prepara o próprio mês). Escrevem o andamento no
// terminal; um arquivo ou uma recusa do banco viram erro.

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
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
import { runMonthBatch, type FamilyRunState, type RunAction, type RunCall } from '../src/console/monthRun.ts'

/**
 * Quem age (um LocalApi com esses usuários, ao menos): a gestão importa, confere e roda; o comitê mapeia os ativos.
 */
export interface ImportApi {
  rpc<T>(as: 'gestao' | 'comite', fn: string, args?: Record<string, unknown>): Promise<T>
  fn<T>(as: 'gestao', name: string, body: unknown): Promise<T>
}
type Api = ImportApi

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
    throw new Error(`${basename(path)}: arquivo recusado.`)
  }
  return result
}

export async function preview(api: Api, kind: 'posicoes' | 'movimentos', path: string, confirm: boolean) {
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
    throw new Error(`${basename(path)}: o banco recusou o arquivo.`)
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

export async function officialPl(api: Api, path: string) {
  console.log(`\n▸ PL oficial: ${basename(path)}`)
  const file = readFile(path, readOfficialPl)
  const r = await api.rpc<OfficialPlResult>('gestao', 'set_official_pl', { p_rows: officialPlToRpc(file.rows) })
  if (!r.ok) {
    printIssues('  O banco recusou o arquivo:', r.errors)
    throw new Error(`${basename(path)}: o banco recusou o PL.`)
  }
  console.log(`  ${r.families} famílias; ${r.changed} com PL novo.`)
}

export async function check(api: Api, refDate: string): Promise<CheckResult[]> {
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

export async function queue(api: Api): Promise<MappingQueue> {
  const q = await api.rpc<MappingQueue>('comite', 'unmapped_assets')
  console.log(`\n▸ Fila de mapeamento: ${q.assets.length} ativos sem classe`)
  for (const a of q.assets) {
    const s = a.suggestion ? ` (sugestão: ${a.suggestion.class_code}, como ${a.suggestion.asset_code})` : ''
    console.log(`  ${a.asset_code} ${a.name}: ${plural(a.families_waiting, 'família esperando', 'famílias esperando')}${s}`)
  }
  console.log(`  Classes vigentes: ${q.classes.map((c) => c.class_code).join(', ')}`)
  return q
}

export async function mapAsset(api: Api, q: MappingQueue, code: string, classCode: string) {
  const asset = q.assets.find((a) => a.asset_code === code)
  if (!asset) throw new Error(`O ativo ${code} não está na fila.`)
  const r = await api.rpc<{ months_reset: number }>('comite', 'map_asset', { p_asset: asset.id, p_class_code: classCode })
  console.log(`  ${code} → ${classCode} (meses reabertos para a conferência: ${r.months_reset})`)
}

export async function overview(api: Api, refDate: string, channel?: string) {
  const o = await api.rpc<MonthOverview>('gestao', 'month_overview', { p_ref_date: refDate, ...(channel ? { p_channel: channel } : {}) })
  console.log(`\n▸ Situação de ${refDate}`)
  for (const f of o.families) console.log(`  [${f.channel}] ${f.code} ${f.name}: ${f.status} (${plural(f.positions, 'posição', 'posições')}, ${plural(f.flows, 'movimento', 'movimentos')})`)
  for (const c of o.closings) console.log(`  Canal ${c.channel}: ${c.status}`)
  for (const b of o.batches) console.log(`  Lote ${b.kind} ${b.file_name}: ${b.status}, ${b.rows} linhas`)
}

/** Rodada oficial das famílias conferidas no mês, como o console faz (src/console/monthRun.ts), em sequência. */
export async function runMonth(api: Api, refDate: string): Promise<FamilyRunState[]> {
  console.log(`\n▸ Rodada oficial de ${refDate}`)
  const o = await api.rpc<MonthOverview>('gestao', 'month_overview', { p_ref_date: refDate })
  const toRun = o.families.filter((x) => x.status === 'conferido')
  if (toRun.length === 0) console.log('  Nenhuma família conferida para rodar.')
  const call: RunCall = <T,>(body: RunAction) => api.fn<T>('gestao', 'official-run', body)
  // Uma chamada de cada vez: o tempo de cada uma é o de uma simulação sozinha (ponto de parada B), e a máquina de dois
  // núcleos da integração contínua não recusa simulações simultâneas por carga.
  const states = await runMonthBatch(toRun, refDate, call, () => {}, 1)
  for (const r of states) {
    console.log(
      r.state === 'rodada'
        ? `  ${r.code}: chance ${((r.probability ?? 0) * 100).toFixed(2).replace('.', ',')}% · ${r.partsTotal} partes · maior tempo de cálculo numa chamada: ${r.maxPartMs} ms`
        : `  ${r.code}: ✖ ${r.error}`,
    )
  }
  return states
}
