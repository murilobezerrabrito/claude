// Testes de ponta a ponta do console (SPEC, "Stack técnica": Playwright para os fluxos principais), contra o
// Supabase LOCAL com os dados fictícios. O servidor do Vite sobe com o endereço e a chave publicável locais.

import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'
import { localStack } from './scripts/localSupabase.ts'

const local = localStack()
// No ambiente da nuvem do Claude Code, o Chromium já vem instalado em /opt/pw-browsers (sem baixar outro).
const preinstalled = '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5199',
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: existsSync(preinstalled) && !process.env.CI ? { executablePath: preinstalled } : {},
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: local.url, VITE_SUPABASE_PUBLISHABLE_KEY: local.publishable },
  },
})
