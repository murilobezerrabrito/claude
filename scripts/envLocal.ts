// npm run env:local: grava .env.local (fora do git) com o endereço e a chave publicável do Supabase LOCAL, para o
// console (npm run dev). Recusa qualquer Supabase que não seja local. A chave secreta nunca entra aqui.

import { writeFileSync } from 'node:fs'
import { localStack } from './localSupabase.ts'

const local = localStack()
writeFileSync(new URL('../.env.local', import.meta.url), `VITE_SUPABASE_URL=${local.url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${local.publishable}\n`)
console.log('.env.local gravado com o Supabase local.')
