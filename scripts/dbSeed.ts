// npm run db:seed: gera supabase/seed.sql a partir de src/data, só com dados fictícios, para o banco local.
// O seed nunca vai para a nuvem (SPEC, "Mensagens prontas": supabase db push sem o seed de exemplo).
// Usuários fictícios sem senha (não entram); para entrar no console local, a etapa 3 cria usuários de teste.
// O teste src/report/__tests__/seed.test.ts confere que o arquivo está em dia com este gerador.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Cma, HouseholdData, Profile } from '../src/engine/index.ts'
import { APP_FOOTER, BRIDGE_NOTE, FIRST_REPORT_NOTE, FULL_DISCLAIMER, REPORT_FOOTER_TEMPLATE, SUITABILITY_NOTICE } from '../src/report/texts.ts'
import type { HouseholdMonths } from '../src/report/types.ts'

const root = new URL('..', import.meta.url)
const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as T

/** UUID determinístico a partir de uma chave (o seed sai igual a cada geração). */
export function seedUuid(key: string): string {
  const h = createHash('md5').update(`aware-objective-seed:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const q = (v: string | null | undefined) => (v === null || v === undefined ? 'null' : `'${v.replace(/'/g, "''")}'`)
const n = (v: number | null | undefined) => (v === null || v === undefined ? 'null' : String(v))
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`
const b = (v: boolean | undefined) => (v ? 'true' : 'false')

/** Usuários fictícios, um por papel (dois na gestão, para os quatro olhos). */
const USERS = [
  { key: 'gestao-1', email: 'gestao.1@exemplo.invalid', role: 'gestao' },
  { key: 'gestao-2', email: 'gestao.2@exemplo.invalid', role: 'gestao' },
  { key: 'comite', email: 'comite@exemplo.invalid', role: 'comite' },
  { key: 'compliance', email: 'compliance@exemplo.invalid', role: 'compliance' },
  { key: 'banker-1', email: 'banker.1@exemplo.invalid', role: 'banker' },
  { key: 'banker-2', email: 'banker.2@exemplo.invalid', role: 'banker' },
  { key: 'responsavel-1', email: 'responsavel.1@exemplo.invalid', role: 'responsavel' },
  { key: 'cliente-barbosa', email: 'cliente.barbosa@exemplo.invalid', role: 'cliente_ai', household: 'barbosa' },
] as const

const userId = (key: (typeof USERS)[number]['key']) => seedUuid(`user:${key}`)

/** Família fictícia no formato do plano, com o cadastro do banco. */
interface SeedFamily {
  key: string
  code: string
  channel: 'cadm' | 'ai'
  /** Semente da família (D-030): cada família tem a sua. */
  seed: number
  banker?: (typeof USERS)[number]['key']
  owner?: (typeof USERS)[number]['key']
  data: HouseholdData
  planVersions: { baseMonth: string; snapshot: unknown; note: string }[]
}

function familySql(f: SeedFamily): string[] {
  const h = f.data.household
  const hid = seedUuid(`household:${f.key}`)
  const lines: string[] = []
  lines.push(
    `insert into public.households (id, code, name, channel, owner_id, banker_id, profile_id, weights_source, suitability, fee_rate, horizon_age, seed) values (` +
      [
        q(hid), q(f.code), q(h.name), q(f.channel), f.owner ? q(userId(f.owner)) : 'null', f.banker ? q(userId(f.banker)) : 'null',
        q(h.profileId), q(f.channel === 'cadm' ? 'perfil' : 'carteira_atual'), q(h.suitability), n(h.feeRate), n(h.horizonAge), n(f.seed),
      ].join(', ') + ');',
  )
  const personId = (id: string) => seedUuid(`person:${f.key}:${id}`)
  for (const p of f.data.people) {
    lines.push(
      `insert into public.people (id, household_id, name, birth_date, sex, role, retirement_age) values (` +
        [q(personId(p.id)), q(hid), q(p.name), q(p.birthDate), q(p.sex), q(p.role), n(p.retirementAge)].join(', ') + ');',
    )
  }
  const assetId = (id: string) => seedUuid(`other-asset:${f.key}:${id}`)
  for (const a of f.data.otherAssets) {
    lines.push(
      `insert into public.other_assets (id, household_id, kind, name, value, annual_income, can_be_sold, net_sale_value, class_code, in_simulation) values (` +
        [q(assetId(a.id)), q(hid), q(a.kind), q(a.name), n(a.value), n(a.annualIncome), b(a.canBeSold), n(a.netSaleValue), q(a.classCode), b(a.inSimulation)].join(', ') +
        ');',
    )
  }
  f.data.cashFlows.forEach((c, i) => {
    lines.push(
      `insert into public.cash_flows (id, household_id, kind, name, annual_amount_real, start_year, end_year, other_asset_id) values (` +
        [q(seedUuid(`cash-flow:${f.key}:${i}`)), q(hid), q(c.kind), q(c.name), n(c.annualAmountReal), n(c.startYear), n(c.endYear), c.otherAssetId ? q(assetId(c.otherAssetId)) : 'null'].join(', ') +
        ');',
    )
  })
  f.data.events.forEach((e, i) => {
    lines.push(
      `insert into public.events (id, household_id, name, direction, amount_real, year, month, recurrence, every_n, end_year) values (` +
        [q(seedUuid(`event:${f.key}:${i}`)), q(hid), q(e.name), q(e.direction), n(e.amountReal), n(e.year), n(e.month), q(e.recurrence), n(e.everyN), n(e.endYear)].join(', ') +
        ');',
    )
  })
  f.data.goals.forEach((g, i) => {
    lines.push(
      `insert into public.goals (id, household_id, kind, person_id, target_age, amount) values (` +
        [q(seedUuid(`goal:${f.key}:${i}`)), q(hid), q(g.kind), g.personId ? q(personId(g.personId)) : 'null', n(g.targetAge), n(g.amount)].join(', ') + ');',
    )
  })
  f.planVersions.forEach((v, i) => {
    lines.push(
      `insert into public.plan_versions (id, household_id, version, snapshot, base_month, note, created_by) values (` +
        [q(seedUuid(`plan:${f.key}:${i + 1}`)), q(hid), n(i + 1), j(v.snapshot), q(`${v.baseMonth}-01`), q(v.note), q(userId('gestao-1'))].join(', ') + ');',
    )
  })
  return lines
}

/** Plano de uma família no formato da versão (o que `plan_versions.snapshot` guarda). */
function snapshotOf(d: HouseholdData) {
  const { people, otherAssets, cashFlows, events, goals, rules } = d
  return { legacyMin: d.household.legacyMin, people, otherAssets, cashFlows, events, goals, rules }
}

export function buildSeedSql(): string {
  const andrade = readJson<HouseholdData>('src/data/andrade.json')
  const months = readJson<HouseholdMonths>('src/data/andrade-fechamentos.json')
  const cma = readJson<Cma & { profiles: Profile[] }>('src/data/premissas-ilustrativas-2026-10.json')

  // Família Barbosa (fictícia), do canal AI, para o ambiente local: casal de 45 e 43 anos, carteira atual.
  const barbosa: HouseholdData = {
    household: { id: 'barbosa', name: 'Família Barbosa (fictícia)', referenceDate: '2026-09-30', profileId: 'moderado', suitability: 'moderado', feeRate: 0.008, horizonAge: 95, legacyMin: 1_000_000 },
    people: [
      { id: 'marina', name: 'Marina Barbosa', birthDate: '1981-04-12', sex: 'F', role: 'titular', retirementAge: 60 },
      { id: 'paulo', name: 'Paulo Barbosa', birthDate: '1983-09-03', sex: 'M', role: 'conjuge' },
    ],
    cadmPositionsByClass: {},
    otherAssets: [{ id: 'apto', kind: 'imovel', name: 'Apartamento (residência)', value: 2_200_000, canBeSold: false }],
    cashFlows: [
      { kind: 'renda', name: 'Salário da Marina', annualAmountReal: 540_000, startYear: 2026, endYear: 2040 },
      { kind: 'gasto_essencial', name: 'Gasto essencial', annualAmountReal: 300_000, startYear: 2026, endYear: 2078 },
      { kind: 'gasto_estilo', name: 'Estilo de vida', annualAmountReal: 120_000, startYear: 2026, endYear: 2078 },
    ],
    events: [{ name: 'Troca de carro', direction: 'saida', amountReal: 180_000, year: 2029, recurrence: 'a_cada_n', everyN: 6, endYear: 2065 }],
    goals: [{ kind: 'padrao_de_vida', personId: 'paulo', targetAge: 95 }, { kind: 'legado', amount: 1_000_000 }],
    rules: andrade.rules,
  }

  // Família Costa (fictícia), da CADM, de outro banker: aposentada, perfil conservador.
  const costa: HouseholdData = {
    household: { id: 'costa', name: 'Família Costa (fictícia)', referenceDate: '2026-09-30', profileId: 'conservador', suitability: 'conservador', feeRate: 0.008, horizonAge: 95, legacyMin: 0 },
    people: [{ id: 'jorge', name: 'Jorge Costa', birthDate: '1958-02-20', sex: 'M', role: 'titular' }],
    cadmPositionsByClass: {},
    otherAssets: [],
    cashFlows: [
      { kind: 'gasto_essencial', name: 'Gasto essencial', annualAmountReal: 240_000, startYear: 2026, endYear: 2053 },
      { kind: 'gasto_estilo', name: 'Estilo de vida', annualAmountReal: 96_000, startYear: 2026, endYear: 2053 },
    ],
    events: [],
    goals: [],
    rules: andrade.rules,
  }

  const families: SeedFamily[] = [
    {
      key: 'andrade',
      code: 'AND001',
      channel: 'cadm',
      seed: 20261002,
      banker: 'banker-1',
      data: andrade,
      planVersions: months.planVersions.map((v) => ({ baseMonth: v.baseMonth, snapshot: v.snapshot, note: v.note ?? '' })),
    },
    { key: 'barbosa', code: 'BAR001', channel: 'ai', seed: 81340217, owner: 'responsavel-1', data: barbosa, planVersions: [{ baseMonth: '2026-09', snapshot: snapshotOf(barbosa), note: 'Plano inicial.' }] },
    { key: 'costa', code: 'COS001', channel: 'cadm', seed: 55219034, banker: 'banker-2', data: costa, planVersions: [{ baseMonth: '2026-09', snapshot: snapshotOf(costa), note: 'Plano inicial.' }] },
  ]

  const out: string[] = [
    '-- Gerado por `npm run db:seed` (scripts/dbSeed.ts) a partir de src/data. Não edite à mão.',
    '-- Só dados fictícios, só para o banco local; nunca vai para a nuvem (supabase db push sem o seed).',
    '-- Usuários fictícios sem senha: existem para os papéis e os testes; não entram no Auth.',
    '',
    '-- Usuários e papéis',
  ]
  for (const u of USERS) {
    out.push(
      `insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values (` +
        `${q(userId(u.key))}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(u.email)}, '{}'::jsonb, '{}'::jsonb, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');`,
    )
  }

  const roleSql = (u: (typeof USERS)[number]) => {
    const hid = 'household' in u ? q(seedUuid(`household:${u.household}`)) : 'null'
    return `insert into public.user_roles (id, user_id, household_id, role) values (${q(seedUuid(`role:${u.key}`))}, ${q(userId(u.key))}, ${hid}, ${q(u.role)});`
  }
  out.push('', '-- Papéis sem família (o banker e o responsável se ligam às famílias por banker_id e owner_id)')
  for (const u of USERS) if (!('household' in u)) out.push(roleSql(u))

  out.push('', '-- Perfis e premissas ilustrativas (versão vigente, aprovada pelo comitê fictício)')
  for (const p of cma.profiles) {
    out.push(`insert into public.profiles (id, name, weights_pre, weights_post) values (${q(p.id)}, ${q(p.name)}, ${j(p.weightsPre)}, ${p.weightsPost ? j(p.weightsPost) : 'null'});`)
  }
  const cmaId = seedUuid(`cma:${cma.version}`)
  out.push(
    `insert into public.cma_versions (id, label, effective_date, status, nu, approved_by, approved_at, created_by) values (` +
      `${q(cmaId)}, ${q(cma.version)}, '2026-10-01', 'rascunho', ${cma.nu}, null, null, ${q(userId('comite'))});`,
  )
  for (const c of cma.classes) {
    out.push(`insert into public.cma_classes (cma_version_id, class_code, name, benchmark, mu_real, vol) values (${q(cmaId)}, ${q(c.code)}, ${q(c.name)}, ${q(c.benchmark)}, ${n(c.mu)}, ${n(c.vol)});`)
  }
  cma.classes.forEach((a, i) =>
    cma.classes.forEach((bcls, k) => {
      if (k <= i) return
      const [ca, cb] = a.code < bcls.code ? [a.code, bcls.code] : [bcls.code, a.code]
      out.push(`insert into public.cma_correlations (cma_version_id, class_a, class_b, rho) values (${q(cmaId)}, ${q(ca)}, ${q(cb)}, ${n(cma.correlation[i][k])});`)
    }),
  )
  out.push(`update public.cma_versions set status = 'aprovada', approved_by = ${q(userId('comite'))}, approved_at = '2026-10-01T00:00:00Z' where id = ${q(cmaId)};`)
  out.push(`update public.cma_versions set status = 'vigente' where id = ${q(cmaId)};`)

  out.push('', '-- Famílias fictícias')
  for (const f of families) out.push(`-- ${f.data.household.name}`, ...familySql(f))

  out.push('', '-- Clientes AI e as suas famílias')
  for (const u of USERS) if ('household' in u) out.push(roleSql(u))

  out.push('', '-- Textos legais do SPEC, em rascunho até a compliance aprovar')
  const texts: [string, string][] = [
    ['rodape_relatorio', REPORT_FOOTER_TEMPLATE],
    ['rodape_app', APP_FOOTER],
    ['nota_ponte', BRIDGE_NOTE],
    ['primeiro_relatorio', FIRST_REPORT_NOTE],
    ['aviso_completo', FULL_DISCLAIMER],
    ['perfil_acima_suitability', SUITABILITY_NOTICE],
  ]
  for (const [key, body] of texts) {
    out.push(`insert into public.legal_texts (id, key, version, body, status) values (${q(seedUuid(`text:${key}`))}, ${q(key)}, 1, ${q(body)}, 'rascunho');`)
  }

  // Valores como o Banco Central publica: dólar de venda em reais (série 1) e IPCA do mês em % (série 433, no dia 1).
  out.push('', '-- Séries de mercado fictícias para a importação de exemplo (a rotina do Banco Central vem na etapa 3)')
  const example = readJson<{ dolar: Record<string, number> }>('src/data/importacao/exemplo-classes.json')
  for (const [date, value] of Object.entries(example.dolar)) {
    out.push(`insert into public.market_series (series_code, date, value, source) values ('dolar', ${q(date)}, ${n(value)}, 'ficticio');`)
  }
  for (const [month, value] of Object.entries(months.ipca)) {
    out.push(`insert into public.market_series (series_code, date, value, source) values ('ipca', ${q(`${month}-01`)}, ${n(Math.round(value * 1e6) / 1e4)}, 'ficticio');`)
  }
  return `${out.join('\n')}\n`
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  writeFileSync(new URL('supabase/seed.sql', root), buildSeedSql())
  console.log('supabase/seed.sql gravado')
}
