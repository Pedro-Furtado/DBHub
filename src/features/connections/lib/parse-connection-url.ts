export type ParsedConnectionUrl = {
  host: string
  port: number
  database: string
  user: string
  ssl: boolean
}

/**
 * Lê uma connection string do Postgres só para mostrar uma prévia no formulário.
 * A validação real (e a conexão) acontecem no server.
 */
export function parseConnectionUrl(value: string): ParsedConnectionUrl | null {
  const trimmed = value.trim()
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) return null
  try {
    const url = new URL(trimmed.replace(/^postgres(ql)?:/i, 'http:'))
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!url.hostname || !database) return null
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      database,
      user: decodeURIComponent(url.username) || 'postgres',
      ssl: ['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') ?? ''),
    }
  } catch {
    return null
  }
}
