import { expect, type Page } from '@playwright/test'
import { ensureUser, localStack, newPassword, totp } from '../scripts/localSupabase.ts'

export interface TestUser {
  email: string
  password: string
}

/** Usuário fictício de teste, com o papel e uma senha nova, sem autenticador (o teste cadastra pela tela). */
export async function testUser(email: string, role: string): Promise<TestUser> {
  const password = newPassword()
  await ensureUser(localStack(), email, role, password)
  return { email, password }
}

/** Entra pela tela: senha e cadastro do app autenticador (primeiro acesso), lendo a chave mostrada na tela. */
export async function signInWithEnrollment(page: Page, user: TestUser) {
  await page.goto('/')
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha').fill(user.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Cadastre o app autenticador' })).toBeVisible()
  const secret = (await page.getByTestId('segredo-totp').textContent()) ?? ''
  await page.getByLabel('Código do app autenticador').fill(totp(secret))
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByRole('navigation', { name: 'Seções do console' })).toBeVisible()
}
