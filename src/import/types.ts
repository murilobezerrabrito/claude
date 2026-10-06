// Tipos da importação mensal (SPEC, "Importação mensal das posições" e "Aportes e resgates"): a planilha já lida
// (linhas de células) entra; linhas validadas, ou a lista de erros com o número da linha, saem.

/** Célula de planilha já lida: texto (CSV ou XLSX) ou número (XLSX). Datas do XLSX chegam como texto AAAA-MM-DD. */
export type Cell = string | number | boolean | null | undefined

/** Planilha lida: a primeira linha é o cabeçalho. A linha i do arquivo é rows[i - 1]. */
export interface Sheet {
  rows: Cell[][]
}

/** Moedas aceitas na v1: real e dólar (convertido pelo dólar de venda do Banco Central, série 1). */
export type Currency = 'BRL' | 'USD'

export const CURRENCIES: readonly Currency[] = ['BRL', 'USD']

/** Problema encontrado na planilha. `line` é a linha do arquivo (o cabeçalho é a linha 1); sem linha, vale para o arquivo. */
export interface ImportIssue {
  line?: number
  message: string
}

export type ReadResult<T> =
  | { ok: true; refDate: string; rows: T[]; warnings: ImportIssue[] }
  | { ok: false; errors: ImportIssue[]; warnings: ImportIssue[] }

/** Uma posição: um ativo de uma família num custodiante, na data de referência. */
export interface PositionRow {
  line: number
  refDate: string
  clientCode: string
  custodian: string
  assetCode: string
  isin?: string
  /** CNPJ só com números e letras (14 caracteres), sem pontuação. */
  cnpj?: string
  assetName: string
  quantity: number
  unitPrice: number
  grossValue: number
  netValue: number
  currency: Currency
}

export type FlowKind = 'aporte' | 'resgate'

/** Um aporte ou resgate do mês, sempre com valor positivo. */
export interface FlowRow {
  line: number
  refDate: string
  clientCode: string
  custodian: string
  /** Data do movimento (AAAA-MM-DD). Sem data, a rentabilidade usa o meio do mês e marca "datas aproximadas". */
  date?: string
  kind: FlowKind
  amount: number
  currency: Currency
  description?: string
}

/** PL oficial de uma família no mês, do extrato do custodiante (CADM) ou da corretora (AI), em reais. */
export interface OfficialPlRow {
  line: number
  refDate: string
  clientCode: string
  officialPl: number
}
