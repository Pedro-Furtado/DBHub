import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createLogger } from '../../lib/logger.ts'
import { assertWritable, withConnection } from '../database/database.service.ts'
import { policyBody, policyParams, rlsBody, tableScopeParams } from './policies.schemas.ts'
import {
  buildCreatePolicySql,
  createPolicy,
  dropPolicy,
  getSessionInfo,
  listRoles,
  listTablesRls,
  replacePolicy,
  setRls,
} from './policies.service.ts'

const log = createLogger('policies')
const scope = z.object({ id: z.uuid() })

/** RLS e políticas de um banco externo: /api/c/:id/... */
export const policiesRoutes: FastifyPluginAsyncZod = async (app) => {
  /** Visão geral: tabelas + status do RLS + políticas + com que usuário o DBHub conecta */
  app.get('/policies', { schema: { params: scope } }, async ({ params }) => {
    const { result } = await withConnection(params.id, async (client) => ({
      session: await getSessionInfo(client),
      tables: await listTablesRls(client),
    }))
    return result
  })

  app.get('/roles', { schema: { params: scope } }, async ({ params }) => (await withConnection(params.id, listRoles)).result)

  app.patch('/tables/:schema/:table/rls', { schema: { params: tableScopeParams, body: rlsBody } }, async ({ params, body }) => {
    await assertWritable(params.id)
    const { result } = await withConnection(params.id, (c) => setRls(c, params.schema, params.table, body))
    log.warn({ connectionId: params.id, table: `${params.schema}.${params.table}`, ...body }, 'RLS alterado')
    return result
  })

  app.post('/tables/:schema/:table/policies/preview', { schema: { params: tableScopeParams, body: policyBody } }, ({ params, body }) => ({
    sql: buildCreatePolicySql(params.schema, params.table, body),
  }))

  app.post('/tables/:schema/:table/policies', { schema: { params: tableScopeParams, body: policyBody } }, async ({ params, body }, reply) => {
    await assertWritable(params.id)
    const { result } = await withConnection(params.id, (c) => createPolicy(c, params.schema, params.table, body))
    log.info({ connectionId: params.id, table: `${params.schema}.${params.table}`, policy: body.name, command: body.command }, 'Política criada')
    return reply.status(201).send(result)
  })

  app.put('/tables/:schema/:table/policies/:policy', { schema: { params: policyParams, body: policyBody } }, async ({ params, body }) => {
    await assertWritable(params.id)
    const { result } = await withConnection(params.id, (c) => replacePolicy(c, params.schema, params.table, params.policy, body))
    log.info({ connectionId: params.id, table: `${params.schema}.${params.table}`, policy: body.name }, 'Política atualizada')
    return result
  })

  app.delete('/tables/:schema/:table/policies/:policy', { schema: { params: policyParams } }, async ({ params }) => {
    await assertWritable(params.id)
    const { result } = await withConnection(params.id, (c) => dropPolicy(c, params.schema, params.table, params.policy))
    log.warn({ connectionId: params.id, table: `${params.schema}.${params.table}`, policy: params.policy }, 'Política removida')
    return result
  })
}
