// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Calendário dos dias úteis do mercado brasileiro: segunda a sexta, menos os feriados nacionais do calendário da
// ANBIMA. Serve para medir o atraso das séries do Banco Central. Datas em "AAAA-MM-DD", sem horário: só o dia conta.

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')

export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

function utc(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Soma (ou subtrai) dias a uma data AAAA-MM-DD. */
export function addDays(date: string, days: number): string {
  const dt = new Date(utc(date) + days * DAY_MS)
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/** Domingo de Páscoa no calendário gregoriano (algoritmo de Meeus, Jones e Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return isoDate(year, month, day)
}

const holidayCache = new Map<number, Map<string, string>>()

/** Feriados nacionais do ano (data → nome), como no calendário da ANBIMA; o 20 de novembro vale a partir de 2024. */
export function nationalHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year)
  if (cached) return cached
  const easter = easterSunday(year)
  const list: [string, string][] = [
    [isoDate(year, 1, 1), 'Confraternização Universal'],
    [addDays(easter, -48), 'Carnaval (segunda-feira)'],
    [addDays(easter, -47), 'Carnaval (terça-feira)'],
    [addDays(easter, -2), 'Sexta-feira da Paixão'],
    [isoDate(year, 4, 21), 'Tiradentes'],
    [isoDate(year, 5, 1), 'Dia do Trabalho'],
    [addDays(easter, 60), 'Corpus Christi'],
    [isoDate(year, 9, 7), 'Independência do Brasil'],
    [isoDate(year, 10, 12), 'Nossa Senhora Aparecida'],
    [isoDate(year, 11, 2), 'Finados'],
    [isoDate(year, 11, 15), 'Proclamação da República'],
    ...(year >= 2024 ? [[isoDate(year, 11, 20), 'Dia Nacional de Zumbi e da Consciência Negra'] as [string, string]] : []),
    [isoDate(year, 12, 25), 'Natal'],
  ]
  const map = new Map(list)
  holidayCache.set(year, map)
  return map
}

/** Dia útil: segunda a sexta, fora dos feriados nacionais. */
export function isBusinessDay(date: string): boolean {
  const weekday = new Date(utc(date)).getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  return !nationalHolidays(Number(date.slice(0, 4))).has(date)
}

/** Dias úteis estritamente entre as duas datas (sem contar nenhuma delas); zero se `before` não vem depois de `after`. */
export function businessDaysBetween(after: string, before: string): number {
  let count = 0
  for (let d = addDays(after, 1); d < before; d = addDays(d, 1)) if (isBusinessDay(d)) count++
  return count
}

/** Hoje no horário de Brasília (AAAA-MM-DD): o servidor e o navegador podem estar em outro fuso. */
export function brazilToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
