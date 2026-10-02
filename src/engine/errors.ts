/** Erro de entrada do motor, com mensagem em português para quem precisa corrigir o dado. */
export class EngineInputError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'EngineInputError'
    this.code = code
  }
}
