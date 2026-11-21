// App dos clientes AI no exemplo da Família Andrade (/app/exemplo, sem login): em 375 px, nos temas claro e escuro, sem
// rolagem horizontal; as sete telas e o "E se?" (cenário pronto contra o plano oficial, comparação de cenários e gasto
// sustentável), com o motor no Web Worker. A entrada de verdade (convite, senha e autenticador) está em cliente.spec.ts.

import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true)
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`telas do exemplo em 375 px, tema ${colorScheme === 'light' ? 'claro' : 'escuro'}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/app/exemplo')

    await expect(page.getByTestId('probabilidade')).toHaveText('59%')
    await expect(page.getByText('Plano em risco')).toBeVisible()
    await expect(page.getByTestId('variacao')).toHaveText(/^−28\u00a0p\.p\. em outubro, principalmente pela mudança no plano$/)
    await expect(page.getByText('Sua carteira precisa render IPCA + 3,8% a.a.')).toBeVisible()
    await expect(page.getByText('Exemplo com dados fictícios')).toBeVisible()
    expect(await page.evaluate("document.documentElement.classList.contains('dark')")).toBe(colorScheme === 'dark')
    await noHorizontalScroll(page)

    const nav = page.getByRole('navigation', { name: 'Seções do app' })
    for (const [link, heading] of [
      ['Patrimônio', 'Carteira na corretora'],
      ['Plano', 'Linha do tempo'],
      ['Histórico', 'Mês a mês'],
    ]) {
      await nav.getByRole('link', { name: link }).click()
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      await noHorizontalScroll(page)
    }
    await page.getByRole('link', { name: 'Como calculamos' }).click()
    await expect(page.getByTestId('aviso-completo')).toContainText('não constituem recomendação de investimento')
    await noHorizontalScroll(page)
  })
}

test('E se?: cenário pronto contra o plano oficial, comparação, gasto sustentável e volta ao plano', async ({ page }) => {
  await page.goto('/app/exemplo/e-se')
  const result = page.getByTestId('chance-cenario')
  await expect(page.getByText(/^Retorno que o plano precisa: IPCA \+ 3,8% a\.a\./)).toBeVisible({ timeout: 60_000 })
  await expect(result).toHaveText('59%')

  await page.getByRole('button', { name: 'Aposentar 3 anos antes' }).click()
  await expect(result).toHaveText(/^59% → vai para 7%$/, { timeout: 30_000 })
  await expect(page.getByText(/^−52\u00a0p\.p\. contra o plano oficial$/)).toBeVisible()
  await page.getByRole('button', { name: 'Salvar este cenário' }).click()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByRole('button', { name: 'Voltar ao plano oficial' }).click()
  await expect(result).toHaveText('59%')

  // Horizonte novo, pelo campo numérico ao lado do controle deslizante: o mercado é recortado, sem sortear de novo.
  await page.getByRole('spinbutton', { name: 'Horizonte' }).fill('100')
  await page.getByRole('spinbutton', { name: 'Horizonte' }).press('Enter')
  await expect(result).toHaveText(/^59% → vai para \d+%$/, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Salvar este cenário' }).click()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  const compare = page.getByTestId('comparacao')
  await expect(compare).toContainText('Aposentar 3 anos antes (aos 59)')
  await expect(compare).toContainText('Horizonte até os 100 anos')
  await expect(compare.getByRole('row', { name: /^Chance/ })).toContainText('59%7%')

  await page.getByRole('button', { name: 'Voltar ao plano oficial' }).click()
  await page.getByRole('button', { name: 'Calcular para o plano' }).click()
  await expect(page.getByTestId('gasto-sustentavel')).toHaveText(/^Com 90% de chance, vocês podem gastar até R\$\s\d+\smil por mês \(hoje, R\$\s90\smil\)\.$/, {
    timeout: 60_000,
  })
  await noHorizontalScroll(page)
})
