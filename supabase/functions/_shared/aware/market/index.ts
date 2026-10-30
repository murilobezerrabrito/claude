// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
// Séries do Banco Central: leitura do SGS, calendário de dias úteis, atraso e busca (módulos puros, sem dependências;
// também rodam na função do servidor `market-sync`, pela cópia de `npm run sync:engine`).

export { addDays, brazilToday, businessDaysBetween, easterSunday, isBusinessDay, nationalHolidays } from './calendar.ts'
export {
  INITIAL_START,
  MAX_LAST,
  MAX_WINDOW_YEARS,
  SERIES,
  SERIES_CODES,
  SGS_BASE,
  SgsError,
  fromSgsDate,
  parseSgs,
  sgsLastUrl,
  sgsUrl,
  sgsWindows,
  toSgsDate,
  type SeriesCode,
  type SeriesInfo,
  type SeriesRow,
  type Window,
} from './sgs.ts'
export { IPCA_DUE_DAY, STALE_AFTER_BUSINESS_DAYS, ipcaDueDate, latestOverdueIpcaMonth, seriesLag, type SeriesLag } from './staleness.ts'
export { snippet, syncAll, syncSeries, syncStart, type FetchResult, type RecordInput, type RecordResult, type SeriesSyncResult, type SyncDeps } from './sync.ts'
