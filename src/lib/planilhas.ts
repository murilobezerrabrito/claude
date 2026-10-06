// Leitura dos arquivos da importação mensal (SPEC, "Stack técnica": Papa Parse para CSV e SheetJS para XLSX). Só
// transforma o arquivo em linhas de células; a validação fica em src/import, que é puro.

import Papa from 'papaparse'
import type { Sheet } from '../import/types.ts'

/** Texto do arquivo: UTF-8 ou, se não for UTF-8 válido, Windows-1252 (o padrão do Excel em português). */
export function decodeText(bytes: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes)
  }
  return text.replace(/^\uFEFF/, '')
}

/** Separador do CSV pelo cabeçalho, que não tem números: ponto e vírgula (Excel em português), tabulação ou vírgula. */
function guessDelimiter(text: string): string {
  const header = text.slice(0, text.search(/\r?\n|$/))
  const count = (ch: string) => header.split(ch).length - 1
  const candidates = [';', '\t', ','].map((d) => [d, count(d)] as const)
  const [best] = candidates.sort((a, b) => b[1] - a[1])
  return best[1] > 0 ? best[0] : ','
}

export class SheetReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SheetReadError'
  }
}

/** CSV em linhas de texto. As linhas em branco ficam, para manter o número da linha do arquivo. */
export function readCsv(text: string): Sheet {
  const clean = text.replace(/^\uFEFF/, '')
  const result = Papa.parse<string[]>(clean, { delimiter: guessDelimiter(clean), skipEmptyLines: false })
  const fatal = result.errors.find((e) => e.type === 'Quotes' || e.type === 'Delimiter')
  if (fatal) {
    const line = fatal.row === undefined ? '' : ` (linha ${fatal.row + 1})`
    throw new SheetReadError(`Não foi possível ler o CSV${line}: confira as aspas e o separador.`)
  }
  const rows = result.data
  // A quebra de linha no fim do arquivo gera uma última linha vazia.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop()
  return { rows }
}

/** Lê o arquivo pela extensão. */
export function readSheetFile(fileName: string, bytes: Uint8Array): Sheet {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'csv' || ext === 'txt') return readCsv(decodeText(bytes))
  throw new SheetReadError(`Formato não aceito: .${ext}. Use CSV ou XLSX.`)
}
