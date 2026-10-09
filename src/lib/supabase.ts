// Cliente do Supabase no navegador: só a chave publicável (SPEC, "Segurança"). A sessão fica no sessionStorage, que
// some ao fechar a aba; o Supabase encerra a sessão em 30 minutos de qualquer jeito (D-042).

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** O console sabe onde está o Supabase (variáveis de .env.local). */
export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://127.0.0.1:54321', key ?? 'sem-chave', {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
