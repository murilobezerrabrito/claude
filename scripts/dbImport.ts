// npm run db:import: a importação do mês de ponta a ponta no Supabase LOCAL, pela API, com login de verdade (senha e
// segundo fator) em usuários fictícios da gestão, do comitê e da compliance (textos legais do relatório). Serve para testar antes de o console existir.
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
//                                                          com as rodadas e a comparação com src/report, e o rascunho
//                                                          do relatório de out/2026 da Andrade (com os três cenários
//                                                          do exemplo) conferido contra o relatório da Fase 1

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Cma, Profile } from '../src/engine/types.ts'
import type { LegalTextRow, MonthOverview, ReportDetail, ReportDraftResult, ReportMonths, ReportScenarioResult } from '../src/lib/apiTypes.ts'
import { formatSignedPercent } from '../src/lib/format.ts'
import { monthAttribution, type Bridge } from '../src/report/attribution.ts'
import { planVersionFor } from '../src/report/monthInputs.ts'
import { officialRun, type MonthPackage } from '../src/report/officialRun.ts'
import { monthReturn } from '../src/report/performance.ts'
import type { HouseholdMonths } from '../src/report/types.ts'
import { check, mapAsset, officialPl, overview, preview, queue, runMonth } from './importSteps.ts'
import { LocalApi, localStack } from './localSupabase.ts'

const root = new URL('..', import.meta.url)

// Usuários fictícios do comando: criados no Auth local e ligados ao papel; senha nova e segundo fator novo a cada uso.
const USERS = {
  gestao: { email: 'importacao.gestao@exemplo.invalid', role: 'gestao' },
  comite: { email: 'importacao.comite@exemplo.invalid', role: 'comite' },
  compliance: { email: 'importacao.compliance@exemplo.invalid', role: 'compliance' },
} as const
type UserKind = keyof typeof USERS

type Api = LocalApi<UserKind>

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
    ...runs.filter((r) => r.state !== 'rodada').map((r) => `${r.code} não rodou (${r.error})`),
    ...(runs.find((r) => r.code === 'AND001')?.probability === expectedRun.probability
      ? []
      : [`chance da Andrade em out/2026 ${runs.find((r) => r.code === 'AND001')?.probability} diferente da de src/report (${expectedRun.probability})`]),
    ...(andradeDelta === expectedBridge.totalSuccessDelta ? [] : [`variação da Andrade ${andradeDelta} trajetórias, diferente da ponte de src/report (${expectedBridge.totalSuccessDelta})`]),
    ...['AND001', 'BAR001', 'COS001'].filter((code) => october.find((r) => r.code === code)?.status !== 'conferido').map((code) => `${code} não ficou conferida`),
    ...(andrade?.checks.real_return !== undefined && andrade.checks.real_return !== null && Math.abs(andrade.checks.real_return - expected.real) < 1e-12
      ? []
      : [`rentabilidade real da Andrade ${andrade?.checks.real_return} diferente da de src/report (${expected.real})`]),
  ]
  if (problems.length > 0) throw new Error(`Exemplo com problema: ${problems.join('; ')}.`)
  // Ponto de parada B (1,5 s por chamada): só aviso, porque o tempo daqui (servidor local, máquina compartilhada na
  // integração contínua) não é o do Supabase hospedado, onde a medição vale.
  const maxMs = Math.max(...runs.map((r) => r.maxPartMs ?? 0))
  for (const r of runs.filter((x) => (x.maxPartMs ?? 0) > 1500)) {
    console.log(`  ⚠ ${r.code}: uma chamada levou ${r.maxPartMs} ms de cálculo, acima de 1,5 s (ponto de parada B; medir no Supabase hospedado).`)
  }
  await exampleReport(api)
  console.log(
    `\n✔ Exemplo conferido: 3 famílias rodadas em out/2026; Andrade com a chance (${(expectedRun.probability * 100).toFixed(2).replace('.', ',')}%), a variação no mês (${expectedBridge.totalSuccessDelta} trajetórias) e a rentabilidade real (${formatSignedPercent(expected.real, 4)}) iguais às de src/report; cálculo por chamada até ${maxMs} ms.`,
  )
}

/** Diferenças esperadas entre o relatório feito pelo banco e o da Fase 1 (src/data/relatorios/andrade-2026-10.json). */
const EXPECTED_DIFFERENCES = [
  /^family\.(id|manager)$/, // identificador do banco e gestor do cadastro
  /inputsHash$/, // as entradas do banco levam os identificadores do banco
  /^run\.planVersionId$|^planVersion\.id$/,
  /^comment\./, // o rascunho ainda sem comentário (o da Fase 1 é o de exemplo)
  /^scenarios(\.|$)/, // no snapshot do rascunho, os cenários ficam à parte até a aprovação
  /^assumptions\.label$/,
  /^performance\.summary\.\w+\.cdi$/, // o seed tem o CDI fictício; o exemplo da Fase 1 não tem
]

/** Os três cenários do exemplo da Fase 1, com o nome automático. */
const EXAMPLE_SCENARIOS = [
  { cenario: { retirementAge: 59 }, name: 'Aposentar 3 anos antes (aos 59)' },
  { cenario: { shockPresetId: 'crise-2008' }, name: 'Crise como a de 2008 no 1º ano' },
  { cenario: { spendingMultiplier: 1.1 }, name: 'Gastar 10% a mais' },
]

/**
 * Relatório de out/2026 da Andrade pelo fluxo do banco: a compliance aprova os textos legais do relatório, a gestão
 * prepara o rascunho (a função monta os números da rodada publicada) e roda os três cenários do exemplo. Os números
 * são conferidos contra o relatório da Fase 1, com tolerância de 1e-9. Fica em rascunho: outubro continua rodado.
 */
async function exampleReport(api: Api) {
  console.log('\n▸ Relatório de out/2026 da Andrade pelo banco')
  const texts = await api.rpc<LegalTextRow[]>('compliance', 'legal_texts_overview')
  for (const t of texts) {
    if (!t.in_report || !t.draft) continue
    await api.rpc('compliance', 'approve_legal_text', { p_id: t.draft.id })
    console.log(`  Texto legal aprovado pela compliance: ${t.key} (versão ${t.draft.version})`)
  }
  const months = await api.rpc<ReportMonths>('gestao', 'report_months', { p_ref_date: '2026-10-31' })
  const andrade = months.families.find((f) => f.code === 'AND001')
  if (!andrade) throw new Error('A Andrade não está nos relatórios de out/2026.')
  const reason = 'Nova conferência do db:import exemplo.'
  if (andrade.latest && (andrade.latest.status === 'rascunho' || andrade.latest.status === 'em_revisao')) {
    await api.rpc('gestao', 'discard_report', { p_report: andrade.latest.id, p_reason: reason })
    console.log(`  Versão ${andrade.latest.version} aberta descartada.`)
  }
  const draft = await api.fn<ReportDraftResult>('gestao', 'report', {
    acao: 'rascunho',
    household_id: andrade.household_id,
    ref_date: '2026-10-31',
    ...(andrade.latest ? { motivo: reason } : {}),
  })
  console.log(`  Rascunho da versão ${draft.version}.`)
  for (const s of EXAMPLE_SCENARIOS) {
    const r = await api.fn<ReportScenarioResult>('gestao', 'report', { acao: 'cenario', report_id: draft.id, cenario: s.cenario })
    console.log(`  Cenário "${r.cenario.name}": chance ${(r.cenario.probability * 100).toFixed(2).replace('.', ',')}% (${r.cenario.computeMs} ms de cálculo)`)
  }

  const detail = await api.rpc<ReportDetail>('gestao', 'report_detail', { p_report: draft.id })
  const example = JSON.parse(readFileSync(new URL('src/data/relatorios/andrade-2026-10.json', root), 'utf8')) as Record<string, unknown>
  const problems: string[] = []
  let compared = 0
  const walk = (a: unknown, b: unknown, path: string) => {
    if (EXPECTED_DIFFERENCES.some((re) => re.test(path))) return
    if (typeof a === 'number' && typeof b === 'number') {
      compared++
      if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(b))) problems.push(`${path}: ${a} (exemplo ${b})`)
      return
    }
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
      if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} (exemplo ${JSON.stringify(b)?.slice(0, 80)})`)
      return
    }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path === '' ? k : `${path}.${k}`)
    }
  }
  walk(detail.snapshot, example, '')
  const expectedScenarios = example.scenarios as { probability: number; requiredReturn: number | null }[]
  ;(detail.scenarios ?? []).forEach((s, i) => {
    const e = expectedScenarios[i]
    compared += 2
    if (s.name !== EXAMPLE_SCENARIOS[i].name) problems.push(`nome do cenário ${i + 1}: ${s.name}`)
    if (Math.abs(s.probability - e.probability) > 1e-12) problems.push(`chance do cenário ${i + 1}: ${s.probability} (exemplo ${e.probability})`)
    if (s.requiredReturn === null || e.requiredReturn === null ? s.requiredReturn !== e.requiredReturn : Math.abs(s.requiredReturn - e.requiredReturn) > 1e-9) {
      problems.push(`retorno do cenário ${i + 1}: ${s.requiredReturn} (exemplo ${e.requiredReturn})`)
    }
  })
  if ((detail.scenarios ?? []).length !== EXAMPLE_SCENARIOS.length) problems.push(`${(detail.scenarios ?? []).length} cenários gravados`)
  if (problems.length > 0) throw new Error(`Relatório pelo banco diferente do exemplo: ${problems.join('; ')}.`)
  const cdi = detail.snapshot?.performance.summary?.month.cdi
  console.log(
    `  Conferido: ${compared} números iguais aos do relatório da Fase 1 (tolerância 1e-9). Diferenças esperadas: identificadores e registro do cálculo, gestor, comentário, nomes dos cenários, rótulo das premissas e o CDI do mês (${typeof cdi === 'number' ? formatSignedPercent(cdi, 2) : 'sem dado'} real, série fictícia do seed).`,
  )
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  const api: Api = new LocalApi(localStack(), USERS, 'db:import')
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
