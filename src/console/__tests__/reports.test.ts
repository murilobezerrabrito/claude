// Relatórios no console: quem pode fazer o quê em cada situação, os bloqueios mostrados antes de o banco recusar, a prévia
// do rascunho (como o banco junta comentário e cenários na aprovação), o rascunho na lista do mês e os formatos.

import { describe, expect, it } from 'vitest'
import snapshotData from '../../data/relatorios/andrade-2026-10.json'
import type { ReportDetail, ReportMonths, ReportStatus, StoredReportScenario } from '../../lib/apiTypes.ts'
import type { ReportSnapshot } from '../../report/snapshot.ts'
import {
  approveBlockers,
  auditActionLabel,
  dateInBrazil,
  dateTimeInBrazil,
  parseBrDate,
  prepareState,
  previewSnapshot,
  reportActions,
  submitBlockers,
  toBase64,
} from '../reports.ts'

const snapshot = snapshotData as unknown as ReportSnapshot
const ME = 'user-me'
const OTHER = 'user-other'

function detail(over: Partial<ReportDetail> = {}): ReportDetail {
  return {
    id: 'r1',
    household_id: 'h1',
    ref_date: '2026-10-31',
    version: 1,
    status: 'rascunho',
    prepared_by: ME,
    prepared_by_email: 'eu@exemplo.invalid',
    approved_by_email: null,
    approved_at: null,
    presented_at: null,
    presented_how: null,
    has_pdf: false,
    reason: null,
    discard_reason: null,
    created_at: '2026-11-08T12:00:00Z',
    household: { id: 'h1', code: 'AND001', name: 'Família Andrade', manager_name: 'Gestor do exemplo' },
    month_status: 'rodado',
    amounts_visible: true,
    comment: null,
    scenarios: [],
    review_note: null,
    snapshot: { ...snapshot, scenarios: [], comment: { text: '', example: false } },
    texts_current: true,
    run_current: true,
    versions: [],
    ...over,
  }
}

const scenario: StoredReportScenario = {
  id: 's1',
  name: 'Gastar 10% a mais',
  params: { spendingMultiplier: 1.1 },
  probability: 0.2772,
  requiredReturn: 0.0612,
  requiredReturnStatus: 'ok',
  inputsHash: 'hash',
  seed: 11,
  paths: 10_000,
  computeMs: 600,
}

const on = (a: ReturnType<typeof reportActions>) =>
  Object.entries(a)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()

describe('ações do relatório por papel e situação', () => {
  const gestao = { userId: ME, gestao: true }
  const outraGestao = { userId: OTHER, gestao: true }
  const leitor = { userId: OTHER, gestao: false }

  it('rascunho: quem prepara escreve, escolhe cenários, envia e descarta; outra pessoa da gestão só descarta', () => {
    expect(on(reportActions(detail(), gestao))).toEqual(['discard', 'editDraft', 'submit'])
    expect(on(reportActions(detail(), outraGestao))).toEqual(['discard'])
    expect(on(reportActions(detail(), leitor))).toEqual([])
  })

  it('em revisão: quem prepara retira; outra pessoa da gestão aprova ou devolve (quatro olhos)', () => {
    const d = detail({ status: 'em_revisao' })
    expect(on(reportActions(d, gestao))).toEqual(['discard', 'withdraw'])
    expect(on(reportActions(d, outraGestao))).toEqual(['discard', 'review'])
    expect(on(reportActions(d, leitor))).toEqual([])
  })

  it('aprovado: sem PDF, a gestão guarda; com PDF, registra a apresentação e quem vê valores baixa', () => {
    expect(on(reportActions(detail({ status: 'aprovado' }), outraGestao))).toEqual(['storePdf'])
    expect(on(reportActions(detail({ status: 'aprovado', has_pdf: true }), outraGestao))).toEqual(['download', 'present'])
    expect(on(reportActions(detail({ status: 'aprovado', has_pdf: true }), leitor))).toEqual(['download'])
    expect(on(reportActions(detail({ status: 'apresentado', has_pdf: true }), gestao))).toEqual(['download'])
    expect(on(reportActions(detail({ status: 'substituido', has_pdf: true }), leitor))).toEqual(['download'])
  })

  it('sem permissão para valores, nada de conteúdo nem PDF; versão descartada não tem ação', () => {
    const hidden = { amounts_visible: false, snapshot: null, comment: null, scenarios: null }
    expect(on(reportActions(detail({ ...hidden }), gestao))).toEqual(['discard', 'submit'])
    expect(on(reportActions(detail({ ...hidden, status: 'aprovado', has_pdf: true }), leitor))).toEqual([])
    for (const status of ['descartado'] as ReportStatus[]) expect(on(reportActions(detail({ status }), gestao))).toEqual([])
  })
})

describe('bloqueios mostrados antes do banco', () => {
  it('envio: comentário gravado e números ainda válidos', () => {
    expect(submitBlockers(detail())).toEqual(['Escreva e grave o comentário da gestão antes de enviar.'])
    expect(submitBlockers(detail({ comment: 'Ok.' }))).toEqual([])
    expect(submitBlockers(detail({ comment: 'Ok.', run_current: false }))[0]).toMatch(/Descarte esta versão/)
  })

  it('aprovação: família fechada, comentário e os mesmos textos legais', () => {
    const d = detail({ status: 'em_revisao', comment: 'Ok.' })
    expect(approveBlockers(d)).toEqual(['Feche o mês da família (tela Mês) antes de aprovar: só família fechada alimenta o relatório.'])
    expect(approveBlockers({ ...d, month_status: 'fechado' })).toEqual([])
    expect(approveBlockers({ ...d, month_status: 'fechado', texts_current: false })[0]).toMatch(/Descarte esta versão/)
  })
})

describe('prévia do rascunho', () => {
  it('junta o comentário e os cenários como a aprovação (só os campos que o relatório mostra)', () => {
    const p = previewSnapshot(detail({ comment: 'Comentário.', scenarios: [scenario] }))!
    expect(p.comment).toEqual({ text: 'Comentário.', example: false })
    expect(p.scenarios).toEqual([{ id: 's1', name: 'Gastar 10% a mais', probability: 0.2772, requiredReturn: 0.0612, requiredReturnStatus: 'ok' }])
    expect(p.summary).toBe(snapshot.summary)
  })

  it('versão aprovada: o snapshot como está; sem valores, sem prévia', () => {
    const approved = detail({ status: 'aprovado', comment: 'Outro', scenarios: [scenario] })
    expect(previewSnapshot(approved)).toBe(approved.snapshot)
    expect(previewSnapshot(detail({ snapshot: null }))).toBeNull()
  })
})

describe('rascunho na lista do mês', () => {
  const family = (over: Partial<ReportMonths['families'][number]> = {}): ReportMonths['families'][number] => ({
    household_id: 'h1',
    code: 'AND001',
    name: 'Família Andrade',
    status: 'ativa',
    manager_name: 'Gestor do exemplo',
    month_status: 'rodado',
    latest: null,
    ...over,
  })

  it('pede o mês rodado ou fechado, o gestor responsável e os textos legais aprovados', () => {
    expect(prepareState(family(), true)).toEqual({ can: true, blocker: null, needsReason: false })
    expect(prepareState(family({ month_status: 'fechado' }), true).can).toBe(true)
    expect(prepareState(family({ month_status: 'conferido' }), true).blocker).toBe('O mês da família ainda não foi rodado.')
    expect(prepareState(family({ month_status: null }), true).blocker).toBe('Mês sem importação.')
    expect(prepareState(family({ manager_name: null }), true).blocker).toBe('Falta o gestor responsável no cadastro da família.')
    expect(prepareState(family({ status: 'encerrada' }), true).blocker).toBe('Família encerrada.')
    expect(prepareState(family(), false).blocker).toBe('Faltam textos legais aprovados pela compliance.')
  })

  it('nova versão pede motivo; com uma versão aberta, só abrir', () => {
    const latest = { ...detail({ status: 'aprovado' }) }
    expect(prepareState(family({ latest }), true)).toEqual({ can: true, blocker: null, needsReason: true })
    expect(prepareState(family({ latest: { ...latest, status: 'em_revisao' } }), true)).toEqual({ can: false, blocker: null, needsReason: true })
  })
})

describe('formatos', () => {
  it('base64 em pedaços dá o mesmo que o Node, também para arquivos grandes', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => (i * 31 + 7) % 256)
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
    expect(toBase64(new TextEncoder().encode('%PDF-1.4'))).toBe('JVBERi0xLjQ=')
  })

  it('datas no horário de Brasília', () => {
    expect(dateTimeInBrazil('2026-11-08T18:42:00Z')).toBe('08/11/2026 15:42')
    expect(dateTimeInBrazil('2026-11-09T02:05:00Z')).toBe('08/11/2026 23:05')
    expect(dateInBrazil(new Date('2026-11-09T02:05:00Z'))).toBe('2026-11-08')
  })

  it('data digitada como dd/mm/aaaa, só se existir', () => {
    expect(parseBrDate('08/11/2026')).toBe('2026-11-08')
    expect(parseBrDate(' 8/1/2026 ')).toBe('2026-01-08')
    expect(parseBrDate('31/02/2026')).toBeNull()
    expect(parseBrDate('11/2026')).toBeNull()
    expect(parseBrDate('')).toBeNull()
  })

  it('ações da auditoria em português, inclusive as dos gatilhos', () => {
    expect(auditActionLabel('aprovar_relatorio', 'reports')).toBe('Aprovou o relatório')
    expect(auditActionLabel('update', 'reports')).toBe('Alteração em relatórios')
    expect(auditActionLabel('insert', 'tabela_nova')).toBe('Inclusão em tabela_nova')
    expect(auditActionLabel('acao_nova', null)).toBe('acao nova')
  })
})
