// Cores e tipografia do relatório (SPEC, "Identidade"): verde-escuro institucional e cinzas levemente esverdeados,
// como no protótipo; cores de estado só nas faixas, sempre com texto. As cores e o logotipo da Aware ainda vão chegar.

import { Font } from '@react-pdf/renderer'
import type { ProbabilityBand } from '../../engine/metrics.ts'

export const COLORS = {
  page: '#ffffff',
  fg: '#17201d',
  muted: '#5b6a65',
  line: '#dbe2df',
  soft: '#f3f5f4',
  accent: '#1f5f4f',
  accentSoft: '#d6e8e2',
  band: '#9cc7b9',
  good: '#2f7d4f',
  warn: '#b07a16',
  bad: '#b0412f',
  blue: '#2f5f8f',
} as const

/** Cor de cada faixa da probabilidade e um fundo claro para o selo. */
export const BAND_STYLE: Record<ProbabilityBand, { color: string; soft: string }> = {
  folga_grande: { color: COLORS.blue, soft: '#dde7f2' },
  no_caminho: { color: COLORS.good, soft: '#dcefe2' },
  atencao: { color: COLORS.warn, soft: '#f6ead2' },
  em_risco: { color: COLORS.bad, soft: '#f5ddd8' },
}

export const FONTS = { display: 'Fraunces', body: 'IBM Plex Sans' } as const

/** Arquivos das fontes (caminho no Node, URL no navegador), do pacote @fontsource. */
export interface ReportFontFiles {
  fraunces400: string
  fraunces600: string
  plex400: string
  plex400italic: string
  plex500: string
  plex600: string
}

/** Arquivos .woff do subconjunto latino, que cobre os acentos, o "−" e o espaço que não quebra a linha. */
export const FONT_FILE_NAMES: Record<keyof ReportFontFiles, string> = {
  fraunces400: '@fontsource/fraunces/files/fraunces-latin-400-normal.woff',
  fraunces600: '@fontsource/fraunces/files/fraunces-latin-600-normal.woff',
  plex400: '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff',
  plex400italic: '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff',
  plex500: '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff',
  plex600: '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff',
}

let registered = false

export function registerReportFonts(files: ReportFontFiles): void {
  if (registered) return
  Font.register({
    family: FONTS.display,
    fonts: [
      { src: files.fraunces400, fontWeight: 400 },
      { src: files.fraunces600, fontWeight: 600 },
    ],
  })
  Font.register({
    family: FONTS.body,
    fonts: [
      { src: files.plex400, fontWeight: 400 },
      { src: files.plex400italic, fontWeight: 400, fontStyle: 'italic' },
      { src: files.plex500, fontWeight: 500 },
      { src: files.plex600, fontWeight: 600 },
    ],
  })
  // Sem hifenização automática: as palavras quebram inteiras.
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}
