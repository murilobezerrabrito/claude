// Cores e tipografia do relatório (SPEC, "Identidade"): azul-escuro e branco, as cores da AWARE Investments
// (D-040). A capa é azul-escura; as páginas internas têm a faixa do topo azul-escura e o conteúdo sobre branco, para
// ler bem na tela e impresso. Cores de estado só nas faixas da probabilidade, sempre com texto.

import { Font } from '@react-pdf/renderer'
import type { ProbabilityBand } from '../../engine/metrics.ts'

export const COLORS = {
  page: '#ffffff',
  /** Azul-escuro da marca: capa, faixa do topo e títulos. */
  navy: '#0b1f3a',
  /** Texto sobre o azul-escuro. */
  onNavy: '#ffffff',
  onNavyMuted: '#a9b9d0',
  fg: '#0d1b2e',
  muted: '#56637a',
  line: '#d8dfe9',
  soft: '#f1f4f8',
  /** Barras, linha do cenário do meio e colunas da ponte. */
  accent: '#14335c',
  accentSoft: '#e1e8f2',
  band: '#a7b8d1',
  good: '#2f7d4f',
  warn: '#b07a16',
  bad: '#b0412f',
  /** Faixa "Folga grande": um azul mais claro que o da marca, para não se confundir com ele. */
  blue: '#2a6db5',
} as const

/** Cor de cada faixa da probabilidade e um fundo claro para o selo. */
export const BAND_STYLE: Record<ProbabilityBand, { color: string; soft: string }> = {
  folga_grande: { color: COLORS.blue, soft: '#dde8f6' },
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
