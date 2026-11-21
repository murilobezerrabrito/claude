// Sugestões do cliente AI no console (Fase 3, etapa 3b): o cliente fictício sugere uma mudança no plano (pela função do
// banco, como o app fará na etapa 3d); o responsável da família vê a fila na página da família, recusar pede a nota, e
// ao confirmar o cliente recebe a resposta. Família e contas novas a cada execução, só no Supabase LOCAL.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { ClientMonthInputs } from '../src/app/types.ts'
import { call, ensureUser, localStack, newPassword, signIn } from '../scripts/localSupabase.ts'
import { signInWithEnrollment } from './helpers.ts'

test('o cliente sugere uma mudança no plano e o responsável confirma no console', async ({ page }) => {
  const local = localStack()
  const tag = Date.now().toString(36).toUpperCase()
  const code = `E2E-${tag}-S`
  const responsavel = { email: 'e2e.responsavel@exemplo.invalid', password: newPassword() }
  const ownerId = await ensureUser(local, responsavel.email, 'responsavel', responsavel.password)
  const household = randomUUID()
  await call(local, '/rest/v1/households', {
    admin: true,
    body: {
      id: household, code, name: 'Família S do teste (fictícia)', channel: 'ai', owner_id: ownerId, profile_id: 'moderado',
      weights_source: 'carteira_atual', fee_rate: 0.008, horizon_age: 95, seed: 1234,
    },
  })

  // O cliente (conta nova, ligada só a esta família) sugere.
  const client = await signIn(local, `e2e.cliente.${tag.toLowerCase()}@exemplo.invalid`, 'cliente_ai', 'e2e', code)
  const text = 'A faculdade da Laura começa um ano antes, em 2029.'
  await call(local, '/rest/v1/rpc/suggest_plan_change', { token: client, body: { p_text: text } })

  // O responsável entra no console e responde na página da família.
  await signInWithEnrollment(page, responsavel)
  await page.goto(`/familias/${household}`)
  const card = page.getByTestId('sugestoes')
  await expect(card.getByText('Sugestões do cliente (1 pendente)')).toBeVisible()
  const item = card.getByTestId('sugestao').filter({ hasText: text })
  await expect(item.getByText('Pendente')).toBeVisible()
  await expect(item.getByRole('button', { name: 'Recusar' })).toBeDisabled()
  await item.getByLabel('Nota para o cliente').fill('Vou ajustar o plano nesta semana.')
  await item.getByRole('button', { name: 'Confirmar' }).click()
  await expect(item.getByText('Confirmada', { exact: true })).toBeVisible()
  await expect(item.getByText(/Confirmada por e2e\.responsavel@exemplo\.invalid em .*: Vou ajustar o plano nesta semana\./)).toBeVisible()
  await expect(card.getByText('Sugestões do cliente', { exact: true })).toBeVisible()

  // O cliente vê a resposta.
  const month = (await call(local, '/rest/v1/rpc/client_month', { token: client, body: {} })) as ClientMonthInputs
  expect(month.ref_date).toBeNull()
  expect(month.requests).toEqual([expect.objectContaining({ text, status: 'confirmada', review_note: 'Vou ajustar o plano nesta semana.' })])
})
