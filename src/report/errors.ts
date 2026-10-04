/** Erro na montagem das entradas do mês, com mensagem em português para quem precisa corrigir o dado. */
export class ReportInputError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ReportInputError'
    this.code = code
  }
}
