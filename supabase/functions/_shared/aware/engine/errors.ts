// Cópia gerada por `npm run sync:engine` a partir de src/. Não edite aqui: edite a fonte e rode o comando de novo.
/** Erro de entrada do motor, com mensagem em português para quem precisa corrigir o dado. */
export class EngineInputError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'EngineInputError'
    this.code = code
  }
}
