// Atraso das séries (SPEC, "Dados de mercado": avisar o comitê se uma série ficar mais de 3 dias úteis sem dado
// novo). Nas séries diárias (CDI e dólar), contam os dias úteis completos depois do último dado, sem contar hoje (o
// dado de hoje ainda pode sair). No IPCA, mensal, a regra literal acusaria atraso quase todo dia: o IPCA de um mês é
// esperado até o dia 15 do mês seguinte (o IBGE publica perto do dia 10), e o atraso conta os dias úteis depois disso
// (D-069). Datas em AAAA-MM-DD; "hoje" vem de fora (horário de Brasília).

import { formatDate, monthYearName } from '../lib/format.ts'
import { addDays, businessDaysBetween, isoDate } from './calendar.ts'
import { SERIES, type SeriesCode } from './sgs.ts'

/** Mais de 3 dias úteis sem dado novo é atraso. */
export const STALE_AFTER_BUSINESS_DAYS = 3
/** O IPCA de um mês é esperado até este dia do mês seguinte. */
export const IPCA_DUE_DAY = 15

export interface SeriesLag {
  stale: boolean
  /** Dias úteis sem o dado esperado (nulo quando a série não tem nenhum dado). */
  businessDays: number | null
  /** Mensagem em português para o aviso do console. */
  message: string
}

/** "AAAA-MM" do mês seguinte. */
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** Data em que o IPCA do mês ("AAAA-MM") é esperado: dia 15 do mês seguinte. */
export function ipcaDueDate(month: string): string {
  const [y, m] = nextMonth(month).split('-').map(Number)
  return isoDate(y, m, IPCA_DUE_DAY)
}

/** O mês mais recente cujo IPCA já está atrasado se faltar: venceu há mais de 3 dias úteis. */
export function latestOverdueIpcaMonth(today: string): string {
  let month = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)
  for (;;) {
    if (businessDaysBetween(ipcaDueDate(month), today) > STALE_AFTER_BUSINESS_DAYS) return month
    month = addDays(`${month}-01`, -1).slice(0, 7)
  }
}

export function seriesLag(code: SeriesCode, lastDate: string | null, today: string): SeriesLag {
  const info = SERIES[code]
  if (lastDate === null) return { stale: true, businessDays: null, message: `${info.name}: nenhum dado gravado ainda.` }
  if (info.frequency === 'diaria') {
    const days = businessDaysBetween(lastDate, today)
    const stale = days > STALE_AFTER_BUSINESS_DAYS
    return {
      stale,
      businessDays: days,
      message: stale
        ? `${info.name}: o último dado é de ${formatDate(lastDate)}, há ${days} dias úteis sem dado novo.`
        : `${info.name}: em dia (último dado de ${formatDate(lastDate)}).`,
    }
  }
  const overdue = latestOverdueIpcaMonth(today)
  const lastMonth = lastDate.slice(0, 7)
  if (lastMonth >= overdue) {
    return { stale: false, businessDays: 0, message: `${info.name}: em dia (último mês: ${monthYearName(lastMonth)}).` }
  }
  const missing = nextMonth(lastMonth)
  const days = businessDaysBetween(ipcaDueDate(missing), today)
  return {
    stale: true,
    businessDays: days,
    message: `${info.name}: falta o de ${monthYearName(missing)}, esperado até ${formatDate(ipcaDueDate(missing))}; ${days} dias úteis de atraso.`,
  }
}
