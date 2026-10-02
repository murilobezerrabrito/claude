// npm run reference: roda a Família Andrade no motor e compara cada métrica com reference/resultados_referencia.json.
// Imprime o valor obtido, o de referência, a tolerância e se passou; termina com erro se alguma falhar.

import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import type { Cma, HouseholdData, Profile } from '../src/engine/index.ts'
import { DEFAULT_SEED } from '../src/engine/index.ts'
import { compare, computeMetrics, formatTolerance, formatValue, type ReferenceFile } from './referenceMetrics.ts'

const root = new URL('..', import.meta.url)
const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as T

const reference = readJson<ReferenceFile>('reference/resultados_referencia.json')
const household = readJson<HouseholdData>('src/data/andrade.json')
const cma = readJson<Cma & { profiles: Profile[] }>('src/data/premissas-ilustrativas-2026-10.json')

const paths = reference.trajetorias
const start = performance.now()
const values = computeMetrics({ household, cma, profiles: cma.profiles }, paths, DEFAULT_SEED)
const seconds = (performance.now() - start) / 1000
const rows = compare(reference, values)

const header = ['Métrica', 'Obtido', 'Referência', 'Tolerância', 'Resultado']
const table = rows.map((r) => [
  r.descricao,
  formatValue(r.obtido, r.unidade),
  formatValue(r.valor, r.unidade),
  formatTolerance(r.tolerancia, r.unidade),
  r.passou ? 'ok' : 'FALHOU',
])
const widths = header.map((h, c) => Math.max(h.length, ...table.map((row) => row[c].length)))
const line = (cells: string[]) => cells.map((cell, c) => (c === 0 ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join('  ')

console.log(`Família Andrade · premissas ${cma.version} · ${paths.toLocaleString('pt-BR')} trajetórias · semente ${DEFAULT_SEED} · ${seconds.toFixed(1)} s\n`)
console.log(line(header))
console.log(widths.map((w) => '─'.repeat(w)).join('  '))
for (const row of table) console.log(line(row))

const failed = rows.filter((r) => !r.passou)
console.log(failed.length === 0 ? `\nTodas as ${rows.length} métricas dentro das tolerâncias.` : `\n${failed.length} de ${rows.length} métricas fora das tolerâncias.`)
if (failed.length > 0) process.exitCode = 1
