// Relatório do mês de ponta a ponta no console (SPEC, "Fluxo do mês", passos 4 a 8), contra o Supabase LOCAL. O teste
// prepara o próprio mês pela API (famílias e mês do teste, e2e/families.ts: importa, confere, mapeia e roda) e segue
// pelas telas: a compliance aprova os textos legais do relatório; a gestão põe o gestor e o banker no cadastro, prepara
// o rascunho, comenta, roda um cenário (o mesmo cenário não entra duas vezes), envia e fecha a família; o banker não vê
// a versão em revisão; outra pessoa da gestão aprova (o PDF é guardado), baixa, apresenta e registra a apresentação; o
// banker vê e baixa o aprovado; a compliance confere a auditoria.

import { readFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { check, mapAsset, officialPl, preview, queue, runMonth } from '../scripts/importSteps.ts'
import { LocalApi, localStack } from '../scripts/localSupabase.ts'
import { E2E_MONTH, E2E_REF_DATE, e2eData } from './families.ts'
import { signInWithEnrollment, testUser, type TestUser } from './helpers.ts'

const REPORT_TEXTS = ['rodape_relatorio', 'nota_ponte', 'primeiro_relatorio', 'aviso_completo']
const MANAGER = 'Gestor do teste (fictício)'

async function open(browser: Browser, user: TestUser): Promise<Page> {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage()
  await signInWithEnrollment(page, user)
  return page
}

test('relatório do mês: rascunho, cenário, quatro olhos, PDF guardado, apresentação, banker e auditoria', async ({ browser }) => {
  test.setTimeout(300_000)

  // O mês do teste, pela API: a família da CADM conferida e rodada em julho/2026.
  const data = await e2eData()
  const api = new LocalApi(
    localStack(),
    {
      gestao: { email: 'e2e.relatorio.importacao@exemplo.invalid', role: 'gestao' },
      comite: { email: 'e2e.relatorio.comite@exemplo.invalid', role: 'comite' },
    },
    'e2e',
  )
  await preview(api, 'posicoes', data.positionsFile, true)
  await officialPl(api, data.plFile)
  await check(api, E2E_REF_DATE)
  const pending = await queue(api)
  for (const [code, classCode] of Object.entries(data.classes)) await mapAsset(api, pending, code, classCode)
  await check(api, E2E_REF_DATE)
  const runs = await runMonth(api, E2E_REF_DATE)
  expect(runs.find((r) => r.code === data.cadm)?.state).toBe('rodada')

  const banker = await testUser('e2e.banker@exemplo.invalid', 'banker')
  const compliance = await open(browser, await testUser('e2e.compliance@exemplo.invalid', 'compliance'))
  const gestao = await open(browser, await testUser('e2e.gestao@exemplo.invalid', 'gestao'))

  // A compliance aprova os textos legais do relatório que ainda estiverem em rascunho.
  await compliance.getByRole('link', { name: 'Textos legais' }).click()
  await expect(compliance.getByTestId('texto-aviso_completo')).toBeVisible()
  for (const key of REPORT_TEXTS) {
    const card = compliance.getByTestId(`texto-${key}`)
    const approve = card.getByRole('button', { name: /Aprovar a versão/ })
    if ((await approve.count()) === 0) continue
    await approve.click()
    await compliance.getByRole('dialog').getByRole('button', { name: 'Aprovar' }).click()
    await expect(card.getByText(/Rascunho da versão|Sem versão aprovada/)).toHaveCount(0)
  }

  // Sem o gestor responsável no cadastro, não sai rascunho; a gestão grava o gestor e o banker.
  await gestao.goto(`/relatorios?mes=${E2E_MONTH}`)
  const listRow = gestao.getByTestId(`relatorio-${data.cadm}`)
  await expect(listRow).toContainText('Falta o gestor responsável no cadastro da família.')
  await gestao.getByRole('link', { name: 'Famílias' }).click()
  await gestao.getByRole('link', { name: new RegExp(data.cadm) }).first().click()
  await gestao.getByLabel('Gestor responsável').fill(MANAGER)
  await gestao.getByLabel('Banker').selectOption({ label: banker.email })
  await gestao.getByRole('button', { name: 'Gravar cadastro' }).click()
  await expect(gestao.getByText('Cadastro atualizado.')).toBeVisible()

  // Rascunho, comentário e um cenário; o mesmo cenário não entra de novo.
  await gestao.goto(`/relatorios?mes=${E2E_MONTH}`)
  await expect(listRow).toContainText(MANAGER)
  await listRow.getByRole('button', { name: 'Preparar rascunho' }).click()
  await gestao.waitForURL(/\/relatorios\/[0-9a-f-]{36}$/, { timeout: 60_000 })
  const reportPath = new URL(gestao.url()).pathname
  await expect(gestao.getByText('Rascunho', { exact: true }).first()).toBeVisible()
  await expect(gestao.getByText('Escreva e grave o comentário da gestão antes de enviar.')).toBeVisible()
  await gestao.getByLabel('Comentário da gestão').fill('Comentário do teste de ponta a ponta: o mês e o cenário da conversa.')
  await gestao.getByRole('button', { name: 'Gravar comentário' }).click()
  await expect(gestao.getByText('Comentário gravado.')).toBeVisible()
  await gestao.getByRole('button', { name: 'Montar um cenário' }).click()
  await gestao.getByLabel('Tipo da mudança 1').selectOption('spendingMultiplier')
  await expect(gestao.getByText('Nome no relatório: Gastar 10% a mais')).toBeVisible()
  await gestao.getByRole('button', { name: 'Rodar o cenário' }).click()
  await expect(gestao.getByText(/^Cenário gravado: Gastar 10% a mais \(chance \d+%\)\.$/)).toBeVisible({ timeout: 60_000 })
  await expect(gestao.getByTestId('cenario')).toHaveCount(1)
  await gestao.getByRole('button', { name: 'Montar um cenário' }).click()
  await gestao.getByLabel('Tipo da mudança 1').selectOption('spendingMultiplier')
  await expect(gestao.getByText('(já está no relatório)')).toBeVisible()
  await expect(gestao.getByRole('button', { name: 'Rodar o cenário' })).toBeDisabled()
  await gestao.getByRole('button', { name: 'Tirar a mudança 1' }).click()
  await gestao.getByRole('button', { name: 'Enviar para aprovação' }).click()
  await gestao.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click()
  await expect(gestao.getByText('Relatório enviado para a aprovação.')).toBeVisible()
  // Quem preparou não aprova (quatro olhos).
  await expect(gestao.getByRole('button', { name: 'Aprovar' })).toHaveCount(0)

  // O banker ainda não vê a versão em revisão.
  const bankerPage = await open(browser, banker)
  await bankerPage.goto(`/relatorios?mes=${E2E_MONTH}`)
  await expect(bankerPage.getByTestId(`relatorio-${data.cadm}`)).toBeVisible()
  await expect(bankerPage.getByTestId(`relatorio-${data.cadm}`).getByRole('link', { name: 'Abrir' })).toHaveCount(0)

  // A gestão fecha a família no mês (a aprovação pede a família fechada).
  await gestao.getByRole('link', { name: 'Mês', exact: true }).click()
  await gestao.getByLabel('Mês de referência').selectOption(E2E_MONTH)
  await gestao.getByRole('row', { name: new RegExp(data.cadm) }).getByRole('button', { name: 'Fechar família' }).click()
  await expect(gestao.getByText(`Mês de ${data.cadm} fechado.`)).toBeVisible()

  // Outra pessoa da gestão aprova: o PDF é gerado no navegador e guardado; depois baixa, apresenta e registra.
  const approver = await open(browser, await testUser('e2e.gestao2@exemplo.invalid', 'gestao'))
  await approver.goto(reportPath)
  await approver.getByRole('button', { name: 'Aprovar' }).click()
  await approver.getByRole('dialog').getByRole('button', { name: 'Aprovar' }).click()
  await expect(approver.getByText(/^Relatório aprovado e PDF guardado \(\d+ KB\)\.$/)).toBeVisible({ timeout: 60_000 })
  const [download] = await Promise.all([approver.waitForEvent('download'), approver.getByRole('button', { name: 'Baixar PDF' }).click()])
  expect(download.suggestedFilename()).toBe(`relatorio-${data.cadm.toLowerCase()}-${E2E_MONTH}-v1.pdf`)
  expect(readFileSync(await download.path()).subarray(0, 5).toString()).toBe('%PDF-')
  await approver.getByRole('button', { name: 'Modo apresentação' }).click()
  await expect(approver.getByTitle('Relatório em modo apresentação')).toBeVisible({ timeout: 30_000 })
  await approver.getByRole('button', { name: 'Sair (Esc)' }).click()
  await approver.getByRole('button', { name: 'Registrar apresentação' }).click()
  await approver.getByRole('dialog').getByRole('button', { name: 'Registrar' }).click()
  await expect(approver.getByText('Apresentação registrada.')).toBeVisible()
  await expect(approver.getByText('Apresentado', { exact: true }).first()).toBeVisible()

  // O banker vê e baixa o relatório aprovado da sua família, sem as ações da revisão.
  await bankerPage.reload()
  await bankerPage.getByTestId(`relatorio-${data.cadm}`).getByRole('link', { name: 'Abrir' }).click()
  await expect(bankerPage.getByRole('button', { name: 'Baixar PDF' })).toBeVisible()
  await expect(bankerPage.getByRole('heading', { name: 'Revisão' })).toHaveCount(0)
  await expect(bankerPage.getByLabel('Comentário da gestão')).toHaveCount(0)

  // A auditoria da família mostra a aprovação, o PDF guardado, o download e a apresentação.
  await compliance.getByRole('link', { name: 'Auditoria' }).click()
  await compliance.getByLabel('Família').selectOption({ label: `${data.cadm} Família A do teste (fictícia)` })
  await compliance.getByRole('button', { name: 'Consultar' }).click()
  for (const action of ['Aprovou o relatório', 'Guardou o PDF do relatório', 'Baixou o PDF do relatório', 'Registrou a apresentação do relatório']) {
    await expect(compliance.getByRole('cell', { name: action, exact: true }).first()).toBeVisible()
  }
})
