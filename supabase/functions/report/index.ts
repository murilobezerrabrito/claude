// Relatórios no banco (etapa 4; SPEC, "Fluxo do mês", passos 4 a 8). O console pede:
//   { acao: 'rascunho', household_id, ref_date, motivo? }  monta o snapshot a partir das rodadas publicadas (sem
//     simular) e grava a versão nova; com versão anterior, o motivo é obrigatório;
//   { acao: 'cenario', report_id, cenario }  roda um cenário "E se?" da conversa do mês (uma simulação de 10.000
//     trajetórias por chamada, com os sorteios da rodada oficial) e grava hipóteses, nome e resultado;
//   { acao: 'pdf', report_id, pdf_base64 }  guarda o PDF do relatório aprovado na pasta privada, com o hash SHA-256 (só
//     quem aprovou; cada envio num arquivo próprio, e só o anexado vale);
//   { acao: 'baixar', report_id }  link assinado de 60 segundos para o PDF, com o download na auditoria.
// Rascunho, cenário e PDF são da gestão, com segundo fator; baixar é de quem pode ler o relatório (o banco confere
// com o token de quem pede). Entradas e gravação usam a chave do servidor, que nunca vai ao navegador.
// Respostas de erro como em _shared/server.ts; erros das regras do motor e da montagem voltam como 422.

import { EngineInputError } from '../_shared/aware/engine/errors.ts'
import {
  assembleReportSnapshot,
  ReportInputError,
  runScenario,
  scenarioContext,
  scenarioIssues,
  scenarioName,
  toEngineScenario,
  type CdiSeries,
  type IpcaSeries,
  type MonthAttribution,
  type MonthPackage,
  type ReportLegalTexts,
  type ReportMonthRun,
  type ReportScenarioParams,
} from '../_shared/aware/report/index.ts'
import { bearer, CORS, HttpError, reply, rpc, storageRemove, storageSignedPath, storageUpload } from '../_shared/server.ts'

interface Request_ {
  acao?: 'rascunho' | 'cenario' | 'pdf' | 'baixar'
  household_id?: string
  ref_date?: string
  motivo?: string
  report_id?: string
  cenario?: unknown
  pdf_base64?: string
}

/** Entradas do rascunho (report_inputs), no formato de src/report. */
interface ReportInputsRow {
  run_id: string
  manager: string
  months: ReportMonthRun[]
  bridge: MonthAttribution
  ipca: IpcaSeries
  cdi: CdiSeries
  legal: ReportLegalTexts
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_PDF_BYTES = 10 * 1024 * 1024
/** Validade do link de download do PDF. */
const LINK_SECONDS = 60

function uuidOf(v: unknown, what: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, `Pedido sem ${what}.`)
  return v
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

function pdfBytes(b64: unknown): Uint8Array<ArrayBuffer> {
  if (typeof b64 !== 'string' || b64.length === 0 || b64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 + 4) {
    throw new HttpError(400, 'Envie o PDF (até 10 MB).')
  }
  let binary: string
  try {
    binary = atob(b64)
  } catch {
    throw new HttpError(400, 'O PDF não veio em base64.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  // Todo PDF começa com "%PDF-".
  if (bytes.length > MAX_PDF_BYTES || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') {
    throw new HttpError(422, 'O arquivo não é um PDF de até 10 MB.')
  }
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply(405, { erro: 'Use POST.' })
  try {
    const token = bearer(req, 'Entre no console para cuidar dos relatórios.')
    const body = (await req.json().catch(() => null)) as Request_ | null
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Pedido inválido: envie JSON.')

    if (body.acao === 'baixar') {
      const reportId = uuidOf(body.report_id, 'o relatório')
      const access = await rpc<{ path: string; file_name: string }>('report_pdf_access', { p_report: reportId }, { user: token })
      const path = await storageSignedPath('relatorios', access.path, LINK_SECONDS, access.file_name)
      return reply(200, { caminho: path, arquivo: access.file_name, validade_s: LINK_SECONDS })
    }

    const actor = await rpc<string>('report_permission', {}, { user: token })

    if (body.acao === 'rascunho') {
      const household = uuidOf(body.household_id, 'a família')
      if (typeof body.ref_date !== 'string' || !DATE.test(body.ref_date)) throw new HttpError(400, 'Pedido sem o mês de referência.')
      const where = { p_household: household, p_ref_date: body.ref_date }
      const inputs = await rpc<ReportInputsRow>('report_inputs', { ...where, p_actor: actor }, 'servidor')
      const snapshot = assembleReportSnapshot({
        months: inputs.months,
        bridge: inputs.bridge,
        ipca: inputs.ipca,
        cdi: inputs.cdi,
        scenarios: [],
        comment: { text: '', example: false },
        manager: inputs.manager,
        legalTexts: inputs.legal,
      })
      const recorded = await rpc('record_report_draft', {
        ...where,
        p_actor: actor,
        p_run_id: inputs.run_id,
        p_snapshot: snapshot,
        p_reason: typeof body.motivo === 'string' ? body.motivo : null,
      }, 'servidor')
      return reply(200, recorded)
    }

    if (body.acao === 'cenario') {
      const reportId = uuidOf(body.report_id, 'o relatório')
      const t0 = performance.now()
      const inputs = await rpc<{ pkg: MonthPackage; ipca: IpcaSeries }>('report_scenario_inputs', { p_report: reportId, p_actor: actor }, 'servidor')
      const ctx = scenarioContext(inputs.pkg, inputs.ipca)
      const issues = scenarioIssues(body.cenario, ctx)
      if (issues.length > 0) return reply(422, { erro: 'Corrija o cenário.', problemas: issues })
      const params = body.cenario as ReportScenarioParams
      const run = runScenario(inputs.pkg, inputs.ipca, toEngineScenario(params))
      const scenario = {
        id: crypto.randomUUID(),
        name: scenarioName(params, ctx),
        params,
        probability: run.probability,
        requiredReturn: run.requiredReturn,
        requiredReturnStatus: run.requiredReturnStatus,
        inputsHash: run.inputsHash,
        seed: run.seed,
        paths: run.paths,
        computeMs: Math.round((performance.now() - t0) * 10) / 10,
      }
      await rpc('record_report_scenario', { p_report: reportId, p_actor: actor, p_scenario: scenario }, 'servidor')
      return reply(200, { cenario: scenario })
    }

    if (body.acao === 'pdf') {
      const reportId = uuidOf(body.report_id, 'o relatório')
      const bytes = pdfBytes(body.pdf_base64)
      const target = await rpc<{ path: string }>('report_pdf_target', { p_report: reportId, p_actor: actor }, 'servidor')
      const sha256 = await sha256Hex(bytes)
      await storageUpload('relatorios', target.path, bytes, 'application/pdf')
      try {
        await rpc('attach_report_pdf', { p_report: reportId, p_actor: actor, p_path: target.path, p_sha256: sha256, p_size: bytes.length }, 'servidor')
      } catch (e) {
        await storageRemove('relatorios', target.path)
        throw e
      }
      return reply(200, { caminho: target.path, sha256, bytes: bytes.length })
    }

    throw new HttpError(400, 'Ação desconhecida.')
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { erro: e.message })
    if (e instanceof ReportInputError || e instanceof EngineInputError) return reply(422, { erro: e.message })
    console.error(e)
    return reply(500, { erro: 'Erro inesperado nos relatórios. Tente de novo; se continuar, avise a equipe técnica.' })
  }
})
