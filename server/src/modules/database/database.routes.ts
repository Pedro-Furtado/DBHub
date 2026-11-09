import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  bulkInsertBody,
  exportQuerystring,
  connectionScopeParams,
  deleteRowsBody,
  insertRowBody,
  queryBody,
  rowsQuerystring,
  tableParams,
  updateRowBody,
} from './database.schemas.ts'
import { toCsv } from './csv.ts'
import { databaseService } from './database.service.ts'
import {
  alterColumnBody,
  alterEnumBody,
  alterTableBody,
  columnDefinition,
  createEnumBody,
  createTableBody,
  dropQuery,
  dryRunQuery,
  enumParams,
} from './ddl.schemas.ts'
import { buildCreateTableSql } from './ddl.service.ts'

/** Rotas de um banco externo: /api/c/:id/... */
export const databaseRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/tables', { schema: { params: connectionScopeParams } }, (request) => databaseService.tables(request.params.id))

  /** ?schema=public,auth · sem o parâmetro = todos os schemas */
  app.get('/schema-graph', { schema: { params: connectionScopeParams, querystring: z.object({ schema: z.string().max(1000).optional() }) } }, ({ params, query }) =>
    databaseService.schemaGraph(params.id, query.schema ? query.schema.split(',').map((s) => s.trim()).filter(Boolean) : 'all'),
  )

  app.get('/schemas', { schema: { params: connectionScopeParams } }, (request) => databaseService.schemas(request.params.id))

  app.post('/tables', { schema: { params: connectionScopeParams, body: createTableBody } }, async ({ params, body }, reply) => {
    const created = await databaseService.createTable(params.id, body)
    return reply.status(201).send(created)
  })

  /** Só gera o SQL (para a prévia na UI) — não toca no banco. */
  app.post('/tables/preview', { schema: { params: connectionScopeParams, body: createTableBody } }, ({ body }) => ({
    sql: buildCreateTableSql(body),
  }))

  // ── Enums (tipos enumerados) ───────────────────────────────────────
  app.get('/enums', { schema: { params: connectionScopeParams } }, ({ params }) => databaseService.enums(params.id))

  app.post('/enums', { schema: { params: connectionScopeParams, body: createEnumBody, querystring: dryRunQuery } }, async ({ params, body, query }, reply) => {
    const result = await databaseService.createEnum(params.id, body, query.dryRun)
    return reply.status(result.applied ? 201 : 200).send(result)
  })

  app.patch('/enums/:schema/:name', { schema: { params: enumParams, body: alterEnumBody, querystring: dryRunQuery } }, ({ params, body, query }) =>
    databaseService.alterEnum(params.id, params.schema, params.name, body, query.dryRun),
  )

  app.delete('/enums/:schema/:name', { schema: { params: enumParams, querystring: dropQuery } }, ({ params, query }) =>
    databaseService.dropEnum(params.id, params.schema, params.name, query),
  )

  // ── Estrutura ──────────────────────────────────────────────────────
  const columnParams = tableParams.extend({ column: z.string().min(1).max(128) })

  app.get('/tables/:schema/:table/structure', { schema: { params: tableParams } }, ({ params }) =>
    databaseService.structure(params.id, params.schema, params.table),
  )

  app.get('/tables/:schema/:table/definition', { schema: { params: tableParams } }, ({ params }) =>
    databaseService.definition(params.id, params.schema, params.table),
  )

  app.patch('/tables/:schema/:table', { schema: { params: tableParams, body: alterTableBody, querystring: dryRunQuery } }, ({ params, body, query }) =>
    databaseService.alterTable(params.id, params.schema, params.table, body, query.dryRun),
  )

  app.delete('/tables/:schema/:table', { schema: { params: tableParams, querystring: dropQuery } }, ({ params, query }) =>
    databaseService.dropTable(params.id, params.schema, params.table, query),
  )

  app.post('/tables/:schema/:table/columns', { schema: { params: tableParams, body: columnDefinition, querystring: dryRunQuery } }, ({ params, body, query }) =>
    databaseService.addColumn(params.id, params.schema, params.table, body, query.dryRun),
  )

  app.patch(
    '/tables/:schema/:table/columns/:column',
    { schema: { params: columnParams, body: alterColumnBody, querystring: dryRunQuery } },
    ({ params, body, query }) => databaseService.alterColumn(params.id, params.schema, params.table, params.column, body, query.dryRun),
  )

  app.delete('/tables/:schema/:table/columns/:column', { schema: { params: columnParams, querystring: dropQuery } }, ({ params, query }) =>
    databaseService.dropColumn(params.id, params.schema, params.table, params.column, query),
  )

  app.get('/tables/:schema/:table/columns', { schema: { params: tableParams } }, ({ params }) =>
    databaseService.columns(params.id, params.schema, params.table),
  )

  app.get('/tables/:schema/:table/rows', { schema: { params: tableParams, querystring: rowsQuerystring } }, ({ params, query }) =>
    databaseService.rows(params.id, params.schema, params.table, query),
  )

  app.get('/tables/:schema/:table/rows/export', { schema: { params: tableParams, querystring: exportQuerystring } }, async ({ params, query }, reply) => {
    const { delimiter, ...filters } = query
    const { columns, rows, truncated } = await databaseService.export(params.id, params.schema, params.table, filters)
    const stamp = new Date().toISOString().slice(0, 10)
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${params.table}-${stamp}.csv"`)
      .header('x-export-truncated', String(truncated))
      .send(toCsv(columns.map((c) => c.name), rows, delimiter))
  })

  app.post(
    '/tables/:schema/:table/rows/bulk',
    { bodyLimit: 10 * 1024 * 1024, schema: { params: tableParams, body: bulkInsertBody } },
    async ({ params, body }) => ({ inserted: await databaseService.insertBulk(params.id, params.schema, params.table, body.rows, body.hash) }),
  )

  app.post('/tables/:schema/:table/rows', { schema: { params: tableParams, body: insertRowBody } }, async ({ params, body }, reply) => {
    const row = await databaseService.insert(params.id, params.schema, params.table, body.values, body.hash)
    return reply.status(201).send(row)
  })

  app.patch('/tables/:schema/:table/rows', { schema: { params: tableParams, body: updateRowBody } }, ({ params, body }) =>
    databaseService.update(params.id, params.schema, params.table, body.key, body.changes, body.hash),
  )

  app.delete('/tables/:schema/:table/rows', { schema: { params: tableParams, body: deleteRowsBody } }, async ({ params, body }) => ({
    deleted: await databaseService.remove(params.id, params.schema, params.table, body.keys),
  }))

  app.post(
    '/query',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { params: connectionScopeParams, body: queryBody } },
    ({ params, body }) => databaseService.query(params.id, body.sql),
  )

  app.get(
    '/history',
    { schema: { params: connectionScopeParams, querystring: z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }) } },
    ({ params, query }) => databaseService.history(params.id, query.limit),
  )
}
