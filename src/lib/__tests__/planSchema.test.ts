import { describe, expect, it } from 'vitest'
import andrade from '../../data/andrade.json'
import dataset from '../../data/andrade-fechamentos.json'
import type { HouseholdData } from '../../engine/types.ts'
import type { PlanSnapshot } from '../../report/types.ts'
import { emptyPlanForm, formToSnapshot, parseDecimalBr, parseIntBr, planLegacy, snapshotToForm } from '../planForm.ts'
import { isValidIsoDate, planSnapshotIssues, planSnapshotSchema } from '../planSchema.ts'

const versions = (dataset as unknown as { planVersions: { baseMonth: string; snapshot: PlanSnapshot }[] }).planVersions
const CLASSES = ['POS', 'INF', 'PRE', 'CRED', 'MM', 'ACOES', 'FII', 'INTL']
const opts = { classes: CLASSES, today: '2026-10-10' }
const clone = <T,>(v: T): T => structuredClone(v)
const v2 = () => clone(versions[versions.length - 1].snapshot)
const messages = (s: unknown) => planSnapshotIssues(s, opts).map((i) => `${i.path}: ${i.message}`)

/** Igualdade de significado: falso e ausente valem o mesmo nos campos booleanos dos bens. */
function normalized(p: PlanSnapshot): PlanSnapshot {
  return {
    ...p,
    otherAssets: p.otherAssets.map((a) => {
      const { canBeSold, inSimulation, ...rest } = a
      return { ...rest, ...(canBeSold ? { canBeSold } : {}), ...(inSimulation ? { inSimulation } : {}) }
    }),
  }
}

describe('esquema da versão do plano', () => {
  it('os planos fictícios passam: as duas versões da Andrade e o plano de andrade.json', () => {
    for (const v of versions) expect(messages(v.snapshot)).toEqual([])
    const h = andrade as unknown as HouseholdData
    const { people, otherAssets, cashFlows, events, goals, rules } = h
    expect(messages({ legacyMin: h.household.legacyMin, people, otherAssets, cashFlows, events, goals, rules })).toEqual([])
  })

  it('titular: exatamente um; cônjuge: no máximo um', () => {
    const p = v2()
    p.people = p.people.filter((x) => x.role !== 'titular')
    expect(messages(p)).toContain('people: O plano precisa de um titular.')
    const q = v2()
    q.people.push({ ...q.people[1], id: 'outra' })
    expect(messages(q)).toContain('people: O plano tem no máximo um cônjuge.')
  })

  it('datas, idades e anos com as faixas do banco', () => {
    const p = v2()
    p.people[0].birthDate = '1974-02-30'
    p.people[1].birthDate = '2027-01-01'
    p.people[0].retirementAge = 101
    p.goals[0].targetAge = 59
    p.events[0].month = 13
    expect(messages(p)).toEqual(
      expect.arrayContaining([
        'people.0.birthDate: Data de nascimento inválida: use dia, mês e ano.',
        'people.1.birthDate: A data de nascimento está no futuro.',
        'people.0.retirementAge: A idade de aposentadoria vai de 30 a 100 anos.',
        'goals.0.targetAge: A idade da meta vai de 60 a 110 anos.',
        'events.0.month: Use um mês de 1 a 12.',
      ]),
    )
  })

  it('valores negativos ou que não são número', () => {
    const p = v2() as unknown as Record<string, Record<string, unknown>[]>
    p.cashFlows[0].annualAmountReal = -1
    p.otherAssets[0].value = Number.NaN
    expect(messages(p)).toEqual(expect.arrayContaining(['cashFlows.0.annualAmountReal: O valor anual não pode ser negativo.', 'otherAssets.0.value: Informe o valor em reais.']))
  })

  it('referências: pessoa da meta, bem do fluxo e classe do bem na simulação', () => {
    const p = v2()
    p.goals[0].personId = 'ninguem'
    p.cashFlows[1].otherAssetId = 'sumiu'
    p.otherAssets[0].classCode = 'XYZ'
    p.otherAssets[1].inSimulation = true
    expect(messages(p)).toEqual([
      'otherAssets.0.classCode: A classe XYZ não está nas premissas vigentes.',
      'otherAssets.1.classCode: O bem que entra na simulação precisa de uma classe.',
      'cashFlows.1.otherAssetId: O bem ligado a este fluxo não está no plano.',
      'goals.0.personId: A pessoa da meta não está no plano.',
    ])
  })

  it('eventos recorrentes precisam de fim; "a cada N" precisa do intervalo; fluxos não terminam antes de começar', () => {
    const p = v2()
    p.events[0].endYear = undefined
    p.events[2].everyN = undefined
    p.cashFlows[0].endYear = 2020
    expect(messages(p)).toEqual([
      'cashFlows.0.endYear: O ano de fim vem antes do ano de início.',
      'events.0.endYear: O evento recorrente precisa de um ano de fim.',
      'events.2.everyN: Informe a cada quantos anos.',
    ])
  })

  it('regras de gasto flexível com as faixas do motor', () => {
    const p = v2()
    p.rules = { ...p.rules, lower: 1.3, cut: 1, floor: 0, cap: 0.9, noCutLastYears: 2.5 }
    expect(messages(p)).toEqual(
      expect.arrayContaining([
        'rules.cut: O corte vai de 0% a menos de 100%.',
        'rules.floor: O piso vai de mais de 0% a 100% do estilo de vida inicial.',
        'rules.cap: O teto é de pelo menos 100% do estilo de vida inicial.',
        'rules.noCutLastYears: Use um número inteiro de anos.',
        'rules.upper: O gatilho superior precisa ser maior que o inferior.',
      ]),
    )
  })

  it('as regras entre campos aparecem junto com os erros de campo, e não repetem o erro do campo', () => {
    const p = v2() as unknown as { people: { name: string }[]; cashFlows: { endYear: number }[]; rules: { lower: number } }
    p.people[0].name = ''
    p.cashFlows[0].endYear = 2020
    p.rules.lower = Number.NaN
    expect(messages(p)).toEqual(['people.0.name: Informe o nome.', 'rules.lower: Informe o gatilho inferior.', 'cashFlows.0.endYear: O ano de fim vem antes do ano de início.'])
    expect(messages({ people: 'x' })).toEqual(expect.arrayContaining(['people: Invalid input: expected array, received string']))
  })

  it('campos desconhecidos saem da versão gravada', () => {
    const p = { ...v2(), extra: 1, people: v2().people.map((x) => ({ ...x, cpf: '000' })) }
    const out = planSnapshotSchema(opts).parse(p)
    expect('extra' in out).toBe(false)
    expect('cpf' in out.people[0]).toBe(false)
  })

  it('datas do calendário', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true)
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('29/02/2024')).toBe(false)
  })
})

describe('formulário do plano', () => {
  it('datas no formato brasileiro', () => {
    expect(snapshotToForm(v2()).people[0].birthDate).toBe('15/03/1974')
    const form = snapshotToForm(v2())
    form.people[0].birthDate = '31/02/1974'
    expect(messages(formToSnapshot(form))).toEqual(['people.0.birthDate: Data de nascimento inválida: use dia, mês e ano.'])
    form.people[0].birthDate = '1974-03-15'
    expect(messages(formToSnapshot(form))).toEqual([])
  })

  it('números no formato brasileiro', () => {
    expect(parseDecimalBr('1.204.800,00')).toBe(1204800)
    expect(parseDecimalBr('R$ 1.500')).toBe(1500)
    expect(parseDecimalBr('1500,5')).toBe(1500.5)
    expect(parseDecimalBr('1500.5')).toBe(1500.5)
    expect(parseDecimalBr('80')).toBe(80)
    expect(parseDecimalBr('')).toBeUndefined()
    expect(parseDecimalBr('1,2,3')).toBeNaN()
    expect(parseDecimalBr('12.34.56')).toBeNaN()
    expect(parseDecimalBr('abc')).toBeNaN()
    expect(parseIntBr('2030')).toBe(2030)
    expect(parseIntBr('')).toBeUndefined()
    expect(parseIntBr('20,5')).toBeNaN()
  })

  it('ida e volta: o plano da Andrade volta igual (falso e ausente valem o mesmo nos bens)', () => {
    for (const v of versions) {
      const back = planSnapshotSchema(opts).parse(formToSnapshot(snapshotToForm(v.snapshot)))
      expect(normalized(back as PlanSnapshot)).toEqual(normalized(v.snapshot))
    }
  })

  it('legado num campo só: o legado mínimo e a meta de legado com o mesmo valor (o maior, como o motor usa)', () => {
    const p = v2()
    p.legacyMin = 2_000_000
    expect(planLegacy(p)).toBe(3_012_000)
    const form = snapshotToForm(p)
    expect(form.legacyMin).toBe('3.012.000,00')
    const back = planSnapshotSchema(opts).parse(formToSnapshot(form))
    expect(back.legacyMin).toBe(3_012_000)
    expect(back.goals.filter((g) => g.kind === 'legado')).toEqual([{ kind: 'legado', amount: 3_012_000 }])
    // Sem legado: nem legado mínimo nem meta.
    const none = planSnapshotSchema(opts).parse(formToSnapshot({ ...form, legacyMin: '' }))
    expect(none.legacyMin).toBeUndefined()
    expect(none.goals.some((g) => g.kind === 'legado')).toBe(false)
  })

  it('percentuais das regras: 80% vira 0,8 e volta', () => {
    const form = snapshotToForm(v2())
    expect([form.rules.lower, form.rules.cut, form.rules.cap]).toEqual(['80', '10', '130'])
    const back = planSnapshotSchema(opts).parse(formToSnapshot({ ...form, rules: { ...form.rules, lower: '75,5' } }))
    expect(back.rules.lower).toBe(0.755)
  })

  it('as mensagens caem no campo do formulário com o mesmo nome', () => {
    const form = snapshotToForm(v2())
    form.people[0].name = ' '
    form.cashFlows[2].annualAmountReal = '1,2,3'
    form.events[1].year = ''
    expect(messages(formToSnapshot(form))).toEqual([
      'people.0.name: Informe o nome.',
      'cashFlows.2.annualAmountReal: Informe o valor anual em reais.',
      'events.1.year: Informe o ano.',
    ])
  })

  it('plano novo: só o titular a preencher, regras padrão desligadas', () => {
    let n = 0
    const form = emptyPlanForm(() => `p${++n}`)
    expect(messages(formToSnapshot(form))).toEqual(['people.0.name: Informe o nome.', 'people.0.birthDate: Informe a data de nascimento.', 'people.0.sex: Escolha o sexo.'])
    form.people[0] = { ...form.people[0], name: 'Fulana', birthDate: '1/2/1980', sex: 'F' }
    const ok = planSnapshotSchema(opts).parse(formToSnapshot(form))
    expect(ok.people[0].birthDate).toBe('1980-02-01')
    expect(ok.rules).toEqual({ enabled: false, mode: 'trajetoria_referencia', lower: 0.8, upper: 1.2, cut: 0.1, raise: 0.1, floor: 0.5, cap: 1.3, noCutLastYears: 15 })
  })
})
