// Plano corrigido pelo IPCA (SPEC, "Plano corrigido pelo IPCA" e "Motor no ciclo mensal", item 4). Cada versão do
// plano guarda o mês-base dos valores; a rodada aplica o IPCA acumulado do mês seguinte ao mês-base até o mês de
// referência. Fica fora do motor, que recebe tudo em reais da data de referência.

import { monthIndex } from '../engine/plan.ts'
import { ReportInputError } from './errors.ts'
import type { PlanSnapshot } from './types.ts'

/** IPCA de cada mês (AAAA-MM), em fração: 0,004 = 0,40% no mês (série 433 do Banco Central dividida por 100). */
export type IpcaSeries = Readonly<Record<string, number>>

/** Acima disso, o IPCA do mês provavelmente veio em porcentagem, e não em fração. */
const IPCA_MAX_ABS = 0.1

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

/** Último dia do mês (mês de 1 a 12). */
export function lastDayOfMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

/** Meses corridos (ano × 12 + mês − 1) de um mês AAAA-MM. */
export function parseMonth(text: string, what: string): number {
  const m = MONTH_RE.exec(text)
  if (!m) throw new ReportInputError('mes_invalido', `Mês inválido em ${what}: use AAAA-MM.`)
  return monthIndex(Number(m[1]), Number(m[2]))
}

/** Mês AAAA-MM de meses corridos. */
export function formatMonth(index: number): string {
  const year = Math.floor(index / 12)
  return `${year}-${String(index - year * 12 + 1).padStart(2, '0')}`
}

/**
 * IPCA acumulado do mês seguinte a `fromMonth` até `toMonth`, inclusive, como fator (1,004 = 0,40%).
 * Vale 1 quando os dois meses são o mesmo. Falta de IPCA em algum mês é erro, nunca zero.
 */
export function ipcaFactor(ipca: IpcaSeries, fromMonth: string, toMonth: string): number {
  const from = parseMonth(fromMonth, 'mês-base')
  const to = parseMonth(toMonth, 'mês de referência')
  if (from > to) {
    throw new ReportInputError('mes_base_posterior', `O mês-base (${fromMonth}) é depois do mês de referência (${toMonth}).`)
  }
  let factor = 1
  for (let m = from + 1; m <= to; m++) {
    const key = formatMonth(m)
    const rate = ipca[key]
    if (rate === undefined) {
      throw new ReportInputError('ipca_ausente', `Falta o IPCA de ${key} para levar os valores de ${fromMonth} a ${toMonth}.`)
    }
    if (!Number.isFinite(rate) || Math.abs(rate) >= IPCA_MAX_ABS) {
      throw new ReportInputError('ipca_invalido', `IPCA inválido em ${key}: informe em fração (0,40% = 0,004).`)
    }
    factor *= 1 + rate
  }
  return factor
}

/** Arredonda para centavos, como os valores monetários do banco (`numeric(18,2)`). */
export const toCents = (value: number): number => Math.round(value * 100) / 100

/**
 * Cópia do plano com todos os valores em reais multiplicados por `factor` e arredondados para centavos: legado mínimo,
 * fluxos, eventos, bens declarados (valor, valor líquido de venda e renda) e metas de legado. Pessoas, anos e regras
 * não mudam.
 */
export function correctPlan(snapshot: PlanSnapshot, factor: number): PlanSnapshot {
  if (!Number.isFinite(factor) || factor <= 0) throw new ReportInputError('fator_invalido', 'Fator de correção inválido.')
  // O plano é JSON puro (vem de `plan_versions.snapshot`).
  const copy = JSON.parse(JSON.stringify(snapshot)) as PlanSnapshot
  if (copy.legacyMin !== undefined) copy.legacyMin = toCents(copy.legacyMin * factor)
  for (const cf of copy.cashFlows) cf.annualAmountReal = toCents(cf.annualAmountReal * factor)
  for (const ev of copy.events) ev.amountReal = toCents(ev.amountReal * factor)
  for (const a of copy.otherAssets) {
    a.value = toCents(a.value * factor)
    if (a.netSaleValue !== undefined) a.netSaleValue = toCents(a.netSaleValue * factor)
    if (a.annualIncome !== undefined) a.annualIncome = toCents(a.annualIncome * factor)
  }
  for (const g of copy.goals) if (g.amount !== undefined) g.amount = toCents(g.amount * factor)
  return copy
}
