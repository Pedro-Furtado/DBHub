import { badRequest } from '../../lib/errors.ts'

export type ConnectionUrlInfo = { host: string; port: number; database: string; user: string }

/** Valida a connection string e extrai os dados exibíveis (sem senha). */
export function parseConnectionUrl(value: string): ConnectionUrlInfo {
  const trimmed = value.trim()
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    throw badRequest('A URL precisa começar com postgresql:// ou postgres://', 'INVALID_CONNECTION_URL')
  }
  let url: URL
  try {
    url = new URL(trimmed.replace(/^postgres(ql)?:/i, 'http:'))
  } catch {
    throw badRequest('Connection string inválida', 'INVALID_CONNECTION_URL')
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!url.hostname || !database) {
    throw badRequest('A URL precisa ter host e nome do banco', 'INVALID_CONNECTION_URL')
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database,
    user: decodeURIComponent(url.username) || 'postgres',
  }
}
