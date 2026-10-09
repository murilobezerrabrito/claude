// Console de ponta a ponta: login com segundo fator, importação de setembro/2026 com prévia, PL oficial,
// conferência, fila de mapeamento do comitê e a família conferida. Só arquivos de exemplo fictícios.

import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { signInWithEnrollment, testUser } from './helpers.ts'

const example = (name: string) => `src/data/importacao/${name}`
const classes = (JSON.parse(readFileSync(example('exemplo-classes.json'), 'utf8')) as { classes: Record<string, string> }).classes

test('senha errada dá mensagem em português, sem entrar', async ({ page }) => {
  const user = await testUser('e2e.senha@exemplo.invalid', 'gestao')
  await page.goto('/')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha').fill('SenhaErrada123!')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
})

test('gestão importa e confere setembro; o comitê mapeia os ativos', async ({ page, browser }) => {
  const gestao = await testUser('e2e.gestao@exemplo.invalid', 'gestao')
  const comite = await testUser('e2e.comite@exemplo.invalid', 'comite')

  await signInWithEnrollment(page, gestao)
  await page.getByRole('link', { name: 'Mês' }).click()
  await page.getByLabel('Mês de referência').fill('2026-09')

  // Posições: prévia e confirmação.
  await page.getByLabel('Planilha').selectOption('posicoes')
  await page.getByLabel('Arquivo').setInputFiles(example('exemplo-posicoes-2026-09.csv'))
  await page.getByRole('button', { name: 'Ver prévia' }).click()
  await expect(page.getByText('Prévia de exemplo-posicoes-2026-09.csv')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'R$ 11.040.000,00 + USD 192.000,00' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar importação' }).click()
  await expect(page.getByText(/Importação confirmada: 19 linhas gravadas/)).toBeVisible()

  // PL oficial.
  await page.getByLabel('Planilha').selectOption('pl')
  await page.getByLabel('Arquivo').setInputFiles(example('exemplo-pl-2026-09.csv'))
  await page.getByRole('button', { name: 'Gravar PL' }).click()
  await expect(page.getByText(/PL oficial gravado: 3 famílias/)).toBeVisible()

  // Conferência: com o banco recém-criado, os ativos ainda não têm classe.
  await page.getByRole('button', { name: 'Conferir o mês' }).click()
  await expect(page.getByText(/3 famílias conferidas/)).toBeVisible()

  // O comitê mapeia o que estiver na fila (vazia se os ativos de exemplo já foram mapeados antes).
  const comitePage = await (await browser.newContext()).newPage()
  await signInWithEnrollment(comitePage, comite)
  await comitePage.getByRole('link', { name: 'Mapeamento de ativos' }).click()
  await expect(comitePage.getByRole('heading', { name: 'Fila do comitê' })).toBeVisible()
  await expect(comitePage.getByText('Carregando').or(comitePage.getByRole('table'))).toBeVisible()
  for (const [code, classCode] of Object.entries(classes)) {
    const select = comitePage.getByLabel(`Classe de ${code}`)
    if ((await select.count()) === 0) continue
    await select.selectOption(classCode)
    await comitePage.getByRole('row', { name: new RegExp(code) }).getByRole('button', { name: 'Mapear' }).click()
    await expect(comitePage.getByText(`${code} agora é ${classCode}.`)).toBeVisible()
  }
  await expect(comitePage.getByText('Nenhum ativo sem classe.')).toBeVisible()

  // A gestão confere de novo: Andrade conferida, sem bloqueio.
  await page.getByRole('button', { name: 'Conferir o mês' }).click()
  await expect(page.getByText(/3 famílias conferidas: 3 sem bloqueio/)).toBeVisible()
  await expect(page.getByRole('row', { name: /AND001/ }).first()).toContainText('Conferido')
})
