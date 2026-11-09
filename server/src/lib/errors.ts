/**
 * Erros de aplicação com status HTTP e código estável.
 * O error handler transforma qualquer AppError em resposta JSON padronizada:
 *   { "statusCode": 404, "code": "CONNECTION_NOT_FOUND", "message": "..." }
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown) =>
  new AppError(400, code, message, details)
export const unauthorized = (message = 'Sessão inválida ou expirada') => new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (message: string, code = 'FORBIDDEN') => new AppError(403, code, message)
export const notFound = (message: string, code = 'NOT_FOUND') => new AppError(404, code, message)
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message)

/** Erro vindo do Postgres externo (sintaxe, permissão, timeout…) — mostrado ao usuário. */
export class DatabaseQueryError extends AppError {
  constructor(message: string, pgCode?: string, position?: string) {
    super(422, 'QUERY_ERROR', message, { pgCode, position })
    this.name = 'DatabaseQueryError'
  }
}
