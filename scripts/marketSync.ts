// npm run market:sync [cdi] [ipca] [dolar]: busca as séries do Banco Central pela função do servidor `market-sync`, no
// Supabase LOCAL, como alguém da gestão (usuário fictício, com senha e segundo fator), e mostra o que entrou, o erro e
// o atraso de cada série. Precisa das funções servidas (npx supabase functions serve) e da rede liberada para o SGS.
// Termina com erro se alguma série falhar.

import { formatDate } from '../src/lib/format.ts'
import { SERIES, type SeriesSyncResult } from '../src/market/index.ts'
import { LocalApi, localStack } from './localSupabase.ts'

const USERS = { gestao: { email: 'mercado.gestao@exemplo.invalid', role: 'gestao' } } as const

async function main() {
  const series = process.argv.slice(2)
  const api = new LocalApi(localStack(), USERS, 'market:sync')
  const r = await api.fn<{ hoje: string; via: string; series: SeriesSyncResult[] }>('gestao', 'market-sync', series.length > 0 ? { series } : {})
  console.log(`▸ Séries do Banco Central (hoje: ${formatDate(r.hoje)})`)
  for (const s of r.series) {
    const what = s.error ? `✖ ${s.error}` : `${s.received} recebidos, ${s.inserted} novos, ${s.updated} atualizados`
    console.log(`  ${SERIES[s.code].name} (SGS ${SERIES[s.code].sgs}): ${what}`)
    console.log(`    ${s.lag.stale ? '⚠ ' : ''}${s.lag.message}`)
  }
  if (r.series.some((s) => s.error)) process.exitCode = 1
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
