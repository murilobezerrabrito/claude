// Chamadas do app às funções do banco (só a chave publicável no navegador; o banco confere o cliente pelo token).

import { supabase } from '../lib/supabase.ts'

export class AppApiError extends Error {
  readonly hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'AppApiError'
    this.hint = hint
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (error.hint === 'segundo_fator' || /jwt expired|invalid jwt/i.test(error.message)) {
      throw new AppApiError('Sua sessão terminou. Entre de novo para continuar.', error.hint ?? undefined)
    }
    throw new AppApiError(error.message, error.hint ?? undefined)
  }
  return data as T
}
