// Relatório montado a partir das rodadas publicadas, como no banco (etapa 4 da Fase 2): a montagem não simula, confere
// a sequência dos meses e a ponte, usa os textos legais aprovados (com a versão) e traz o CDI do Banco Central como
// referência secundária quando a série cobre o mês. Rodadas com 1.000 trajetórias, para o teste ser rápido.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { andradeReportArgs } from '../../../scripts/reportExample.ts'
import { parseSgs } from '../../market/sgs.ts'
import { monthAttribution } from '../attribution.ts'
import { planVersionFor } from '../monthInputs.ts'
import { officialRun, type MonthPackage } from '../officialRun.ts'
import { cdiMonthReal, type CdiSeries } from '../performance.ts'
import { assembleReportSnapshot, buildReportSnapshot, inDisplayOrder, type ReportAssembly } from '../snapshot.ts'
import { SPEC_LEGAL_TEXTS } from '../texts.ts'

const PATHS = 1_000
const args = andradeReportArgs()
const pkgs: MonthPackage[] = args.data.closings.map((closing) => {
  const month = closing.refDate.slice(0, 7)
  return { household: args.data.household, planVersion: planVersionFor(args.data.planVersions, month), closing, ...args.cmaFor(month) }
})
const [sep, oct] = pkgs
const runs = pkgs.map((p) => officialRun(p, args.data.ipca, { paths: PATHS }))
const bridge = monthAttribution({ previous: { pkg: sep, published: runs[0] }, current: oct, ipca: args.data.ipca, paths: PATHS })
const base: ReportAssembly = {
  months: [
    { pkg: sep, run: runs[0] },
    { pkg: oct, run: runs[1] },
  ],
  bridge,
  ipca: args.data.ipca,
  cdi: null,
  scenarios: [],
  comment: { text: 'Comentário do teste.', example: false },
  manager: 'Gestor do teste',
  legalTexts: SPEC_LEGAL_TEXTS,
}

// CDI fictício de set e out/2026 no formato do SGS (as mesmas respostas gravadas da etapa 3d).
const sgs = JSON.parse(readFileSync(new URL('../../data/sgs/serie-12-cdi-2026-09-a-10.json', import.meta.url), 'utf8')) as unknown
const cdi: CdiSeries = Object.fromEntries(parseSgs(sgs, 'cdi', '2026-10-31').map((r) => [r.date, r.value]))

describe('relatório a partir das rodadas publicadas', () => {
  it('a montagem dá o mesmo relatório do exemplo, com as rodadas que ele calcula', () => {
    const fromRuns = assembleReportSnapshot({ ...base, scenarios: [], comment: args.comment, manager: args.manager })
    const example = buildReportSnapshot({ ...args, scenarios: [], paths: PATHS })
    expect(fromRuns).toEqual(example)
  })

  it('CDI do mês com todos os dias úteis, descontada a inflação; sem um dia útil, fica de fora', () => {
    const october = cdiMonthReal(cdi, '2026-10', args.data.ipca)
    const nominal = Object.entries(cdi)
      .filter(([d]) => d.startsWith('2026-10'))
      .reduce((f, [, v]) => f * (1 + v / 100), 1)
    expect(Object.keys(cdi).filter((d) => d.startsWith('2026-10'))).toHaveLength(21) // 12/10 é feriado
    expect(october).toBeCloseTo(nominal / (1 + args.data.ipca['2026-10']) - 1, 12)
    const snap = assembleReportSnapshot({ ...base, cdi })
    expect(snap.performance.summary?.month.cdi).toBeCloseTo(october!, 12)
    expect(snap.performance.summary?.sinceStart.cdi).toBeCloseTo(october!, 12)
    const gap = { ...cdi }
    delete gap['2026-10-15']
    expect(cdiMonthReal(gap, '2026-10', args.data.ipca)).toBeNull()
    expect(assembleReportSnapshot({ ...base, cdi: gap }).performance.summary?.month.cdi).toBeNull()
    expect(cdiMonthReal(cdi, '2026-11', args.data.ipca)).toBeNull()
  })

  it('usa os textos legais da versão aprovada e guarda a versão de cada um', () => {
    const legalTexts = { ...SPEC_LEGAL_TEXTS, rodape_relatorio: { version: 2, body: 'Rodapé v2 com as posições de [mês] e as premissas [versão].' } }
    const snap = assembleReportSnapshot({ ...base, legalTexts })
    expect(snap.texts.footer).toBe(`Rodapé v2 com as posições de out/2026 e as premissas ${oct.cma.version}.`)
    expect(snap.texts.legal).toEqual({ rodape_relatorio: 2, nota_ponte: 1, primeiro_relatorio: 1, aviso_completo: 1 })
    const missing: Partial<typeof SPEC_LEGAL_TEXTS> = { ...SPEC_LEGAL_TEXTS }
    delete missing.aviso_completo
    expect(() => assembleReportSnapshot({ ...base, legalTexts: missing as typeof SPEC_LEGAL_TEXTS })).toThrow(/aviso_completo/)
  })

  it('recusa meses fora de sequência, rodada de outro mês e ponte que não combina', () => {
    const code = (a: ReportAssembly) => {
      try {
        assembleReportSnapshot(a)
        return 'sem erro'
      } catch (e) {
        return (e as { code?: string }).code
      }
    }
    expect(code({ ...base, months: [{ pkg: sep, run: runs[0] }, { pkg: sep, run: runs[0] }] })).toBe('historico_com_falha')
    expect(code({ ...base, months: [{ pkg: sep, run: runs[0] }, { pkg: oct, run: runs[0] }] })).toBe('rodada_de_outro_mes')
    expect(code({ ...base, months: [{ pkg: oct, run: runs[1] }] })).toBe('ponte_incoerente')
    expect(code({ ...base, bridge: { kind: 'primeiro_mes' } })).toBe('ponte_incoerente')
    expect(code({ ...base, months: [] })).toBe('sem_fechamento')
    expect(code({ ...base, months: [{ pkg: sep, run: runs[0] }], bridge: { kind: 'primeiro_mes' } })).toBe('sem erro')
  })

  it('classes na ordem da tabela do SPEC, mesmo com as premissas em ordem de código (como vêm do banco)', () => {
    // As premissas do banco (app.cma_json) vêm em ordem de código, com a matriz de correlação na mesma ordem.
    const byCode = (pkg: MonthPackage): MonthPackage => {
      const idx = pkg.cma.classes.map((_, i) => i).sort((i, j) => (pkg.cma.classes[i].code < pkg.cma.classes[j].code ? -1 : 1))
      const cma = { ...pkg.cma, classes: idx.map((i) => pkg.cma.classes[i]), correlation: idx.map((i) => idx.map((j) => pkg.cma.correlation[i][j])) }
      return { ...pkg, cma }
    }
    const months = base.months.map((m) => ({ ...m, pkg: byCode(m.pkg) }))
    expect(months[1].pkg.cma.classes.map((c) => c.code)).toEqual(['ACOES', 'CRED', 'FII', 'INF', 'INTL', 'MM', 'POS', 'PRE'])
    const fromDb = assembleReportSnapshot({ ...base, months })
    expect(fromDb.assumptions.classes.map((c) => c.code)).toEqual(['POS', 'INF', 'PRE', 'CRED', 'MM', 'ACOES', 'FII', 'INTL'])
    expect(fromDb).toEqual(assembleReportSnapshot(base))
    // Uma classe que a tabela não tem vai para o fim, em ordem de código.
    const codes = inDisplayOrder([{ code: 'OURO' }, { code: 'INTL' }, { code: 'CRIPTO' }, { code: 'POS' }]).map((c) => c.code)
    expect(codes).toEqual(['POS', 'INTL', 'CRIPTO', 'OURO'])
  })
})
