import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { renderToBuffer } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'
import { EXAMPLE_SNAPSHOT_PATH } from '../../../../scripts/reportExample.ts'
import type { ReportSnapshot } from '../../../report/snapshot.ts'
import { ReportDocument } from '../ReportDocument.tsx'
import { FONT_FILE_NAMES, registerReportFonts, type ReportFontFiles } from '../theme.ts'

const require = createRequire(import.meta.url)
const snapshot = JSON.parse(readFileSync(new URL(`../../../../${EXAMPLE_SNAPSHOT_PATH}`, import.meta.url), 'utf8')) as ReportSnapshot

describe('PDF do relatório de exemplo', () => {
  it('gera sete páginas A4 paisagem a partir dos números congelados, com as fontes do relatório', async () => {
    registerReportFonts(Object.fromEntries(Object.entries(FONT_FILE_NAMES).map(([k, name]) => [k, require.resolve(name)])) as unknown as ReportFontFiles)
    const pdf = await renderToBuffer(<ReportDocument snapshot={snapshot} />)
    const text = pdf.toString('latin1')
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text.match(/\/Type \/Page[^s]/g)).toHaveLength(7)
    expect(text).toMatch(/\/MediaBox \[0 0 841\.89\d* 595\.28\d*\]/)
    for (const font of ['Fraunces-SemiBold', 'IBMPlexSans-Regular']) expect(text).toContain(font)
  })
})
