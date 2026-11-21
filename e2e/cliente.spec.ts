// Convite e entrada do cliente AI (Fase 3, etapa 3c; D-071 e D-074): o responsável convida pelo console, sem ver o link;
// o e-mail chega só ao cliente (Mailpit, o servidor de e-mail do Supabase local); no celular, o cliente abre o link,
// cria a senha (as regras valem), cadastra o app autenticador e entra; a família ainda sem mês fechado mostra o aviso;
// sai e entra de novo com senha e código; o link não vale duas vezes; no console, o cliente aparece ativo. Com o mês
// fechado da Barbosa: um cenário salvo na conta (volta depois de recarregar) e uma sugestão enviada ao assessor.

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
  // Recarregar a página não pula a senha (a sessão do link fica na aba).
  await app.reload()
  await expect(app.getByRole('heading', { name: 'Crie a sua senha' })).toBeVisible()
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

test('com a conta: o mês fechado da família, um cenário salvo na conta e uma sugestão enviada ao assessor', async ({ browser }) => {
  // A Barbosa (AI) tem setembro fechado depois do `db:import -- exemplo`, que a integração contínua roda antes.
  const local = localStack()
  const email = 'e2e.cliente.barbosa@exemplo.invalid'
  const password = newPassword()
  await ensureUser(local, email, 'cliente_ai', password, 'BAR001')
  const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, locale: 'pt-BR' })
  const app = await phone.newPage()
  await app.goto('/app')
  await app.getByLabel('E-mail').fill(email)
  await app.getByLabel('Senha').fill(password)
  await app.getByRole('button', { name: 'Entrar' }).click()
  const secret = (await app.getByTestId('segredo-totp').textContent()) ?? ''
  await app.getByLabel('Código do app autenticador').fill(totp(secret))
  await app.getByRole('button', { name: 'Confirmar' }).click()

  // Visão geral do mês fechado (setembro), sem a marca de exemplo.
  await expect(app.getByTestId('probabilidade')).toBeVisible()
  await expect(app.getByText('Números de setembro de 2026')).toBeVisible()
  await expect(app.getByText('Exemplo com dados fictícios')).toHaveCount(0)

  // E se?: salva um cenário na conta; depois de recarregar, ele continua lá; apagado, some.
  await app.getByRole('navigation', { name: 'Seções do app' }).getByRole('link', { name: 'E se?' }).click()
  const result = app.getByTestId('chance-cenario')
  await expect(app.getByText(/^Retorno que o plano precisa:/)).toBeVisible({ timeout: 60_000 })
  await app.getByRole('button', { name: 'Gastar 10% a mais' }).click()
  await expect(result).toHaveText(/ vai para /, { timeout: 30_000 })
  await app.getByRole('button', { name: 'Salvar este cenário' }).click()
  await app.getByLabel('Nome do cenário').fill('Gastar mais (e2e)')
  await app.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(app.getByTestId('meus-cenarios').getByText('Gastar mais (e2e)')).toBeVisible()
  await expect(app.getByTestId('comparacao')).toContainText('Gastar mais (e2e)')
  await app.reload()
  const mine = app.getByTestId('meus-cenarios').getByTestId('cenario-salvo').filter({ hasText: 'Gastar mais (e2e)' })
  await expect(mine).toBeVisible({ timeout: 30_000 })
  await mine.getByRole('button', { name: 'Abrir' }).click()
  await expect(result).toHaveText(/ vai para /, { timeout: 30_000 })
  await mine.getByRole('button', { name: 'Apagar' }).click()
  await expect(app.getByTestId('meus-cenarios')).toHaveCount(0)

  // Plano: a sugestão vai para o assessor e aparece esperando a resposta.
  await app.getByRole('navigation', { name: 'Seções do app' }).getByRole('link', { name: 'Plano' }).click()
  await app.getByRole('button', { name: 'Sugerir uma mudança' }).click()
  const text = `A viagem de 2027 foi cancelada (e2e ${Date.now()}).`
  await app.getByLabel('Sugestão de mudança no plano').fill(text)
  await app.getByRole('button', { name: 'Enviar ao assessor' }).click()
  await expect(app.getByText('Sugestão enviada ao seu assessor. Ele confirma a mudança no plano.')).toBeVisible()
  const item = app.getByTestId('minhas-sugestoes').getByRole('listitem').filter({ hasText: text })
  await expect(item.getByText('Esperando o assessor')).toBeVisible()
  await expect(app.getByRole('button', { name: 'Sugerir outra mudança' })).toBeVisible()
  await phone.close()

  // Responde a sugestão do teste (o banco limita a 10 pendentes por família).
  const [request] = (await call(local, `/rest/v1/plan_change_requests?payload->>texto=eq.${encodeURIComponent(text)}&select=id`, { admin: true })) as { id: string }[]
  await call(local, `/rest/v1/plan_change_requests?id=eq.${request.id}`, {
    admin: true,
    method: 'PATCH',
    body: { status: 'recusada', reviewed_at: new Date().toISOString(), review_note: 'Resposta automática do teste.' },
  })
})
