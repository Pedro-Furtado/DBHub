import { and, desc, eq } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { db } from '../../db/client.ts'
import { savedQueries } from '../../db/schema.ts'
import { notFound } from '../../lib/errors.ts'
import { connectionsService } from '../connections/connections.service.ts'

const params = z.object({ id: z.uuid() })
const itemParams = params.extend({ queryId: z.uuid() })
const body = z.object({ title: z.string().trim().min(1).max(160), sql: z.string().min(1).max(100_000) })

/** Queries salvas por conexão: /api/c/:id/saved-queries */
export const savedQueriesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { params } }, ({ params }) =>
    db.select().from(savedQueries).where(eq(savedQueries.connectionId, params.id)).orderBy(desc(savedQueries.updatedAt)),
  )

  app.post('/', { schema: { params, body } }, async ({ params, body }, reply) => {
    await connectionsService.get(params.id)
    const [row] = await db.insert(savedQueries).values({ ...body, connectionId: params.id }).returning()
    return reply.status(201).send(row)
  })

  app.patch('/:queryId', { schema: { params: itemParams, body: body.partial() } }, async ({ params, body }) => {
    const [row] = await db
      .update(savedQueries)
      .set(body)
      .where(and(eq(savedQueries.id, params.queryId), eq(savedQueries.connectionId, params.id)))
      .returning()
    if (!row) throw notFound('Query salva não encontrada')
    return row
  })

  app.delete('/:queryId', { schema: { params: itemParams } }, async ({ params }, reply) => {
    const [row] = await db
      .delete(savedQueries)
      .where(and(eq(savedQueries.id, params.queryId), eq(savedQueries.connectionId, params.id)))
      .returning({ id: savedQueries.id })
    if (!row) throw notFound('Query salva não encontrada')
    return reply.status(204).send()
  })
}
