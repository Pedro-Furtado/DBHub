import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { withConnection } from '../database/database.service.ts'
import { runAdvisors } from './advisors.service.ts'

/** GET /api/c/:id/advisors — checagens de segurança, integridade e performance (só leitura). */
export const advisorsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/advisors', { schema: { params: z.object({ id: z.uuid() }) } }, async ({ params }) => {
    const { result } = await withConnection(params.id, async (client) => {
      // savepoints exigem transação; tudo aqui é leitura
      await client.query('begin read only')
      try {
        return await runAdvisors(client)
      } finally {
        await client.query('rollback').catch(() => undefined)
      }
    })
    return result
  })
}
