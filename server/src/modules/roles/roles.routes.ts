import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createLogger } from '../../lib/logger.ts'
import { assertWritable, withConnection } from '../database/database.service.ts'
import { createRoleBody, dropRoleQuery, grantsBody, roleParams, updateRoleBody } from './roles.schemas.ts'
import { createDbRole, dropDbRole, listDbRoles, listGrants, setGrants, updateDbRole } from './roles.service.ts'

const log = createLogger('db-roles')
const scope = z.object({ id: z.uuid() })
const dryRunQuery = z.object({ dryRun: z.stringbool().default(false) })

/** Usuários (roles) do Postgres externo e seus privilégios: /api/c/:id/db-roles */
export const dbRolesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { params: scope } }, async ({ params }) => (await withConnection(params.id, listDbRoles)).result)

  app.post('/', { schema: { params: scope, body: createRoleBody, querystring: dryRunQuery } }, async ({ params, body, query }, reply) => {
    if (!query.dryRun) await assertWritable(params.id)
    const { result } = await withConnection(params.id, (c) => createDbRole(c, body, query.dryRun))
    if (result.applied) log.warn({ connectionId: params.id, role: body.name, canLogin: body.canLogin }, 'Role criado')
    return reply.status(query.dryRun ? 200 : 201).send(result)
  })

  app.patch('/:role', { schema: { params: roleParams, body: updateRoleBody, querystring: dryRunQuery } }, async ({ params, body, query }) => {
    if (!query.dryRun) await assertWritable(params.id)
    const { result } = await withConnection(params.id, (c) => updateDbRole(c, params.role, body, query.dryRun))
    if (result.applied) log.warn({ connectionId: params.id, role: params.role, passwordChanged: body.password !== undefined }, 'Role alterado')
    return result
  })

  app.delete('/:role', { schema: { params: roleParams, querystring: dropRoleQuery.extend(dryRunQuery.shape) } }, async ({ params, query }) => {
    if (!query.dryRun) await assertWritable(params.id)
    const { result } = await withConnection(params.id, (c) => dropDbRole(c, params.role, query))
    if (result.applied) log.warn({ connectionId: params.id, role: params.role, reassign: query.reassign }, 'Role excluído')
    return result
  })

  app.get('/:role/grants', { schema: { params: roleParams } }, async ({ params }) => (await withConnection(params.id, (c) => listGrants(c, params.role))).result)

  app.put('/:role/grants', { schema: { params: roleParams, body: grantsBody, querystring: dryRunQuery } }, async ({ params, body, query }) => {
    if (!query.dryRun) await assertWritable(params.id)
    const { result } = await withConnection(params.id, (c) => setGrants(c, params.role, body.items, query.dryRun))
    if (result.applied) log.warn({ connectionId: params.id, role: params.role, tables: body.items.length }, 'Privilégios alterados')
    return result
  })
}
