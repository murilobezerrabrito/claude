import { describe, expect, it } from 'vitest'
import dataset from '../../data/andrade-fechamentos.json'
import { snapshotToForm } from '../../lib/planForm.ts'
import type { PlanSnapshot } from '../../report/types.ts'
import { describeIssue, fieldPath, issuesToFieldErrors, planFormPath, planFormResolver } from '../plan/formErrors.ts'

const snapshot = (dataset as unknown as { planVersions: { snapshot: PlanSnapshot }[] }).planVersions[1].snapshot

describe('erros por campo do editor do plano', () => {
  it('caminhos: campo, lista inteira e plano todo', () => {
    expect(fieldPath('people.0.name')).toBe('people.0.name')
    expect(fieldPath('people')).toBe('people.root')
    expect(fieldPath('rules.upper')).toBe('rules.upper')
    expect(fieldPath('')).toBe('root.server')
  })

  it('problemas do banco no formulário: legado, identificador repetido, item inteiro e regras', () => {
    // Duas metas de padrão de vida no formulário: a terceira meta da versão é a de legado.
    expect(planFormPath('goals.2.amount', 2)).toBe('legacyMin')
    expect(planFormPath('goals.1.targetAge', 2)).toBe('goals.1.targetAge')
    expect(planFormPath('otherAssets.3.id', 0)).toBe('otherAssets.root')
    expect(planFormPath('people.0', 0)).toBe('people.root')
    expect(planFormPath('rules', 0)).toBe('root.server')
    expect(planFormPath('rules.cap', 0)).toBe('rules.cap')
    expect(describeIssue({ path: 'people.1.name', message: 'Informe o nome.' })).toBe('Pessoa 2: Informe o nome.')
    expect(describeIssue({ path: 'rules.cap', message: 'x' })).toBe('Regras de gasto flexível: x')
    expect(describeIssue({ path: '', message: 'Campo desconhecido: cpf.' })).toBe('Campo desconhecido: cpf.')
  })

  it('monta o objeto de erros do React Hook Form; fica a primeira mensagem de cada campo', () => {
    const errors = issuesToFieldErrors([
      { path: 'people.1.name', message: 'Informe o nome.' },
      { path: 'people.1.name', message: 'outra' },
      { path: 'people', message: 'O plano precisa de um titular.' },
      { path: 'rules.upper', message: 'O gatilho superior precisa ser maior que o inferior.' },
      { path: '', message: 'Campo desconhecido: cpf.' },
    ]) as Record<string, unknown>
    expect(errors).toEqual({
      people: Object.assign([undefined, { name: { type: 'custom', message: 'Informe o nome.' } }], { root: { type: 'custom', message: 'O plano precisa de um titular.' } }),
      rules: { upper: { type: 'custom', message: 'O gatilho superior precisa ser maior que o inferior.' } },
      root: { server: { type: 'custom', message: 'Campo desconhecido: cpf.' } },
    })
  })

  it('o resolvedor valida com o esquema do plano e mantém os valores do formulário', async () => {
    const resolver = planFormResolver({ classes: ['POS'], today: '2026-10-10' })
    const form = snapshotToForm(snapshot)
    const ok = await resolver(form, undefined, { fields: {}, shouldUseNativeValidation: false })
    expect(ok.errors).toEqual({})
    expect(ok.values).toBe(form)
    const bad = await resolver({ ...form, events: [{ ...form.events[0], month: '13' }, ...form.events.slice(1)] }, undefined, { fields: {}, shouldUseNativeValidation: false })
    expect((bad.errors as Record<string, { month?: { message: string } }[]>).events[0].month?.message).toBe('Use um mês de 1 a 12.')
  })
})
