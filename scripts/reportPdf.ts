// npm run report:pdf: gera o PDF do relatório de exemplo (Família Andrade, out/2026) em relatorios-pdf/, fora do git,
// a partir de src/data/relatorios/andrade-2026-10.json. O layout é JSX (src/console/report), carregado pelo Vite.

import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import type { ReportFontFiles } from '../src/console/report/theme.ts'
import type { ReportSnapshot } from '../src/report/snapshot.ts'
import { EXAMPLE_SNAPSHOT_PATH } from './reportExample.ts'

/** O que src/console/report/renderNode.tsx exporta (o projeto dos scripts não compila JSX). */
interface RenderModule {
  renderReportPdf(snapshot: ReportSnapshot, fonts: ReportFontFiles, file: string): Promise<void>
}

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const snapshot = JSON.parse(readFileSync(new URL(`../${EXAMPLE_SNAPSHOT_PATH}`, import.meta.url), 'utf8')) as ReportSnapshot

const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
try {
  const theme = (await server.ssrLoadModule('/src/console/report/theme.ts')) as typeof import('../src/console/report/theme.ts')
  const fonts = Object.fromEntries(Object.entries(theme.FONT_FILE_NAMES).map(([k, name]) => [k, require.resolve(name)])) as unknown as ReportFontFiles
  const { renderReportPdf } = (await server.ssrLoadModule('/src/console/report/renderNode.tsx')) as RenderModule
  mkdirSync(`${root}relatorios-pdf`, { recursive: true })
  const file = `${root}relatorios-pdf/andrade-${snapshot.refMonth}.pdf`
  await renderReportPdf(snapshot, fonts, file)
  console.log(`PDF gravado em relatorios-pdf/andrade-${snapshot.refMonth}.pdf`)
} finally {
  await server.close()
}
