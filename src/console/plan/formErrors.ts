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

/**
 * Caminho de um problema do banco no formulário do plano. A meta de legado (depois das metas de padrão de vida) é o
 * campo "legado mínimo"; identificador repetido e item inteiro vão para a raiz da lista; a regra inteira, para a raiz.
 */
export function planFormPath(path: string, lifeGoals: number): string {
  const parts = path.split('.')
  if (parts[0] === 'goals' && parts.length >= 2 && Number(parts[1]) >= lifeGoals) return 'legacyMin'
  if (LISTS.has(parts[0]) && (parts.length === 2 || parts[2] === 'id')) return `${parts[0]}.root`
  if (parts[0] === 'rules' && parts.length === 1) return 'root.server'
  return fieldPath(path)
}

const SECTION_LABELS: Record<string, string> = {
  people: 'Pessoa',
  otherAssets: 'Bem',
  cashFlows: 'Renda ou gasto',
  events: 'Evento',
  goals: 'Meta',
  rules: 'Regras de gasto flexível',
  legacyMin: 'Legado mínimo',
}

/** O problema com o lugar dele, para a lista que acompanha a recusa: "Pessoa 2: Informe o nome." */
export function describeIssue(issue: FieldIssue): string {
  const [section, index] = issue.path.split('.')
  const label = SECTION_LABELS[section]
  if (!label) return issue.message
  return /^\d+$/.test(index ?? '') ? `${label} ${Number(index) + 1}: ${issue.message}` : `${label}: ${issue.message}`
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
