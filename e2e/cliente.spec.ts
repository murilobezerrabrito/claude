// Convite e entrada do cliente AI (Fase 3, etapa 3c; D-071 e D-074): o responsável convida pelo console, sem ver o link;
// o e-mail chega só ao cliente (Mailpit, o servidor de e-mail do Supabase local); no celular, o cliente abre o link,
// cria a senha (as regras valem), cadastra o app autenticador e entra; a família ainda sem mês fechado mostra o aviso;
// sai e entra de novo com senha e código; o link não vale duas vezes; no console, o cliente aparece ativo.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { call, ensureUser, localStack, newPassword, totp } from '../scripts/localSupabase.ts'
import { signInWithEnrollment } from './helpers.ts'

const MAILPIT = 'http://127.0.0.1:54324'

/** O link do último e-mail para o endereço (o convite), lido no Mailpit. */
async function inviteLink(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const found = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()) as { messages: { ID: string }[] }
    if (found.messages.length > 0) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${found.messages[0].ID}`)).json()) as { Text: string; Subject: string }
      expect(msg.Subject).toBe('Seu acesso ao app da AWARE Investments')
      const link = /https?:\/\/\S+\/auth\/v1\/verify\?\S+?(?=\s|\)|$)/.exec(msg.Text)?.[0]
      if (!link) throw new Error('E-mail do convite sem o link.')
      return link
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`O convite para ${to} não chegou ao Mailpit.`)
}

test('o responsável convida; o cliente cria a senha, cadastra o autenticador e entra no app', async ({ page, browser }) => {
  const local = localStack()
  const tag = Date.now().toString(36).toLowerCase()
  const clientEmail = `e2e.cliente.${tag}@exemplo.invalid`
  const responsavel = { email: 'e2e.responsavel@exemplo.invalid', password: newPassword() }
  const ownerId = await ensureUser(local, responsavel.email, 'responsavel', responsavel.password)
  const household = randomUUID()
  await call(local, '/rest/v1/households', {
    admin: true,
    body: {
      id: household, code: `E2E-${tag.toUpperCase()}-K`, name: 'Família K do teste (fictícia)', channel: 'ai', owner_id: ownerId,
      intermediary: 'Corretora do teste (fictícia)', profile_id: 'moderado', weights_source: 'carteira_atual', fee_rate: 0.008, horizon_age: 95, seed: 4321,
    },
  })

  // Console: o responsável convida; a tela não mostra o link.
  await signInWithEnrollment(page, responsavel)
  await page.goto(`/familias/${household}`)
  const card = page.getByTestId('acesso-cliente')
  await expect(card.getByText('O cliente ainda não foi convidado.')).toBeVisible()
  await card.getByLabel('E-mail do cliente').fill(clientEmail.toUpperCase())
  await card.getByRole('button', { name: 'Enviar convite' }).click()
  await expect(card.getByText(`Convite enviado para ${clientEmail}.`, { exact: false })).toBeVisible()
  await expect(card.getByTestId('cliente').getByText('Convite pendente')).toBeVisible()
  expect(await page.content()).not.toContain('/auth/v1/verify')

  // O cliente, no celular: abre o link do e-mail e cria a senha.
  const link = await inviteLink(clientEmail)
  const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, locale: 'pt-BR' })
  const app = await phone.newPage()
  await app.goto(link)
  await expect(app.getByRole('heading', { name: 'Crie a sua senha' })).toBeVisible()
  await expect(app.getByText(`Primeiro acesso de ${clientEmail}.`)).toBeVisible()
  expect(new URL(app.url()).hash).toBe('')
  await app.getByLabel('Senha nova').fill('curta')
  await app.getByLabel('Repita a senha').fill('curta')
  await app.getByRole('button', { name: 'Criar senha' }).click()
  await expect(app.getByText('A senha precisa de 12 ou mais caracteres.')).toBeVisible()
  const password = newPassword()
  await app.getByLabel('Senha nova').fill(password)
  await app.getByLabel('Repita a senha').fill(password)
  await app.getByRole('button', { name: 'Criar senha' }).click()

  // Cadastra o app autenticador e entra: a família ainda não tem mês fechado.
  await expect(app.getByRole('heading', { name: 'Cadastre o app autenticador' })).toBeVisible()
  const secret = (await app.getByTestId('segredo-totp').textContent()) ?? ''
  await app.getByLabel('Código do app autenticador').fill(totp(secret))
  await app.getByRole('button', { name: 'Confirmar' }).click()
  await expect(app.getByTestId('sem-mes')).toContainText('Os números do seu primeiro mês ainda não saíram.')
  await expect(app.getByText('Assessoria de investimentos · Corretora do teste (fictícia)')).toBeVisible()
  expect(await app.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true)

  // Sai e entra de novo: senha e código.
  await app.getByRole('button', { name: 'Sair' }).first().click()
  await expect(app.getByLabel('E-mail')).toBeVisible()
  await app.getByLabel('E-mail').fill(clientEmail)
  await app.getByLabel('Senha').fill(password)
  await app.getByRole('button', { name: 'Entrar' }).click()
  await expect(app.getByRole('heading', { name: 'Código do app autenticador' })).toBeVisible()
  // Espera o próximo código (o anterior já foi usado no cadastro).
  await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 500))
  await app.getByLabel('Código do app autenticador').fill(totp(secret))
  await app.getByRole('button', { name: 'Confirmar' }).click()
  await expect(app.getByTestId('sem-mes')).toBeVisible()

  // O link do convite não vale duas vezes.
  const again = await phone.newPage()
  await again.goto(link)
  await expect(again.getByRole('heading', { name: 'Link inválido' })).toBeVisible()
  await phone.close()

  // No console, o cliente aparece ativo, e a família não recebe outro convite.
  await page.reload()
  await expect(card.getByTestId('cliente').getByText('Ativo', { exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Enviar convite' })).toHaveCount(0)
})
