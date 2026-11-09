import fp from 'fastify-plugin'

/**
 * Um log por requisição, no padrão:
 *   INFO  [http] GET /api/connections 200 - 12ms
 * O reqId já vem no logger da requisição (request.log).
 * Nível pelo status: 2xx/3xx → INFO, 4xx → WARN, 5xx → ERROR.
 */
export const requestLoggerPlugin = fp(async (app) => {
  app.addHook('onResponse', async (request, reply) => {
    if (request.routeOptions.config?.skipLog) return
    const status = reply.statusCode
    const durationMs = Math.round(reply.elapsedTime)
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
    // Nunca registrar a chave MCP quando ela vem na URL (/mcp/dbh_…)
    const path = request.url.split('?')[0]!.replace(/^\/mcp\/[^/]+/, '/mcp/***')

    request.log[level](
      {
        module: 'http',
        method: request.method,
        path,
        statusCode: status,
        durationMs,
        ip: request.ip,
        userId: request.user?.id,
      },
      `${request.method} ${path} ${status} - ${durationMs}ms`,
    )
  })
})

declare module 'fastify' {
  interface FastifyContextConfig {
    /** true = não gera log de acesso (ex.: healthcheck) */
    skipLog?: boolean
  }
}
