import { readFileSync } from 'node:fs'
import { readCsv } from '../../lib/planilhas.ts'
import type { Sheet } from '../types.ts'

/** Arquivo de exemplo fictício de src/data/importacao, já lido. */
export function exampleSheet(name: string): Sheet {
  return readCsv(readFileSync(new URL(`../../data/importacao/${name}`, import.meta.url), 'utf8'))
}

/** Planilha a partir de linhas de texto separadas por vírgula (sem aspas). */
export function sheetOf(...lines: string[]): Sheet {
  return { rows: lines.map((l) => l.split(',')) }
}

export const POSITIONS_HEADER =
  'data_referencia,codigo_cliente,custodiante,codigo_ativo,isin,cnpj,nome_ativo,quantidade,preco_unitario,valor_bruto,valor_liquido,moeda'

export const FLOWS_HEADER = 'data_referencia,codigo_cliente,custodiante,data_movimento,tipo,valor,moeda,descricao'

/** Linha de posição válida, com campos trocáveis. */
export function positionLine(over: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    data_referencia: '2026-09-30',
    codigo_cliente: 'AND001',
    custodiante: 'Custodiante A',
    codigo_ativo: 'NTNB-2035',
    isin: '',
    cnpj: '',
    nome_ativo: 'Tesouro IPCA+ 2035',
    quantidade: '120',
    preco_unitario: '4380.55',
    valor_bruto: '525666.00',
    valor_liquido: '512020.00',
    moeda: 'BRL',
  }
  return POSITIONS_HEADER.split(',').map((col) => over[col] ?? base[col]).join(',')
}
