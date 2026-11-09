import { sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { db } from '../../db/client.ts'
import { poolManager } from '../database/pool-manager.ts'

/** Healthcheck para o Railway: GET /api/health */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/health', { logLevel: 'silent' }, async (_request, reply) => {
    try {
      await db.execute(sql`select 1`)
      return { status: 'ok', uptime: Math.round(process.uptime()), externalPools: poolManager.size }
    } catch {
      return reply.status(503).send({ status: 'error', message: 'Banco interno indisponível' })
    }
  })
}
