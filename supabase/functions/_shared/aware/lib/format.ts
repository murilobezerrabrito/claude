// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Formatação de números e datas para o cliente (SPEC, "Formatação de números"), em português do Brasil.
// Pura (só ES2023 e Intl), como o motor: serve ao relatório, ao console e ao app.
// Entre "R$" e o número vai um espaço que não quebra a linha; o sinal de menos é "−".

const NBSP = '\u00a0'
const MINUS = '\u2212'

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const formatters = new Map<number, Intl.NumberFormat>()
/** Número sem sinal, com `decimals` casas: "12,4", "12.400.000,00". */
function digits(value: number, decimals: number): string {
  let f = formatters.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    formatters.set(decimals, f)
  }
  return f.format(Math.abs(value))
}

/** Sinal de um valor já arredondado: "−" para negativo, "+" para positivo quando pedido, nada para zero. */
function sign(rounded: string, value: number, plus: boolean): string {
  if (/^[0,.]+$/.test(rounded)) return ''
  return value < 0 ? MINUS : plus ? '+' : ''
}

/** Moeda resumida: "R$ 12,4 mi", "R$ 850 mil", "R$ 1,2 bi", "R$ 900". */
export function formatMoney(value: number): string {
  const abs = Math.abs(value)
  let body: string
  if (abs >= 999_950_000) body = `${digits(abs / 1e9, 1)}${NBSP}bi`
  else if (abs >= 999_500) body = `${digits(abs / 1e6, 1)}${NBSP}mi`
  else if (abs >= 999.5) body = `${digits(abs / 1e3, 0)}${NBSP}mil`
  else body = digits(abs, 0)
  return `${sign(body.replace(/[^\d,.]/g, ''), value, false)}R$${NBSP}${body}`
}

/** "R$ 85 mil por mês". */
export function formatMonthly(value: number): string {
  return `${formatMoney(value)} por mês`
}

/** Valor exato, para tabelas detalhadas: "R$ 12.400.000,00". */
export function formatMoneyExact(value: number): string {
  const body = digits(value, 2)
  return `${sign(body, value, false)}R$${NBSP}${body}`
}

/** Probabilidade inteira em %, sem casas: nunca "100%" se não é certeza, nem "0%" se há alguma chance. */
function probabilityPoints(p: number): number {
  const r = Math.round(p * 100)
  if (r >= 100 && p < 1) return 99
  if (r <= 0 && p > 0) return 1
  return r
}

/** "87%". */
export function formatProbability(p: number): string {
  return `${probabilityPoints(p)}%`
}

/** "87 de cada 100 cenários". */
export function formatFrequency(p: number): string {
  return `${probabilityPoints(p)} de cada 100 cenários`
}

/** Percentual com uma casa, a partir de décimos de ponto percentual (865 → "86,5%"); usado na ponte. */
export function formatTenthsPercent(tenths: number): string {
  const body = digits(tenths / 10, 1)
  return `${sign(body, tenths, false)}${body}%`
}

/** Variação em pontos percentuais, a partir de décimos (−181 → "−18,1 p.p."; 3 → "+0,3 p.p."). */
export function formatTenthsPp(tenths: number): string {
  const body = digits(tenths / 10, 1)
  return `${sign(body, tenths, true)}${body}${NBSP}p.p.`
}

/** Variação de uma taxa em pontos percentuais: 0,0038 → "+0,38 p.p." (com `decimals` casas). */
export function formatPp(delta: number, decimals = 1): string {
  const body = digits(delta * 100, decimals)
  return `${sign(body, delta, true)}${body}${NBSP}p.p.`
}

/** Retorno real: "IPCA + 3,8% a.a." (ou "IPCA − 0,5% a.a."). */
export function formatRealReturn(rate: number, decimals = 1): string {
  const body = digits(rate * 100, decimals)
  const negative = sign(body, rate, false) === MINUS
  return `IPCA ${negative ? MINUS : '+'} ${body}% a.a.`
}

/** Percentual com sinal e uma casa: "−2,5%", "+1,0%". */
export function formatSignedPercent(rate: number, decimals = 1): string {
  const body = digits(rate * 100, decimals)
  return `${sign(body, rate, true)}${body}%`
}

/** Percentual sem sinal: "62,0%" (com `decimals` casas). */
export function formatPercent(rate: number, decimals = 1): string {
  const body = digits(rate * 100, decimals)
  return `${sign(body, rate, false)}${body}%`
}

function monthParts(month: string): [number, number] {
  const m = /^(\d{4})-(0[1-9]|1[0-2])/.exec(month)
  if (!m) throw new Error(`Mês inválido: ${month}`)
  return [Number(m[1]), Number(m[2])]
}

/** "out/2026", de "2026-10" ou "2026-10-31". */
export function formatMonthLabel(month: string): string {
  const [y, m] = monthParts(month)
  return `${MONTHS[m - 1].slice(0, 3)}/${y}`
}

/** "outubro", de "2026-10" ou "2026-10-31". */
export function monthName(month: string): string {
  return MONTHS[monthParts(month)[1] - 1]
}

/** "30/09/2026", de "2026-09-30". */
export function formatDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) throw new Error(`Data inválida: ${date}`)
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** "aos 62 anos". */
export function formatAge(age: number): string {
  return `aos ${age} anos`
}
