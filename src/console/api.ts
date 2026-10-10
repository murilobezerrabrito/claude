// Chamadas às funções do banco (supabase/migrations). Os erros do banco já vêm em português; os de sessão viram uma
// mensagem para entrar de novo.

import { supabase } from '../lib/supabase.ts'

export class ApiError extends Error {
  readonly code?: string
  readonly hint?: string
  /** Status HTTP, nas chamadas às funções do servidor. */
  readonly status?: number
  constructor(message: string, code?: string, hint?: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.hint = hint
    this.status = status
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (error.hint === 'segundo_fator' || /jwt expired|invalid jwt/i.test(error.message)) {
      throw new ApiError('Sua sessão terminou ou perdeu o segundo fator. Entre de novo.', error.code, error.hint ?? undefined)
    }
    throw new ApiError(error.message, error.code, error.hint ?? undefined)
  }
  return data as T
}

/**
 * Chama uma função do servidor (supabase/functions) com o token de quem está no console. As recusas vêm em português,
 * no campo `erro`; falha de rede ou do servidor vira uma mensagem genérica.
 */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> })
  if (error) {
    const response = (error as { context?: unknown }).context
    if (response instanceof Response) {
      let message = `O servidor recusou o pedido (erro ${response.status}).`
      try {
        const parsed = (await response.json()) as { erro?: string }
        if (parsed.erro) message = parsed.erro
      } catch {
        // Resposta sem corpo em JSON: fica a mensagem com o status.
      }
      throw new ApiError(message, undefined, undefined, response.status)
    }
    throw new ApiError('Não foi possível falar com o servidor. Confira a conexão e tente de novo.')
  }
  return data as T
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Nome de arquivo seguro para o Storage: só letras sem acento, números, ponto, hífen e sublinhado. */
export function storageName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120)
}

/**
 * Guarda a planilha original na pasta privada `planilhas` (D-046): só a gestão envia; ninguém lê direto. Sem o arquivo
 * guardado, a importação não é confirmada.
 */
export async function archiveSheet(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from('planilhas').upload(path, file, { upsert: false, contentType: file.type || 'text/csv' })
  if (error) throw new ApiError(`Não foi possível guardar a planilha original: ${error.message}`)
}
