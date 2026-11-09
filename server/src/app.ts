import { randomUUID } from 'node:crypto'
import Fastify, { LogController } from 'fastify'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { logger } from './lib/logger.ts'
import { authRoutes } from './modules/auth/auth.routes.ts'
import { connectionsRoutes } from './modules/connections/connections.routes.ts'
import { databaseRoutes } from './modules/database/database.routes.ts'
import { healthRoutes } from './modules/health/health.routes.ts'
import { policiesRoutes } from './modules/policies/policies.routes.ts'
import { dbRolesRoutes } from './modules/roles/roles.routes.ts'
import { advisorsRoutes } from './modules/advisors/advisors.routes.ts'
import { mcpKeysRoutes } from './modules/mcp/mcp-keys.routes.ts'
import { mcpRoutes } from './modules/mcp/mcp.routes.ts'
import { savedQueriesRoutes } from './modules/saved-queries/saved-queries.routes.ts'
import { syncRoutes } from './modules/sync/sync.routes.ts'
import { authPlugin } from './plugins/auth.ts'
import { errorHandlerPlugin } from './plugins/error-handler.ts'
import { requestLoggerPlugin } from './plugins/request-logger.ts'
import { securityPlugin } from './plugins/security.ts'
import { staticPlugin } from './plugins/static.ts'

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    // Log de acesso próprio (plugins/request-logger.ts), mais enxuto que o padrão
    logController: new LogController({ disableRequestLogging: true }),
    // Usa o x-request-id do proxy (Railway) quando existir, para rastrear ponta a ponta
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  await app.register(errorHandlerPlugin)
  await app.register(securityPlugin)
  await app.register(requestLoggerPlugin)
  await app.register(authPlugin)

  await app.register(
    async (api) => {
      await api.register(healthRoutes)
      await api.register(authRoutes, { prefix: '/auth' })

      // Tudo abaixo exige sessão válida
      await api.register(async (protectedApi) => {
        protectedApi.addHook('onRequest', protectedApi.authenticate)
        await protectedApi.register(connectionsRoutes, { prefix: '/connections' })
        await protectedApi.register(databaseRoutes, { prefix: '/c/:id' })
        await protectedApi.register(policiesRoutes, { prefix: '/c/:id' })
        await protectedApi.register(dbRolesRoutes, { prefix: '/c/:id/db-roles' })
        await protectedApi.register(advisorsRoutes, { prefix: '/c/:id' })
        await protectedApi.register(savedQueriesRoutes, { prefix: '/c/:id/saved-queries' })
        await protectedApi.register(mcpKeysRoutes, { prefix: '/mcp' })
        await protectedApi.register(syncRoutes, { prefix: '/sync' })
      })
    },
    { prefix: '/api' },
  )

  // Servidor MCP para agentes de IA — autenticado por chave, não por sessão
  await app.register(mcpRoutes)

  await app.register(staticPlugin)

  return app
}
