// Gera o PDF do relatório no Node (npm run report:pdf), a partir dos números congelados.

import { renderToFile } from '@react-pdf/renderer'
import type { ReportSnapshot } from '../../report/snapshot.ts'
import { ReportDocument } from './ReportDocument.tsx'
import { registerReportFonts, type ReportFontFiles } from './theme.ts'

export async function renderReportPdf(snapshot: ReportSnapshot, fonts: ReportFontFiles, file: string): Promise<void> {
  registerReportFonts(fonts)
  await renderToFile(<ReportDocument snapshot={snapshot} />, file)
}
