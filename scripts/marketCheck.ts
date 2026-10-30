// npm run market:check: testa a conexão com o SGS do Banco Central, sem banco: busca os 3 últimos registros de cada
// série pelo atalho /ultimos/3 (SPEC, "Referências": "Exemplo de chamada ao SGS: IPCA, últimos 3 meses") e confere a
// resposta com a mesma leitura da função do servidor. Termina com erro se alguma série falhar.

import { formatDate } from '../src/lib/format.ts'
import { brazilToday, parseSgs, SERIES, SERIES_CODES, sgsLastUrl, snippet } from '../src/market/index.ts'

async function main() {
  const today = brazilToday()
  let failed = false
  for (const code of SERIES_CODES) {
    const info = SERIES[code]
    const url = sgsLastUrl(code, 3)
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
      const text = await res.text()
      if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${snippet(text)}`)
      const rows = parseSgs(JSON.parse(text), code, today)
      console.log(`✔ ${info.name} (SGS ${info.sgs}): ${rows.map((r) => `${formatDate(r.date)} = ${r.value}`).join('; ')} (${info.unit})`)
    } catch (e) {
      failed = true
      const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : ''
      console.log(`✖ ${info.name} (SGS ${info.sgs}): ${e instanceof Error ? e.message : String(e)}${cause}`)
    }
  }
  if (failed) {
    console.log('A rede não alcançou o SGS: confira se api.bcb.gov.br está liberado no ambiente.')
    // O fetch do Node só passa pelo proxy do ambiente (HTTPS_PROXY) com NODE_USE_ENV_PROXY=1 (Node 22.21 ou mais novo).
    if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== '1') {
      console.log('Este ambiente usa proxy: rode de novo com NODE_USE_ENV_PROXY=1 npm run market:check.')
    }
    process.exitCode = 1
  }
}

void main()
