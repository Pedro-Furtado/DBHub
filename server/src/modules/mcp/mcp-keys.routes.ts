import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { mcpKeysService } from './mcp-keys.service.ts'

const createKeyBody = z.object({
  name: z.string().trim().min(1, 'Dê um nome para a chave').max(120),
  access: z.enum(['read', 'write']).default('read'),
  /** null/ausente = todas as conexões */
  connectionIds: z.uuid().array().min(1, 'Escolha pelo menos uma conexão').max(200).nullable().default(null),
})

/** Gerência das chaves MCP (exige sessão): /api/mcp/keys */
export const mcpKeysRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/keys', () => mcpKeysService.list())

  app.post('/keys', { schema: { body: createKeyBody } }, async ({ body }, reply) => {
    const created = await mcpKeysService.create(body)
    return reply.status(201).header('cache-control', 'no-store').send(created)
  })

  app.delete('/keys/:keyId', { schema: { params: z.object({ keyId: z.uuid() }) } }, async ({ params }, reply) => {
    await mcpKeysService.revoke(params.keyId)
    return reply.status(204).send()
  })
}
