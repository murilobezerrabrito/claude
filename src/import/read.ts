// Validação das planilhas do mês (SPEC, "Importação mensal das posições", "Aportes e resgates" e "Dados mensais por
// canal"): colunas obrigatórias, datas AAAA-MM-DD, números com ponto ou vírgula decimal, um mês por arquivo. Qualquer
// erro recusa o arquivo inteiro (tudo ou nada); os erros vêm com o número da linha do arquivo.

import type { Cell, FlowKind, FlowRow, ImportIssue, OfficialPlRow, PositionRow, ReadResult, Sheet } from './types.ts'
import {
  cellText,
  isBlank,
  isMonthEnd,
  normalizeCode,
  normalizeHeader,
  parseCnpj,
  parseCurrency,
  parseDate,
  parseIsin,
  parseMoney,
  parseQuantity,
  type Parsed,
} from './values.ts'

/** Colunas do arquivo de posições, na ordem do modelo do SPEC. */
export const POSITION_COLUMNS = [
  'data_referencia',
  'codigo_cliente',
  'custodiante',
  'codigo_ativo',
  'isin',
  'cnpj',
  'nome_ativo',
  'quantidade',
  'preco_unitario',
  'valor_bruto',
  'valor_liquido',
  'moeda',
] as const

/** Colunas do arquivo de aportes e resgates. */
export const FLOW_COLUMNS = ['data_referencia', 'codigo_cliente', 'custodiante', 'data_movimento', 'tipo', 'valor', 'moeda', 'descricao'] as const

/** Colunas do arquivo de PL oficial por família. */
export const OFFICIAL_PL_COLUMNS = ['data_referencia', 'codigo_cliente', 'pl_oficial'] as const

/** Acima disso, a lista de erros é cortada (o arquivo já está recusado). */
export const MAX_ERRORS = 100

type Row<C extends string> = Record<C, Cell>

interface Collector {
  errors: ImportIssue[]
  warnings: ImportIssue[]
  extraErrors: number
}

function addError(c: Collector, line: number | undefined, message: string) {
  if (c.errors.length < MAX_ERRORS) c.errors.push(line === undefined ? { message } : { line, message })
  else c.extraErrors += 1
}

/** Lê o cabeçalho e devolve as linhas não vazias como registros por coluna, com o número da linha do arquivo. */
function readTable<C extends string>(sheet: Sheet, columns: readonly C[], c: Collector): { line: number; row: Row<C> }[] | undefined {
  const [header, ...body] = sheet.rows
  if (!header || header.every(isBlank)) {
    addError(c, undefined, 'O arquivo está vazio: falta o cabeçalho com os nomes das colunas.')
    return undefined
  }
  const names = header.map(normalizeHeader)
  const index = new Map<string, number>()
  names.forEach((name, i) => {
    if (name === '') return
    if (index.has(name)) addError(c, 1, `A coluna "${name}" aparece mais de uma vez no cabeçalho.`)
    else index.set(name, i)
  })
  const missing = columns.filter((col) => !index.has(col))
  if (missing.length > 0) addError(c, 1, `Faltam colunas no cabeçalho: ${missing.join(', ')}.`)
  const known = new Set<string>(columns)
  const extra = names.filter((n) => n !== '' && !known.has(n))
  if (extra.length > 0) c.warnings.push({ line: 1, message: `Colunas ignoradas: ${extra.join(', ')}.` })
  if (c.errors.length > 0) return undefined

  const rows: { line: number; row: Row<C> }[] = []
  let dataLines = 0
  body.forEach((cells, i) => {
    if (cells.every(isBlank)) return
    dataLines += 1
    if (cells.slice(header.length).some((cell) => !isBlank(cell))) {
      addError(c, i + 2, 'A linha tem mais colunas que o cabeçalho. Num CSV separado por vírgula, número com vírgula decimal precisa de aspas (ou use ponto e vírgula como separador).')
      return
    }
    const row = {} as Row<C>
    for (const col of columns) row[col] = cells[index.get(col) as number]
    rows.push({ line: i + 2, row })
  })
  if (dataLines === 0) addError(c, undefined, 'O arquivo não tem nenhuma linha de dados.')
  return rows
}

/** Lê uma célula obrigatória ou opcional; o erro sai com a linha e a coluna. */
function field<T>(c: Collector, line: number, column: string, parsed: Parsed<T>): T | undefined {
  if (parsed.ok) return parsed.value
  addError(c, line, `${column}: ${parsed.message}.`)
  return undefined
}

function required(c: Collector, line: number, column: string, cell: Cell): string | undefined {
  const text = cellText(cell)
  if (text === '') {
    addError(c, line, `${column}: obrigatório.`)
    return undefined
  }
  return text
}

/** Uma só data de referência no arquivo, sempre no último dia do mês. */
function checkRefDates(c: Collector, rows: { line: number; refDate?: string }[]): string | undefined {
  const dates = new Set<string>()
  for (const { line, refDate } of rows) {
    if (refDate === undefined) continue
    if (!isMonthEnd(refDate)) addError(c, line, `data_referencia: ${refDate} precisa ser o último dia do mês.`)
    dates.add(refDate)
  }
  if (dates.size > 1) {
    addError(c, undefined, `O arquivo tem mais de uma data de referência (${[...dates].sort().join(', ')}): importe um mês por vez.`)
  }
  return dates.size === 1 ? [...dates][0] : undefined
}

function finish<T>(c: Collector, refDate: string | undefined, rows: T[]): ReadResult<T> {
  if (c.extraErrors > 0) c.errors.push({ message: `E mais ${c.extraErrors} erros.` })
  if (c.errors.length > 0 || refDate === undefined) {
    if (c.errors.length === 0) c.errors.push({ message: 'Falta a data de referência.' })
    return { ok: false, errors: c.errors, warnings: c.warnings }
  }
  return { ok: true, refDate, rows, warnings: c.warnings }
}

const newCollector = (): Collector => ({ errors: [], warnings: [], extraErrors: 0 })

/**
 * Posições por ativo: uma linha por ativo, família e custodiante na data de referência. O mesmo ativo duas vezes no
 * mesmo custodiante da mesma família é erro (linha duplicada).
 */
export function readPositions(sheet: Sheet): ReadResult<PositionRow> {
  const c = newCollector()
  const table = readTable(sheet, POSITION_COLUMNS, c)
  if (!table) return finish<PositionRow>(c, undefined, [])
  const rows: PositionRow[] = []
  const seen = new Map<string, number>()
  const dates: { line: number; refDate?: string }[] = []
  for (const { line, row } of table) {
    const refDate = field(c, line, 'data_referencia', parseDate(row.data_referencia))
    dates.push({ line, refDate })
    const clientCode = required(c, line, 'codigo_cliente', row.codigo_cliente) && normalizeCode(row.codigo_cliente)
    const custodian = required(c, line, 'custodiante', row.custodiante)
    const assetCode = required(c, line, 'codigo_ativo', row.codigo_ativo) && normalizeCode(row.codigo_ativo)
    const isin = field(c, line, 'isin', parseIsin(row.isin))
    const cnpj = field(c, line, 'cnpj', parseCnpj(row.cnpj))
    const assetName = required(c, line, 'nome_ativo', row.nome_ativo)
    const quantity = field(c, line, 'quantidade', isBlank(row.quantidade) ? { ok: false, message: 'obrigatório' } : parseQuantity(row.quantidade))
    const unitPrice = field(c, line, 'preco_unitario', isBlank(row.preco_unitario) ? { ok: false, message: 'obrigatório' } : parseQuantity(row.preco_unitario))
    const grossValue = field(c, line, 'valor_bruto', isBlank(row.valor_bruto) ? { ok: false, message: 'obrigatório' } : parseMoney(row.valor_bruto, false))
    const netValue = field(c, line, 'valor_liquido', isBlank(row.valor_liquido) ? { ok: false, message: 'obrigatório' } : parseMoney(row.valor_liquido, false))
    const currency = field(c, line, 'moeda', parseCurrency(row.moeda))
    if (clientCode && custodian && assetCode) {
      const key = `${clientCode}\u0000${custodian.toUpperCase()}\u0000${assetCode}`
      const first = seen.get(key)
      if (first !== undefined) addError(c, line, `O ativo ${assetCode} aparece de novo para ${clientCode} em ${custodian} (primeira vez na linha ${first}).`)
      else seen.set(key, line)
    }
    // Com qualquer erro, o arquivo inteiro é recusado; a linha só entra completa.
    if (
      refDate === undefined || !clientCode || custodian === undefined || !assetCode || assetName === undefined ||
      quantity === undefined || unitPrice === undefined || grossValue === undefined || netValue === undefined || currency === undefined
    ) {
      continue
    }
    rows.push({
      line, refDate, clientCode, custodian, assetCode,
      ...(isin === undefined ? {} : { isin }),
      ...(cnpj === undefined ? {} : { cnpj }),
      assetName, quantity, unitPrice, grossValue, netValue, currency,
    })
  }
  return finish(c, checkRefDates(c, dates), rows)
}

function parseKind(cell: Cell): Parsed<FlowKind> {
  const text = cellText(cell).toLowerCase()
  if (text === 'aporte' || text === 'resgate') return { ok: true, value: text }
  return { ok: false, message: `"${cellText(cell)}" não é aporte nem resgate` }
}

/**
 * Aportes e resgates do mês, sempre com valor positivo. A data do movimento é opcional e, se houver, fica no mês da
 * data de referência.
 */
export function readFlows(sheet: Sheet): ReadResult<FlowRow> {
  const c = newCollector()
  const table = readTable(sheet, FLOW_COLUMNS, c)
  if (!table) return finish<FlowRow>(c, undefined, [])
  const rows: FlowRow[] = []
  const dates: { line: number; refDate?: string }[] = []
  for (const { line, row } of table) {
    const refDate = field(c, line, 'data_referencia', parseDate(row.data_referencia))
    dates.push({ line, refDate })
    const clientCode = required(c, line, 'codigo_cliente', row.codigo_cliente) && normalizeCode(row.codigo_cliente)
    const custodian = required(c, line, 'custodiante', row.custodiante)
    const date = isBlank(row.data_movimento) ? undefined : field(c, line, 'data_movimento', parseDate(row.data_movimento))
    if (date !== undefined && refDate !== undefined && date.slice(0, 7) !== refDate.slice(0, 7)) {
      addError(c, line, `data_movimento: ${date} fora do mês da data de referência (${refDate.slice(0, 7)}).`)
    }
    const kind = field(c, line, 'tipo', parseKind(row.tipo))
    const amount = field(c, line, 'valor', isBlank(row.valor) ? { ok: false, message: 'obrigatório' } : parseMoney(row.valor, true))
    const currency = field(c, line, 'moeda', parseCurrency(row.moeda))
    const description = cellText(row.descricao)
    if (refDate === undefined || !clientCode || custodian === undefined || kind === undefined || amount === undefined || currency === undefined) continue
    rows.push({
      line, refDate, clientCode, custodian,
      ...(date === undefined ? {} : { date }),
      kind, amount, currency,
      ...(description === '' ? {} : { description }),
    })
  }
  return finish(c, checkRefDates(c, dates), rows)
}

/** PL oficial por família no mês, em reais. Uma linha por família. */
export function readOfficialPl(sheet: Sheet): ReadResult<OfficialPlRow> {
  const c = newCollector()
  const table = readTable(sheet, OFFICIAL_PL_COLUMNS, c)
  if (!table) return finish<OfficialPlRow>(c, undefined, [])
  const rows: OfficialPlRow[] = []
  const seen = new Map<string, number>()
  const dates: { line: number; refDate?: string }[] = []
  for (const { line, row } of table) {
    const refDate = field(c, line, 'data_referencia', parseDate(row.data_referencia))
    dates.push({ line, refDate })
    const clientCode = required(c, line, 'codigo_cliente', row.codigo_cliente) && normalizeCode(row.codigo_cliente)
    const officialPl = field(c, line, 'pl_oficial', isBlank(row.pl_oficial) ? { ok: false, message: 'obrigatório' } : parseMoney(row.pl_oficial, true))
    if (clientCode) {
      const first = seen.get(clientCode)
      if (first !== undefined) addError(c, line, `${clientCode} aparece de novo (primeira vez na linha ${first}).`)
      else seen.set(clientCode, line)
    }
    if (refDate === undefined || !clientCode || officialPl === undefined) continue
    rows.push({ line, refDate, clientCode, officialPl })
  }
  return finish(c, checkRefDates(c, dates), rows)
}
