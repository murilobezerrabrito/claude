// Séries do Banco Central no console (SPEC, "Dados de mercado"): a situação das três séries, o aviso de série
// atrasada para a gestão e o comitê e a busca na hora. Supõe o banco do seed (npx supabase db reset): sem nenhum dado
// do CDI, com o dólar e o IPCA fictícios. A busca pelo navegador é simulada (page.route): a integração contínua tem
// rede, e a busca de verdade gravaria os dados do Banco Central por cima das séries fictícias. A função do servidor é
// chamada de verdade só nos pedidos que ela recusa antes de ir ao SGS (permissão e pedido inválido).

import { expect, test } from '@playwright/test'
import { localStack, signIn } from '../scripts/localSupabase.ts'
import { signInWithEnrollment, testUser } from './helpers.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Resposta simulada da função market-sync: uma série com erro, uma com dados e uma sem nada a buscar.
const SYNC_RESULT = {
  hoje: '2026-10-30',
  via: 'console',
  series: [
    {
      code: 'cdi', from: '2024-01-01', to: '2026-10-30', windows: 1, received: 0, inserted: 0, updated: 0, lastDate: null,
      error: 'Não foi possível falar com o SGS (CDI): dns error: failed to lookup address information',
      lag: { stale: true, businessDays: null, message: 'CDI: nenhum dado gravado ainda.' },
    },
    {
      code: 'ipca', from: '2026-10-01', to: '2026-10-30', windows: 1, received: 1, inserted: 0, updated: 1, lastDate: '2026-10-01', error: null,
      lag: { stale: false, businessDays: 0, message: 'IPCA: em dia (último mês: outubro de 2026).' },
    },
    {
      code: 'dolar', from: '2026-10-30', to: '2026-10-30', windows: 0, received: 0, inserted: 0, updated: 0, lastDate: '2026-10-30', error: null,
      lag: { stale: false, businessDays: 0, message: 'Dólar de venda: em dia (último dado de 30/10/2026).' },
    },
  ],
}

test('gestão vê o aviso de série atrasada, a situação das séries e o resultado da busca', async ({ page }) => {
  const gestao = await testUser('e2e.gestao@exemplo.invalid', 'gestao')
  let requested: unknown = null
  await page.route('**/functions/v1/market-sync', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    requested = route.request().postDataJSON()
    await route.fulfill({ status: 200, headers: CORS, json: SYNC_RESULT })
  })

  // O aviso aparece em qualquer página do console, com o link para as séries.
  await signInWithEnrollment(page, gestao)
  const alert = page.getByRole('status').filter({ hasText: 'Séries do Banco Central com atraso' })
  await expect(alert).toContainText('CDI: nenhum dado gravado ainda.')
  await alert.getByRole('link', { name: 'Ver as séries' }).click()
  await expect(page.getByRole('heading', { name: 'Séries do Banco Central' })).toBeVisible()
  await expect(alert.getByRole('link', { name: 'Ver as séries' })).toHaveCount(0)

  // A situação: o último dado como o Banco Central publica, a origem e o atraso.
  const row = (name: string) => page.getByRole('row', { name: new RegExp(`^${name}`) })
  await expect(row('CDI')).toContainText('Nenhum')
  await expect(row('CDI')).toContainText('Atrasada')
  await expect(row('IPCA')).toContainText('0,40% (outubro de 2026)')
  await expect(row('IPCA')).toContainText('Fictício (exemplo)')
  await expect(row('Dólar de venda')).toContainText('R$ 5,0400')
  await expect(row('Dólar de venda')).toContainText('30/10/2026')

  // A busca na hora: o que entrou e o erro de cada série.
  await page.getByRole('button', { name: 'Buscar agora' }).click()
  const result = page.getByRole('status').filter({ hasText: 'Busca concluída com erro em parte das séries:' })
  await expect(result).toContainText('CDI: Não foi possível falar com o SGS (CDI): dns error')
  await expect(result).toContainText('IPCA: 1 recebidos, 0 novos, 1 atualizados.')
  await expect(result).toContainText('Dólar de venda: nada novo a buscar.')
  expect(requested).toEqual({})
})

test('a compliance vê as séries, sem buscar nem receber o aviso; o banker não vê a página', async ({ browser }) => {
  const compliance = await testUser('e2e.compliance@exemplo.invalid', 'compliance')
  const page = await (await browser.newContext()).newPage()
  await signInWithEnrollment(page, compliance)
  await page.getByRole('link', { name: 'Mercado' }).click()
  await expect(page.getByRole('heading', { name: 'Séries do Banco Central' })).toBeVisible()
  await expect(page.getByRole('row', { name: /^CDI/ })).toContainText('Atrasada')
  await expect(page.getByRole('button', { name: 'Buscar agora' })).toHaveCount(0)
  await expect(page.getByText('Séries do Banco Central com atraso')).toHaveCount(0)

  const banker = await testUser('e2e.banker@exemplo.invalid', 'banker')
  const bankerPage = await (await browser.newContext()).newPage()
  await signInWithEnrollment(bankerPage, banker)
  await expect(bankerPage.getByRole('navigation', { name: 'Seções do console' }).getByRole('link', { name: 'Famílias' })).toBeVisible()
  await expect(bankerPage.getByRole('link', { name: 'Mercado' })).toHaveCount(0)
})

test('a função market-sync recusa, antes de ir ao SGS, quem não pode buscar e o pedido inválido', async () => {
  const local = localStack()
  const ask = async (token: string, body: unknown) => {
    const res = await fetch(`${local.url}/functions/v1/market-sync`, {
      method: 'POST',
      headers: { apikey: local.publishable, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as unknown }
  }
  const compliance = await signIn(local, 'e2e.compliance@exemplo.invalid', 'compliance', 'e2e')
  expect(await ask(compliance, {})).toEqual({ status: 403, body: { erro: 'Sem permissão para buscar as séries do Banco Central.' } })
  const gestao = await signIn(local, 'e2e.gestao@exemplo.invalid', 'gestao', 'e2e')
  expect(await ask(gestao, { series: ['selic'] })).toEqual({ status: 400, body: { erro: 'Séries desconhecidas: use cdi, ipca, dolar.' } })
})
