// Relatórios no console (SPEC, "Fluxo do mês", passos 4 a 8): rótulos, o que cada pessoa pode fazer em cada situação,
// os bloqueios que o banco vai conferir de novo e a prévia do rascunho com o comentário e os cenários (o banco junta os
// dois ao snapshot na aprovação, do mesmo jeito). Sem React: as telas só mostram o que estas funções decidem.

import type { MonthStatus, ReportDetail, ReportMonths, ReportStatus, ReportSummary } from '../lib/apiTypes.ts'
import { brDateToIso } from '../lib/planForm.ts'
import type { ReportSnapshot } from '../report/snapshot.ts'

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  aprovado: 'Aprovado',
  apresentado: 'Apresentado',
  substituido: 'Substituído',
  descartado: 'Descartado',
}

export const REPORT_STATUS_TONES: Record<ReportStatus, 'neutral' | 'green' | 'red' | 'blue' | 'primary' | 'yellow'> = {
  rascunho: 'yellow',
  em_revisao: 'blue',
  aprovado: 'green',
  apresentado: 'primary',
  substituido: 'neutral',
  descartado: 'neutral',
}

export const PRESENTED_HOW_LABELS = { reuniao: 'em reunião', pdf: 'por PDF enviado' } as const

/** Versão aberta: ainda muda (rascunho) ou espera a aprovação (em revisão). */
export const isOpen = (s: ReportStatus) => s === 'rascunho' || s === 'em_revisao'

/** O snapshot como fica na aprovação: o comentário e os cenários do rascunho entram nele (approve_report). */
export function previewSnapshot(d: Pick<ReportDetail, 'status' | 'snapshot' | 'comment' | 'scenarios'>): ReportSnapshot | null {
  if (!d.snapshot) return null
  if (!isOpen(d.status)) return d.snapshot
  return {
    ...d.snapshot,
    comment: { text: d.comment ?? '', example: false },
    scenarios: (d.scenarios ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      probability: s.probability,
      requiredReturn: s.requiredReturn,
      requiredReturnStatus: s.requiredReturnStatus,
    })),
  }
}

/** Quem está no console, para decidir as ações (o banco confere tudo de novo). */
export interface ReportViewer {
  userId: string
  gestao: boolean
}

export interface ReportActions {
  /** Comentário e cenários: quem prepara, no rascunho. */
  editDraft: boolean
  /** Enviar para a aprovação: quem prepara, no rascunho. */
  submit: boolean
  /** Retirar para mudar: quem prepara, em revisão. */
  withdraw: boolean
  /** Aprovar ou devolver com observação: outra pessoa da gestão, em revisão. */
  review: boolean
  /** Descartar com motivo: a gestão, com a versão aberta. */
  discard: boolean
  /** Guardar o PDF: a gestão, com o relatório aprovado ainda sem PDF. */
  storePdf: boolean
  /** Registrar a apresentação: a gestão, com o relatório aprovado e o PDF guardado. */
  present: boolean
  /** Baixar e apresentar o PDF guardado: quem vê os valores. */
  download: boolean
}

export function reportActions(d: ReportSummary & { amounts_visible: boolean }, viewer: ReportViewer): ReportActions {
  const preparer = viewer.gestao && d.prepared_by === viewer.userId
  const otherGestao = viewer.gestao && d.prepared_by !== viewer.userId
  const approved = d.status === 'aprovado' || d.status === 'apresentado'
  return {
    editDraft: preparer && d.status === 'rascunho' && d.amounts_visible,
    submit: preparer && d.status === 'rascunho',
    withdraw: preparer && d.status === 'em_revisao',
    review: otherGestao && d.status === 'em_revisao',
    discard: viewer.gestao && isOpen(d.status),
    storePdf: viewer.gestao && approved && !d.has_pdf && d.amounts_visible,
    present: viewer.gestao && d.status === 'aprovado' && d.has_pdf,
    download: d.amounts_visible && d.has_pdf && d.status !== 'descartado',
  }
}

/** Versão aberta que não serve mais: a rodada ou os textos legais mudaram depois do rascunho. */
export function staleReasons(d: Pick<ReportDetail, 'status' | 'run_current' | 'texts_current'>): string[] {
  if (!isOpen(d.status)) return []
  const reasons: string[] = []
  if (!d.run_current) reasons.push('A rodada do mês mudou depois do rascunho.')
  if (!d.texts_current) reasons.push('Os textos legais mudaram depois do rascunho.')
  return reasons
}

/** O que impede o envio (o banco confere de novo). */
export function submitBlockers(d: Pick<ReportDetail, 'status' | 'run_current' | 'texts_current' | 'comment'>): string[] {
  const out = staleReasons(d).length > 0 ? ['Descarte esta versão e prepare outra: os números ou os textos dela não valem mais.'] : []
  if (!d.comment) out.push('Escreva e grave o comentário da gestão antes de enviar.')
  return out
}

/** O que impede a aprovação (o banco confere de novo). */
export function approveBlockers(d: Pick<ReportDetail, 'status' | 'run_current' | 'texts_current' | 'comment' | 'month_status'>): string[] {
  const out = staleReasons(d).length > 0 ? ['Descarte esta versão e prepare outra: os números ou os textos dela não valem mais.'] : []
  if (d.month_status !== 'fechado') out.push('Feche o mês da família (tela Mês) antes de aprovar: só família fechada alimenta o relatório.')
  if (!d.comment) out.push('O relatório não tem o comentário da gestão.')
  return out
}

type MonthFamily = ReportMonths['families'][number]

/** Situação do mês que permite o rascunho: rodado ou fechado (o relatório sai da rodada publicada). */
const DRAFTABLE: readonly MonthStatus[] = ['rodado', 'fechado']

/**
 * Preparar um rascunho na lista do mês (só a gestão): o que falta, se faltar algo, e se a nova versão pede o motivo
 * (toda versão depois da primeira).
 */
export function prepareState(f: MonthFamily, textsReady: boolean): { can: boolean; blocker: string | null; needsReason: boolean } {
  const needsReason = f.latest !== null
  const blocker =
    f.latest && isOpen(f.latest.status)
      ? null
      : f.status !== 'ativa'
        ? 'Família encerrada.'
        : !f.manager_name
          ? 'Falta o gestor responsável no cadastro da família.'
          : f.month_status === null
            ? 'Mês sem importação.'
            : !DRAFTABLE.includes(f.month_status)
              ? 'O mês da família ainda não foi rodado.'
              : !textsReady
                ? 'Faltam textos legais aprovados pela compliance.'
                : null
  const can = blocker === null && !(f.latest && isOpen(f.latest.status))
  return { can, blocker, needsReason }
}

/** Bytes em base64, em pedaços (um PDF de alguns MB estoura a pilha num único String.fromCharCode). */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

/** Data de hoje (ou de um instante) no horário de Brasília, em AAAA-MM-DD. */
export function dateInBrazil(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(at)
}

/**
 * Data digitada como dd/mm/aaaa (o seletor de data do navegador segue o idioma do sistema): AAAA-MM-DD, ou null se não
 * for uma data que existe.
 */
export function parseBrDate(text: string): string | null {
  const iso = brDateToIso(text)
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  return new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null
}

/** Data e hora no horário de Brasília, como "08/11/2026 15:42". */
export function dateTimeInBrazil(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`
}

/** Os textos legais, como a compliance os conhece. */
export const LEGAL_TEXT_LABELS: Record<string, string> = {
  rodape_relatorio: 'Rodapé do relatório',
  nota_ponte: 'Nota da ponte (relatório)',
  primeiro_relatorio: 'Primeiro relatório',
  aviso_completo: 'Aviso completo (relatório e app)',
  rodape_app: 'Rodapé do app',
  perfil_acima_suitability: 'Aviso de perfil acima da suitability',
}

const AUDIT_ACTIONS: Record<string, string> = {
  apagar_importacao: 'Apagou linhas importadas',
  apresentar_relatorio: 'Registrou a apresentação do relatório',
  aprovar_relatorio: 'Aprovou o relatório',
  aprovar_texto_legal: 'Aprovou um texto legal',
  baixar_relatorio: 'Baixou o PDF do relatório',
  conferir_mes: 'Conferiu o mês',
  confirmar_importacao: 'Confirmou uma importação',
  confirmar_rentabilidade: 'Confirmou a rentabilidade fora da faixa',
  desbloqueio: 'Desbloqueou um usuário',
  descartar_previa: 'Descartou a prévia de uma importação',
  devolver_relatorio: 'Devolveu o relatório para ajuste',
  enviar_relatorio: 'Enviou o relatório para a aprovação',
  fechar_mes: 'Fechou o mês do canal',
  fechar_mes_familia: 'Fechou o mês da família',
  guardar_pdf_do_relatorio: 'Guardou o PDF do relatório',
  informar_pl: 'Informou o PL oficial',
  ler_auditoria: 'Consultou a auditoria',
  ler_entradas_da_rodada: 'Leu as entradas da rodada',
  ler_entradas_do_relatorio: 'Leu as entradas do relatório',
  ler_familia: 'Abriu a família',
  ler_plano: 'Leu o plano',
  ler_relatorio: 'Abriu o relatório',
  ler_relatorios: 'Abriu os relatórios do mês',
  listar_familias: 'Abriu a lista de famílias',
  mapear_ativo: 'Mapeou um ativo',
  previa_importacao: 'Fez a prévia de uma importação',
  previa_recusada: 'Teve a prévia de uma importação recusada',
  rodar_mes: 'Rodou o mês',
  salvar_plano: 'Gravou o plano',
  ver_mes: 'Abriu o mês',
}

const ROW_ACTIONS: Record<string, string> = { insert: 'Inclusão', update: 'Alteração', delete: 'Exclusão' }

const TABLES: Record<string, string> = {
  households: 'famílias',
  people: 'pessoas',
  user_roles: 'papéis',
  other_assets: 'outros bens',
  cash_flows: 'rendas e gastos',
  events: 'eventos',
  goals: 'metas',
  plan_versions: 'versões do plano',
  plan_change_requests: 'pedidos de mudança do plano',
  assets: 'ativos',
  import_batches: 'importações',
  positions: 'posições',
  flows: 'aportes e resgates',
  household_months: 'meses das famílias',
  month_closings: 'fechamentos do mês',
  scenarios: 'cenários',
  simulation_runs: 'rodadas',
  monthly_snapshots: 'retratos do mês',
  reports: 'relatórios',
  profiles: 'perfis',
  cma_versions: 'premissas',
  cma_classes: 'classes das premissas',
  cma_correlations: 'correlações das premissas',
  legal_texts: 'textos legais',
}

/** Ação da auditoria em português: as das funções da API e as dos gatilhos de cada tabela. */
export function auditActionLabel(action: string, table: string | null): string {
  if (AUDIT_ACTIONS[action]) return AUDIT_ACTIONS[action]
  if (ROW_ACTIONS[action]) return table ? `${ROW_ACTIONS[action]} em ${TABLES[table] ?? table}` : ROW_ACTIONS[action]
  return action.replace(/_/g, ' ')
}
