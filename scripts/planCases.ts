// npm run db:plan-cases: gera supabase/tests/12_paridade_plano.test.sql a partir de src/data/plano/casos-invalidos.json.
// Os mesmos casos rodam no esquema do console (src/lib/__tests__/paridade.test.ts) e na conferência do banco
// (app.plan_snapshot_errors): os dois precisam apontar os mesmos campos. O teste do Vitest confere que o arquivo gerado
// está em dia com este gerador.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type PlanCaseOp =
  | { op: 'set'; path: (string | number)[]; value: unknown }
  | { op: 'remove'; path: (string | number)[] }
  | { op: 'push'; path: (string | number)[]; value: unknown }
  | { op: 'fill'; path: (string | number)[]; count: number }

export interface PlanCase {
  name: string
  ops: PlanCaseOp[]
  /** Campos com problema, sem repetição, em ordem. */
  paths: string[]
}

export interface PlanCases {
  classes: string[]
  base: unknown
  cases: PlanCase[]
}

const root = new URL('..', import.meta.url)
export const OUTPUT = 'supabase/tests/12_paridade_plano.test.sql'

export function loadPlanCases(): PlanCases {
  return JSON.parse(readFileSync(new URL('src/data/plano/casos-invalidos.json', root), 'utf8')) as PlanCases
}

/** A versão de base com as mudanças do caso (cópia; a base não muda). */
export function applyOps(base: unknown, ops: readonly PlanCaseOp[]): unknown {
  let doc = structuredClone(base)
  for (const o of ops) {
    if (o.path.length === 0) {
      if (o.op !== 'set') throw new Error('Na raiz, só "set".')
      doc = structuredClone(o.value)
      continue
    }
    const parent = o.path.slice(0, -1).reduce<Record<string | number, unknown>>((node, key) => node[key] as Record<string | number, unknown>, doc as Record<string, unknown>)
    const key = o.path[o.path.length - 1]
    if (o.op === 'set') parent[key] = structuredClone(o.value)
    else if (o.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(key), 1)
      else delete parent[key]
    } else if (o.op === 'push') (parent[key] as unknown[]).push(structuredClone(o.value))
    else {
      const list = parent[key] as unknown[]
      parent[key] = Array.from({ length: o.count }, () => structuredClone(list[0]))
    }
  }
  return doc
}

const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`
const sqlArray = (items: readonly string[]) => (items.length === 0 ? `'{}'::text[]` : `array[${items.map(sqlText).join(', ')}]::text[]`)

export function buildPlanCasesSql(data: PlanCases = loadPlanCases()): string {
  const classes = sqlArray(data.classes)
  const lines = [
    '-- Gerado por `npm run db:plan-cases` (scripts/planCases.ts) a partir de src/data/plano/casos-invalidos.json. Não edite à mão.',
    '-- Paridade entre a conferência do banco (app.plan_snapshot_errors) e o esquema do console (src/lib/planSchema.ts): os',
    '-- mesmos casos rodam no Vitest (src/lib/__tests__/paridade.test.ts) e precisam apontar os mesmos campos.',
    'begin;',
    `select plan(${data.cases.length});`,
    '',
  ]
  for (const c of data.cases) {
    const snapshot = JSON.stringify(applyOps(data.base, c.ops))
    if (snapshot.includes('$caso$')) throw new Error(`O caso "${c.name}" tem $caso$ no texto.`)
    lines.push(
      'select is(',
      `  (select coalesce(array_agg(p order by p), '{}') from (select distinct e ->> 'path' as p from jsonb_array_elements(`,
      `    app.plan_snapshot_errors($caso$${snapshot}$caso$::jsonb, ${classes})) e) t),`,
      `  ${sqlArray([...c.paths].sort())},`,
      `  ${sqlText(c.name)});`,
    )
  }
  lines.push('', 'select * from finish();', 'rollback;', '')
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL(OUTPUT, root), buildPlanCasesSql())
  console.log(`${OUTPUT} gerado com ${loadPlanCases().cases.length} casos.`)
}
