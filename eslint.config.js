import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'reference', 'node_modules']),
  {
    files: ['**/*.{js,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023 },
  },
  {
    // Interface (React, navegador)
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/engine/**'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // Motor: TypeScript puro, sem dependências, imports relativos terminados em .ts
    files: ['src/engine/**/*.ts'],
    ignores: ['src/engine/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.\\.?/)',
              message: 'O motor não tem dependências externas: use só imports relativos.',
            },
            {
              regex: '^\\.\\.?/.*(?<!\\.ts)$',
              message: 'Imports do motor terminam em .ts (o Deno exige).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', 'src/**/__tests__/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
])
