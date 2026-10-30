import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  brazilToday,
  businessDaysBetween,
  easterSunday,
  isBusinessDay,
  nationalHolidays,
  parseSgs,
  seriesLag,
  sgsLastUrl,
  sgsUrl,
  sgsWindows,
  SgsError,
  syncAll,
  syncSeries,
  type FetchResult,
  type RecordInput,
  type SyncDeps,
} from '../index.ts'

// Respostas gravadas no formato do SGS, com valores fictícios (src/data/sgs): a rede desta sessão não alcança o SGS.
const fixture = (name: string) => readFileSync(new URL(`../../data/sgs/${name}`, import.meta.url), 'utf8')
const CDI = fixture('serie-12-cdi-2026-09-a-10.json')
const DOLAR = fixture('serie-1-dolar-2026-10.json')
const IPCA = fixture('serie-433-ipca-2025-01-a-2026-09.json')
const ERRO_HTML = fixture('erro-html.txt')
const ERRO_JSON = fixture('erro-json.json')

const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e instanceof SgsError ? e.code : `outro: ${String(e)}`
  }
  return 'sem erro'
}

describe('calendário de dias úteis', () => {
  it('Páscoa e os feriados móveis', () => {
    expect([2000, 2024, 2025, 2026, 2027].map(easterSunday)).toEqual(['2000-04-23', '2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28'])
    const h = nationalHolidays(2026)
    expect(h.get('2026-02-16')).toBe('Carnaval (segunda-feira)')
    expect(h.get('2026-02-17')).toBe('Carnaval (terça-feira)')
    expect(h.get('2026-04-03')).toBe('Sexta-feira da Paixão')
    expect(h.get('2026-06-04')).toBe('Corpus Christi')
    expect(h.size).toBe(13)
    // O 20 de novembro é feriado nacional a partir de 2024.
    expect(nationalHolidays(2023).has('2023-11-20')).toBe(false)
    expect(nationalHolidays(2024).has('2024-11-20')).toBe(true)
  })

  it('dias úteis: fim de semana e feriado não contam', () => {
    expect(isBusinessDay('2026-10-30')).toBe(true)
    expect(isBusinessDay('2026-10-31')).toBe(false)
    expect(isBusinessDay('2026-10-12')).toBe(false)
    // Entre a sexta 09/10 e a quarta 14/10: sábado, domingo, o feriado de 12/10 e a terça 13/10 (só esta é útil).
    expect(businessDaysBetween('2026-10-09', '2026-10-14')).toBe(1)
    expect(businessDaysBetween('2026-10-14', '2026-10-09')).toBe(0)
  })

  it('hoje no horário de Brasília', () => {
    // 02h em UTC de 30/10 ainda é 29/10 em Brasília (23h).
    expect(brazilToday(new Date('2026-10-30T02:00:00Z'))).toBe('2026-10-29')
    expect(brazilToday(new Date('2026-10-30T15:00:00Z'))).toBe('2026-10-30')
  })
})

describe('consultas ao SGS', () => {
  it('URL com dataInicial e dataFinal sempre preenchidas, no formato do SGS', () => {
    expect(sgsUrl('ipca', '2025-01-01', '2026-10-30')).toBe(
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2025&dataFinal=30/10/2026',
    )
    expect(sgsUrl('cdi', '2026-10-01', '2026-10-30', 'http://teste/sgs')).toBe('http://teste/sgs.12/dados?formato=json&dataInicial=01/10/2026&dataFinal=30/10/2026')
  })

  it('recusa janela de mais de 3 anos, janela invertida e data inválida', () => {
    expect(code(() => sgsUrl('cdi', '2023-10-31', '2026-10-30'))).toBe('sem erro')
    expect(code(() => sgsUrl('cdi', '2023-10-30', '2026-10-30'))).toBe('janela_grande')
    expect(code(() => sgsUrl('cdi', '2026-10-30', '2026-10-01'))).toBe('janela_invalida')
    expect(code(() => sgsUrl('cdi', '2026-02-30', '2026-10-01'))).toBe('data_invalida')
  })

  it('/ultimos/N só de 1 a 20', () => {
    expect(sgsLastUrl('ipca', 3)).toBe('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/3?formato=json')
    expect(code(() => sgsLastUrl('ipca', 20))).toBe('sem erro')
    expect(code(() => sgsLastUrl('ipca', 21))).toBe('ultimos_invalido')
    expect(code(() => sgsLastUrl('ipca', 0))).toBe('ultimos_invalido')
  })

  it('janelas de até 3 anos, da mais recente à mais antiga, cobrindo tudo sem sobrepor', () => {
    const windows = sgsWindows('2020-01-01', '2026-10-30')
    expect(windows).toEqual([
      { from: '2023-10-31', to: '2026-10-30' },
      { from: '2020-10-31', to: '2023-10-30' },
      { from: '2020-01-01', to: '2020-10-30' },
    ])
    for (const w of windows) expect(code(() => sgsUrl('cdi', w.from, w.to))).toBe('sem erro')
    // A mais antiga, se for curta, recua até ter 31 dias (nunca cai só em fim de semana e feriado).
    expect(sgsWindows('2026-10-30', '2026-10-30')).toEqual([{ from: '2026-09-30', to: '2026-10-30' }])
    expect(sgsWindows('2026-10-31', '2026-10-30')).toEqual([])
  })
})

describe('leitura das respostas do SGS', () => {
  it('lê as respostas gravadas: datas, valores e ordem', () => {
    const cdi = parseSgs(JSON.parse(CDI), 'cdi', '2026-10-30')
    expect(cdi).toHaveLength(42)
    expect(cdi[0]).toEqual({ date: '2026-09-01', value: 0.055131 })
    expect(cdi.some((r) => r.date === '2026-10-12')).toBe(false)
    const ipca = parseSgs(JSON.parse(IPCA), 'ipca', '2026-10-30')
    expect(ipca).toHaveLength(21)
    expect(ipca.at(-1)).toEqual({ date: '2026-09-01', value: 0.48 })
    expect(ipca.every((r) => r.date.endsWith('-01'))).toBe(true)
    expect(parseSgs(JSON.parse(DOLAR), 'dolar', '2026-10-30').at(-1)).toEqual({ date: '2026-10-30', value: 5.04 })
  })

  it('recusa o que não é lista, datas e valores inválidos, valor fora da faixa e data repetida com outro valor', () => {
    const one = (data: unknown, valor: unknown) => [{ data, valor }]
    expect(code(() => parseSgs(JSON.parse(ERRO_JSON), 'cdi', '2026-10-30'))).toBe('resposta_invalida')
    expect(code(() => parseSgs(one('31/02/2026', '0.05'), 'cdi', '2026-10-30'))).toBe('data_invalida')
    expect(code(() => parseSgs(one('2026-10-01', '0.05'), 'cdi', '2026-10-30'))).toBe('data_invalida')
    expect(code(() => parseSgs(one('01/10/2026', '0,05'), 'cdi', '2026-10-30'))).toBe('valor_invalido')
    expect(code(() => parseSgs(one('01/10/2026', ''), 'cdi', '2026-10-30'))).toBe('valor_invalido')
    // 5,5% ao dia não é CDI; IPCA de 15% no mês nem dólar a R$ 504 também não.
    expect(code(() => parseSgs(one('01/10/2026', '5.5'), 'cdi', '2026-10-30'))).toBe('valor_implausivel')
    expect(code(() => parseSgs(one('01/10/2026', '15'), 'ipca', '2026-10-30'))).toBe('valor_implausivel')
    expect(code(() => parseSgs(one('01/10/2026', '504'), 'dolar', '2026-10-30'))).toBe('valor_implausivel')
    expect(code(() => parseSgs(one('15/09/2026', '0.48'), 'ipca', '2026-10-30'))).toBe('data_invalida')
    expect(code(() => parseSgs(one('02/11/2026', '0.05'), 'cdi', '2026-10-30'))).toBe('data_futura')
    expect(code(() => parseSgs([...one('01/10/2026', '0.05'), ...one('01/10/2026', '0.06')], 'cdi', '2026-10-30'))).toBe('data_repetida')
    // A mesma data com o mesmo valor entra uma vez; valor numérico (e não texto) também é aceito.
    expect(parseSgs([...one('01/10/2026', '0.05'), ...one('01/10/2026', 0.05)], 'cdi', '2026-10-30')).toEqual([{ date: '2026-10-01', value: 0.05 }])
  })
})

describe('atraso das séries', () => {
  it('diárias: mais de 3 dias úteis completos sem dado novo (hoje não conta)', () => {
    expect(seriesLag('dolar', '2026-10-23', '2026-10-29')).toMatchObject({ stale: false, businessDays: 3 })
    expect(seriesLag('dolar', '2026-10-23', '2026-10-30')).toEqual({
      stale: true,
      businessDays: 4,
      message: 'Dólar de venda: o último dado é de 23/10/2026, há 4 dias úteis sem dado novo.',
    })
    // O feriado de 12/10 não conta: de sexta 09/10 à sexta 16/10, são 3 dias úteis.
    expect(seriesLag('cdi', '2026-10-09', '2026-10-16')).toMatchObject({ stale: false, businessDays: 3 })
    expect(seriesLag('cdi', null, '2026-10-30')).toEqual({ stale: true, businessDays: null, message: 'CDI: nenhum dado gravado ainda.' })
  })

  it('IPCA: o do mês é esperado até o dia 15 do mês seguinte; atraso depois de mais 3 dias úteis', () => {
    expect(seriesLag('ipca', '2026-09-01', '2026-10-30')).toMatchObject({ stale: false })
    expect(seriesLag('ipca', '2026-08-01', '2026-10-30')).toEqual({
      stale: true,
      businessDays: 10,
      message: 'IPCA: falta o de setembro de 2026, esperado até 15/10/2026; 10 dias úteis de atraso.',
    })
    // Terça 20/10: só 2 dias úteis depois do dia 15; o de setembro ainda não está atrasado.
    expect(seriesLag('ipca', '2026-08-01', '2026-10-20')).toMatchObject({ stale: false })
    // Quinta 22/10: 4 dias úteis depois do dia 15.
    expect(seriesLag('ipca', '2026-08-01', '2026-10-22')).toMatchObject({ stale: true, businessDays: 4 })
    // Virada do ano: o de dezembro é esperado até 15 de janeiro.
    expect(seriesLag('ipca', '2026-11-01', '2027-01-25')).toMatchObject({ stale: true, message: expect.stringContaining('dezembro de 2026, esperado até 15/01/2027') })
  })
})

/** Rede e gravação falsas: as respostas por série e o que foi gravado. */
function fakeDeps(responses: Partial<Record<string, FetchResult | Error>>, opts: { failRecord?: boolean } = {}) {
  const urls: string[] = []
  const recorded: RecordInput[] = []
  const deps: SyncDeps = {
    fetchText: async (url) => {
      urls.push(url)
      const sgs = /bcdata\.sgs\.(\d+)\//.exec(url)?.[1] ?? ''
      const r = responses[sgs] ?? { status: 200, text: '[]' }
      if (r instanceof Error) throw r
      return r
    },
    record: async (input) => {
      if (opts.failRecord) throw new Error('banco fora do ar')
      recorded.push(input)
      return { inserted: input.rows.length, updated: 0, lastDate: input.rows.at(-1)?.date ?? null }
    },
  }
  return { deps, urls, recorded }
}

describe('busca das séries', () => {
  it('do último dado gravado até hoje, com dataFinal, e grava o que veio', async () => {
    const { deps, urls, recorded } = fakeDeps({ '1': { status: 200, text: DOLAR } })
    const r = await syncSeries('dolar', '2026-10-20', '2026-10-30', deps)
    // A janela começa no último dado gravado e, curta, recua até ter 31 dias.
    expect(urls).toEqual(['https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados?formato=json&dataInicial=30/09/2026&dataFinal=30/10/2026'])
    expect(r).toMatchObject({ code: 'dolar', from: '2026-10-20', to: '2026-10-30', windows: 1, received: 21, inserted: 21, lastDate: '2026-10-30', error: null })
    expect(r.lag.stale).toBe(false)
    expect(recorded[0]).toMatchObject({ code: 'dolar', from: '2026-10-20', to: '2026-10-30', error: null })
  })

  it('série sem nenhum dado: busca desde 01/01/2024, numa janela de até 3 anos', async () => {
    const { deps, urls } = fakeDeps({ '433': { status: 200, text: IPCA } })
    const r = await syncSeries('ipca', null, '2026-10-30', deps)
    expect(urls).toEqual(['https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2024&dataFinal=30/10/2026'])
    expect(r).toMatchObject({ received: 21, lastDate: '2026-09-01', error: null, lag: { stale: false } })
  })

  it('erro do SGS: a série não grava nada, o erro fica registrado e a mensagem resume a resposta', async () => {
    const { deps, recorded } = fakeDeps({ '433': { status: 503, text: ERRO_HTML } })
    const r = await syncSeries('ipca', '2026-08-01', '2026-10-30', deps)
    expect(r.error).toBe('O SGS respondeu 503 para IPCA: Erro Serviço temporariamente indisponível Tente novamente mais tarde.')
    expect(recorded).toEqual([{ code: 'ipca', from: '2026-08-01', to: '2026-10-30', rows: [], error: r.error }])
    // Nada gravado (a gravação falsa não guarda o que já havia): sem último dado, o atraso aparece.
    expect(r).toMatchObject({ received: 0, lastDate: null, lag: { stale: true } })
  })

  it('tudo ou nada: se uma janela falha, nenhuma linha da série é gravada', async () => {
    let calls = 0
    const deps: SyncDeps = {
      fetchText: async () => (++calls === 2 ? { status: 500, text: 'falhou' } : { status: 200, text: CDI }),
      record: async (input) => ({ inserted: input.rows.length, updated: 0, lastDate: '2019-01-02' }),
    }
    const r = await syncSeries('cdi', '2019-01-02', '2026-10-30', deps)
    expect(r.windows).toBe(3)
    expect(r).toMatchObject({ received: 0, inserted: 0, error: 'O SGS respondeu 500 para CDI: falhou' })
    expect(calls).toBe(2)
  })

  it('rede fora do ar, resposta que não é JSON e falha ao gravar viram mensagens', async () => {
    const offline = fakeDeps({ '12': new Error('fetch failed') })
    expect((await syncSeries('cdi', '2026-10-20', '2026-10-30', offline.deps)).error).toBe('Não foi possível falar com o SGS (CDI): fetch failed')
    const html = fakeDeps({ '12': { status: 200, text: ERRO_HTML } })
    expect((await syncSeries('cdi', '2026-10-20', '2026-10-30', html.deps)).error).toMatch(/^O SGS devolveu algo que não é JSON \(CDI\): Erro Serviço/)
    const noDb = fakeDeps({ '12': { status: 200, text: CDI } }, { failRecord: true })
    const r = await syncSeries('cdi', '2026-10-20', '2026-10-30', noDb.deps)
    expect(r.error).toBe('Não foi possível gravar a busca: banco fora do ar')
    expect(r.lastDate).toBe('2026-10-20')
  })

  it('uma série com erro não para as outras; uma de cada vez, na ordem pedida', async () => {
    const { deps, urls } = fakeDeps({ '12': { status: 200, text: CDI }, '433': { status: 404, text: ERRO_JSON }, '1': { status: 200, text: DOLAR } })
    const results = await syncAll(['cdi', 'ipca', 'dolar'], { cdi: '2026-10-20', ipca: '2026-08-01', dolar: '2026-10-20' }, '2026-10-30', deps)
    expect(results.map((r) => [r.code, r.error === null])).toEqual([
      ['cdi', true],
      ['ipca', false],
      ['dolar', true],
    ])
    expect(urls.map((u) => /sgs\.(\d+)/.exec(u)?.[1])).toEqual(['12', '433', '1'])
  })
})
