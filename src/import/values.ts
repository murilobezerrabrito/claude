// Leitura dos valores das células: números com ponto ou vírgula decimal, datas AAAA-MM-DD, códigos e moedas. Valores
// em dinheiro são arredondados ao centavo pela representação decimal (meio centavo para cima), como o numeric do banco.

import { lastDayOfMonth } from '../report/inflation.ts'
import { CURRENCIES, type Cell, type Currency } from './types.ts'

/** Resultado da leitura de uma célula: o valor ou a mensagem de erro, sem o número da linha. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value })
const fail = <T>(message: string): Parsed<T> => ({ ok: false, message })

/** Nome de coluna comparável: sem marca de ordem de bytes, acentos, maiúsculas e espaços nas pontas. */
export function normalizeHeader(cell: Cell): string {
  return String(cell ?? '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

/** Texto da célula sem espaços nas pontas; vazio vira "". */
export function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return ''
  return String(cell).trim()
}

export const isBlank = (cell: Cell): boolean => cellText(cell) === ''

const PLAIN_DECIMAL = /^(-?)(\d+)(?:[.,](\d+))?$/
const THOUSANDS = /^-?\d{1,3}([.,]\d{3})+([.,]\d+)?$/

/** Texto decimal (sem expoente) de um número lido de XLSX. */
function numberText(value: number): string | undefined {
  if (!Number.isFinite(value)) return undefined
  const text = String(value)
  if (!/e/i.test(text)) return text
  // Expoente: só números muito pequenos (ruído de ponto flutuante); os grandes não cabem nas colunas do banco.
  return Math.abs(value) < 1e-6 ? value.toFixed(12) : undefined
}

/**
 * Número decimal com até `decimals` casas, arredondado pela representação decimal (meio para cima, longe do zero).
 * Aceita ponto ou vírgula decimal; recusa separador de milhar, porque "1.234" seria ambíguo.
 */
export function parseDecimal(cell: Cell, decimals: number): Parsed<number> {
  const text = typeof cell === 'number' ? numberText(cell) : cellText(cell)
  if (text === undefined) return fail('número inválido')
  const m = PLAIN_DECIMAL.exec(text)
  if (!m) {
    if (THOUSANDS.test(text)) return fail(`"${text}" tem separador de milhar; use só o separador decimal (ex.: 1234.56 ou 1234,56)`)
    return fail(`"${text}" não é um número (use 1234.56 ou 1234,56)`)
  }
  const [, sign, intPart, frac = ''] = m
  const padded = (frac + '0'.repeat(decimals + 1)).slice(0, decimals + 1)
  let units = BigInt(intPart + padded.slice(0, decimals))
  if (Number(padded[decimals]) >= 5) units += 1n
  const scale = 10n ** BigInt(decimals)
  const whole = units / scale
  const rest = (units % scale).toString().padStart(decimals, '0')
  const value = Number(`${sign}${whole}${decimals > 0 ? '.' + rest : ''}`)
  return ok(value === 0 ? 0 : value)
}

/** Maior valor que cabe em numeric(18,2). */
export const MAX_MONEY = 1e16

/** Dinheiro com exatamente 3 dígitos depois do separador: "1.500" pode ser mil e quinhentos ou um e meio. */
const AMBIGUOUS_MONEY = /^-?\d+[.,]\d{3}$/

/**
 * Valor em dinheiro, maior ou igual a zero (ou maior que zero), ao centavo. Texto com exatamente 3 dígitos depois do
 * separador é recusado por ser ambíguo (milhar ou decimais); números de XLSX não têm essa ambiguidade.
 */
export function parseMoney(cell: Cell, positive: boolean): Parsed<number> {
  if (typeof cell !== 'number' && AMBIGUOUS_MONEY.test(cellText(cell))) {
    return fail(`"${cellText(cell)}" é ambíguo (milhar ou casas decimais?); escreva sem separador de milhar e com até 2 casas (ex.: 1500 ou 1500,00)`)
  }
  const r = parseDecimal(cell, 2)
  if (!r.ok) return r
  if (r.value < 0) return fail('valor negativo')
  if (positive && r.value === 0) return fail('o valor precisa ser maior que zero')
  if (r.value >= MAX_MONEY) return fail('valor grande demais')
  return r
}

/** Quantidade ou preço unitário, maior ou igual a zero, com até 8 casas (numeric(24,8)). */
export function parseQuantity(cell: Cell): Parsed<number> {
  const r = parseDecimal(cell, 8)
  if (!r.ok) return r
  if (r.value < 0) return fail('valor negativo')
  if (r.value >= 1e16) return fail('valor grande demais')
  return r
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Data AAAA-MM-DD válida no calendário. */
export function parseDate(cell: Cell): Parsed<string> {
  if (typeof cell === 'number') return fail('data em número; use o formato AAAA-MM-DD')
  const text = cellText(cell)
  const m = DATE_RE.exec(text)
  if (!m) return fail(`"${text}" não é uma data no formato AAAA-MM-DD`)
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year, month)) return fail(`"${text}" não é uma data válida`)
  return ok(text)
}

/** A data é o último dia do mês. */
export function isMonthEnd(date: string): boolean {
  const [year, month, day] = date.split('-').map(Number)
  return day === lastDayOfMonth(year, month)
}

/** Moeda aceita na v1 (BRL ou USD). */
export function parseCurrency(cell: Cell): Parsed<Currency> {
  const text = cellText(cell).toUpperCase()
  const found = CURRENCIES.find((c) => c === text)
  return found ? ok(found) : fail(`moeda "${cellText(cell)}" não aceita na v1: use BRL ou USD`)
}

/** Código (cliente ou ativo): sem espaços nas pontas, em maiúsculas. */
export const normalizeCode = (cell: Cell): string => cellText(cell).toUpperCase()

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

/** ISIN opcional: 12 caracteres (país, código e dígito). */
export function parseIsin(cell: Cell): Parsed<string | undefined> {
  const text = cellText(cell).toUpperCase()
  if (text === '') return ok(undefined)
  return ISIN_RE.test(text) ? ok(text) : fail(`ISIN "${text}" inválido (12 caracteres, ex.: BRSTNCNTB4U6)`)
}

const CNPJ_RE = /^[0-9A-Z]{12}[0-9]{2}$/

/**
 * CNPJ opcional, com ou sem pontuação, devolvido só com os 14 caracteres. Aceita o CNPJ alfanumérico (a partir de
 * julho de 2026): 12 letras ou números e 2 dígitos verificadores. Os dígitos não são conferidos.
 */
export function parseCnpj(cell: Cell): Parsed<string | undefined> {
  const text = cellText(cell).toUpperCase()
  if (text === '') return ok(undefined)
  const bare = text.replace(/[./-]/g, '')
  return CNPJ_RE.test(bare) ? ok(bare) : fail(`CNPJ "${text}" inválido (14 caracteres, ex.: 00.000.000/0001-00)`)
}

/** Casas da cotação de moeda: o dólar de venda do Banco Central vem com 4. */
const RATE_DECIMALS = 8

/**
 * Valor convertido para reais ao centavo: valor × cotação, arredondado com meio centavo para cima, como
 * round(valor * cotação, 2) no banco. Conta em inteiros para não perder centavos.
 */
export function toBrl(value: number, rate: number): number {
  const v = parseDecimal(value, 2)
  const r = parseDecimal(rate, RATE_DECIMALS)
  if (!v.ok || !r.ok || v.value < 0 || r.value <= 0) throw new RangeError('Valor ou cotação inválidos na conversão para reais.')
  const cents = BigInt(Math.round(v.value * 100))
  const rateUnits = BigInt(Math.round(r.value * 10 ** RATE_DECIMALS))
  const scale = 10n ** BigInt(RATE_DECIMALS)
  const product = cents * rateUnits
  const rounded = (product + scale / 2n) / scale
  return Number(rounded) / 100
}

/** Soma ao centavo, sem acumular erro de ponto flutuante. */
export function sumMoney(values: Iterable<number>): number {
  let cents = 0
  for (const v of values) cents += Math.round(v * 100)
  return cents / 100
}
