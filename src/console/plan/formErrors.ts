// Problemas de preenchimento (do esquema do plano ou do banco) como erros por campo do React Hook Form: o caminho
// "people.0.name" vira errors.people[0].name; o problema de uma lista inteira ("people") vai para a raiz dela
// (errors.people.root), e o do plano todo (caminho vazio), para errors.root. Fica a primeira mensagem de cada campo.

import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form'
import type { FieldIssue } from '../../lib/apiTypes.ts'
import { formToSnapshot, type PlanForm } from '../../lib/planForm.ts'
import { planSnapshotSchema, type PlanSchemaOptions } from '../../lib/planSchema.ts'

const LISTS = new Set(['people', 'otherAssets', 'cashFlows', 'events', 'goals'])

/** Caminho do campo no formulário: lista inteira vai para a raiz dela; o plano todo, para a raiz do formulário. */
export function fieldPath(path: string): string {
  if (path === '') return 'root.server'
  return LISTS.has(path) ? `${path}.root` : path
}

export function issuesToFieldErrors<T extends FieldValues>(issues: readonly FieldIssue[]): FieldErrors<T> {
  const out: Record<string, unknown> = {}
  for (const issue of issues) {
    const keys = fieldPath(issue.path).split('.')
    let node: Record<string, unknown> = out
    keys.forEach((key, i) => {
      if (i === keys.length - 1) {
        node[key] ??= { type: 'custom', message: issue.message }
        return
      }
      node[key] ??= /^\d+$/.test(keys[i + 1]) ? [] : {}
      node = node[key] as Record<string, unknown>
    })
  }
  return out as FieldErrors<T>
}

/** Valida o formulário do plano com o esquema (o mesmo das entradas do motor), sem transformar os valores do formulário. */
export function planFormResolver(opts: PlanSchemaOptions): Resolver<PlanForm> {
  return async (values) => {
    const r = planSnapshotSchema(opts).safeParse(formToSnapshot(values))
    if (r.success) return { values, errors: {} }
    return { values: {}, errors: issuesToFieldErrors<PlanForm>(r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))) }
  }
}
