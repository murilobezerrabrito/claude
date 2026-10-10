// Console de ponta a ponta: login com segundo fator, importação com prévia, PL oficial, conferência, fila de
// mapeamento do comitê, rodada oficial em lote (uma simulação por chamada à função do servidor) e a lista de famílias
// com a chance. Famílias e mês próprios do teste (e2e/families.ts), só com dados fictícios.

import { expect, test } from '@playwright/test'
import { E2E_MONTH, e2eData } from './families.ts'
import { signInWithEnrollment, testUser } from './helpers.ts'

test('senha errada dá mensagem em português, sem entrar', async ({ page }) => {
  const user = await testUser('e2e.senha@exemplo.invalid', 'gestao')
  await page.goto('/')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha').fill('SenhaErrada123!')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
})

test('gestão importa, confere e roda o mês; o comitê mapeia os ativos; a lista mostra a chance', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const data = await e2eData()
  const gestao = await testUser('e2e.gestao@exemplo.invalid', 'gestao')
  const comite = await testUser('e2e.comite@exemplo.invalid', 'comite')
  const row = (code: string) => page.getByRole('row', { name: new RegExp(code) }).first()

  await signInWithEnrollment(page, gestao)
  await page.getByRole('link', { name: 'Mês' }).click()
  await page.getByLabel('Mês de referência').selectOption(E2E_MONTH)

  // Posições: prévia e confirmação.
  await page.getByLabel('Planilha').selectOption('posicoes')
  await page.getByLabel('Arquivo').setInputFiles(data.positionsFile)
  await page.getByRole('button', { name: 'Ver prévia' }).click()
  await expect(page.getByText('Prévia de e2e-posicoes-2026-07.csv')).toBeVisible()
  await expect(row(data.cadm)).toContainText('R$ 11.040.000,00 + USD 192.000,00')
  await page.getByRole('button', { name: 'Confirmar importação' }).click()
  await expect(page.getByText(new RegExp(`Importação confirmada: ${data.positionsRows} linhas gravadas`))).toBeVisible()

  // PL oficial.
  await page.getByLabel('Planilha').selectOption('pl')
  await page.getByLabel('Arquivo').setInputFiles(data.plFile)
  await page.getByRole('button', { name: 'Gravar PL' }).click()
  await expect(page.getByText(/PL oficial gravado: 2 famílias/)).toBeVisible()

  // Conferência: os ativos novos ainda não têm classe, e a família da CADM fica bloqueada.
  await page.getByRole('button', { name: 'Conferir o mês' }).click()
  await expect(page.getByText(/^\d+ famílias? conferidas?:/)).toBeVisible()
  await expect(row(data.cadm)).toContainText('Bloqueado')

  // O comitê mapeia os ativos novos do teste.
  const comitePage = await (await browser.newContext()).newPage()
  await signInWithEnrollment(comitePage, comite)
  await comitePage.getByRole('link', { name: 'Mapeamento de ativos' }).click()
  await expect(comitePage.getByRole('heading', { name: 'Fila do comitê' })).toBeVisible()
  for (const [code, classCode] of Object.entries(data.classes)) {
    await comitePage.getByLabel(`Classe de ${code}`).selectOption(classCode)
    await comitePage.getByRole('row', { name: new RegExp(code) }).getByRole('button', { name: 'Mapear' }).click()
    await expect(comitePage.getByText(`${code} agora é ${classCode}.`)).toBeVisible()
  }

  // A gestão confere de novo: as duas famílias conferidas, sem bloqueio.
  await page.getByRole('button', { name: 'Conferir o mês' }).click()
  await expect(page.getByText(/^\d+ famílias conferidas:/)).toBeVisible()
  await expect(row(data.cadm)).toContainText('Conferido')
  await expect(row(data.ai)).toContainText('Conferido')

  // Rodada oficial em lote: cada família termina com a chance; o mês mostra "Rodado" e a chance.
  await page.getByRole('button', { name: /Rodar o mês/ }).click()
  await expect(page.getByText(/^\d+ famílias rodadas\. Confira a chance/)).toBeVisible({ timeout: 180_000 })
  for (const code of [data.cadm, data.ai]) {
    await expect(page.getByTestId(`rodada-${code}`)).toContainText(/chance \d+,\d%/)
    await expect(row(code)).toContainText('Rodado')
    await expect(row(code)).toContainText(/\d+,\d%/)
  }

  // Famílias: chance, faixa e o status do mês; o filtro "precisam de atenção" mostra só quem tem motivo.
  await page.getByRole('link', { name: 'Famílias' }).click()
  for (const code of [data.cadm, data.ai]) {
    await expect(row(code)).toContainText(/\d+,\d%/)
    await expect(row(code)).toContainText(/Folga grande|No caminho|Atenção|Plano em risco/)
    await expect(row(code)).toContainText('Rodado')
    await expect(row(code)).toContainText('31/07/2026')
  }
  await page.getByLabel(/Precisam de atenção/).check()
  const rows = page.getByRole('row').filter({ hasText: /E2E-|[A-Z]{3}\d{3}/ })
  for (const r of await rows.all()) await expect(r).toContainText(/Chance abaixo de 70%|Queda de mais de 5 p\.p\.|99% ou mais/)
})
