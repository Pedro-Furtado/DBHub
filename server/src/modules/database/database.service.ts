import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { queryHistory } from '../../db/schema.ts'
import { badRequest, DatabaseQueryError, forbidden } from '../../lib/errors.ts'
import { createLogger } from '../../lib/logger.ts'
import { hashColumns } from '../../lib/password-hash.ts'
import { connectionsRepository } from '../connections/connections.repository.ts'
import { connectionsService } from '../connections/connections.service.ts'
import type pg from 'pg'
import { addColumn, alterColumn, alterTable, dropColumn, dropTable, getTableComment } from './alter.service.ts'
import type { AlterColumnInput, AlterEnumInput, AlterTableInput, ColumnDefinition, CreateEnumInput, CreateTableInput } from './ddl.schemas.ts'
import { createTable, listSchemas } from './ddl.service.ts'
import { alterEnum, createEnum, dropEnum, listEnums } from './enums.service.ts'
import { getColumns, listTables } from './introspection.service.ts'
import { getSchemaGraph } from './schema-graph.service.ts'
import { poolManager } from './pool-manager.ts'
import { tableDefinition } from './table-definition.service.ts'
import { assertReadOnlySafe, executeQuery } from './query.service.ts'
import { deleteRows, exportRows, insertRow, insertRowsBulk, listRows, type RowsQuery, updateRow } from './rows.service.ts'

const log = createLogger('database')
type Row = Record<string, unknown>

/** Pega a conexão salva, executa no pool externo e marca como usada. */
export async function withConnection<T>(connectionId: string, fn: Parameters<typeof poolManager.withClient<T>>[1]) {
  const connection = await connectionsService.get(connectionId)
  const result = await poolManager.withClient(connection, fn)
  void connectionsRepository.touch(connectionId).catch(() => undefined)
  return { result, connection }
}

export async function assertWritable(connectionId: string) {
  const connection = await connectionsService.get(connectionId)
  if (connection.readOnly) throw forbidden('Essa conexão é somente leitura', 'READ_ONLY')
}

/** Alterações de estrutura: dryRun só gera o SQL; execução exige conexão gravável e é logada. */
async function structureChange<T extends { sql: string; applied: boolean }>(
  connectionId: string,
  action: string,
  target: string,
  dryRun: boolean,
  fn: (client: pg.PoolClient) => Promise<T>,
) {
  if (!dryRun) await assertWritable(connectionId)
  const { result } = await withConnection(connectionId, fn)
  if (result.applied) {
    log.warn({ connectionId, table: target, action }, `Estrutura alterada: ${action}`)
    log.debug({ connectionId, sql: result.sql }, 'DDL executado')
  }
  return result
}

export const databaseService = {
  /** SQL que recria a tabela/view (botão "Copiar schema") */
  definition: async (connectionId: string, schema: string, table: string) =>
    (await withConnection(connectionId, (c) => tableDefinition(c, schema, table))).result,

  structure: async (connectionId: string, schema: string, table: string) =>
    (
      await withConnection(connectionId, async (c) => ({
        columns: await getColumns(c, schema, table),
        comment: await getTableComment(c, schema, table),
      }))
    ).result,

  addColumn: (id: string, schema: string, table: string, column: ColumnDefinition, dryRun: boolean) =>
    structureChange(id, 'add column', `${schema}.${table}`, dryRun, (c) => addColumn(c, schema, table, column, dryRun)),

  alterColumn: (id: string, schema: string, table: string, column: string, change: AlterColumnInput, dryRun: boolean) =>
    structureChange(id, 'alter column', `${schema}.${table}`, dryRun, (c) => alterColumn(c, schema, table, column, change, dryRun)),

  dropColumn: (id: string, schema: string, table: string, column: string, opts: { cascade: boolean; dryRun: boolean }) =>
    structureChange(id, 'drop column', `${schema}.${table}`, opts.dryRun, (c) => dropColumn(c, schema, table, column, opts)),

  alterTable: (id: string, schema: string, table: string, change: AlterTableInput, dryRun: boolean) =>
    structureChange(id, 'alter table', `${schema}.${table}`, dryRun, (c) => alterTable(c, schema, table, change, dryRun)),

  dropTable: (id: string, schema: string, table: string, opts: { cascade: boolean; dryRun: boolean }) =>
    structureChange(id, 'drop table', `${schema}.${table}`, opts.dryRun, (c) => dropTable(c, schema, table, opts)),

  tables: async (connectionId: string) => (await withConnection(connectionId, listTables)).result,

  enums: async (connectionId: string) => (await withConnection(connectionId, listEnums)).result,

  createEnum: (id: string, input: CreateEnumInput, dryRun: boolean) =>
    structureChange(id, 'create enum', `${input.schema}.${input.name}`, dryRun, (c) => createEnum(c, input, dryRun)),

  alterEnum: (id: string, schema: string, name: string, change: AlterEnumInput, dryRun: boolean) =>
    structureChange(id, 'alter enum', `${schema}.${name}`, dryRun, (c) => alterEnum(c, schema, name, change, dryRun)),

  dropEnum: (id: string, schema: string, name: string, opts: { cascade: boolean; dryRun: boolean }) =>
    structureChange(id, 'drop enum', `${schema}.${name}`, opts.dryRun, (c) => dropEnum(c, schema, name, opts)),

  schemaGraph: async (connectionId: string, schemas: string[] | 'all') =>
    (await withConnection(connectionId, (c) => getSchemaGraph(c, schemas))).result,

  schemas: async (connectionId: string) => (await withConnection(connectionId, listSchemas)).result,

  async createTable(connectionId: string, input: CreateTableInput) {
    await assertWritable(connectionId)
    const { result } = await withConnection(connectionId, (c) => createTable(c, input))
    log.info({ connectionId, table: `${input.schema}.${input.name}`, columns: input.columns.length }, 'Tabela criada')
    log.debug({ connectionId, sql: result.sql }, 'DDL executado')
    return result
  },

  columns: async (connectionId: string, schema: string, table: string) =>
    (await withConnection(connectionId, (c) => getColumns(c, schema, table))).result,

  rows: async (connectionId: string, schema: string, table: string, query: RowsQuery) =>
    (await withConnection(connectionId, (c) => listRows(c, schema, table, query))).result,

  async insert(connectionId: string, schema: string, table: string, values: Row, hash?: string[]) {
    await assertWritable(connectionId)
    const hashed = await hashColumns(values, hash)
    const { result } = await withConnection(connectionId, (c) => insertRow(c, schema, table, hashed))
    log.info({ connectionId, table: `${schema}.${table}`, hashed: hash?.length ? hash : undefined }, 'Linha inserida')
    return result
  },

  async update(connectionId: string, schema: string, table: string, key: Row, changes: Row, hash?: string[]) {
    await assertWritable(connectionId)
    const hashed = await hashColumns(changes, hash)
    const { result } = await withConnection(connectionId, (c) => updateRow(c, schema, table, key, hashed))
    log.info({ connectionId, table: `${schema}.${table}`, columns: Object.keys(changes), hashed: hash?.length ? hash : undefined }, 'Linha atualizada')
    return result
  },

  export: async (connectionId: string, schema: string, table: string, query: Omit<RowsQuery, 'page' | 'pageSize'>) => {
    const { result } = await withConnection(connectionId, (c) => exportRows(c, schema, table, query))
    log.info({ connectionId, table: `${schema}.${table}`, rows: result.rows.length, truncated: result.truncated }, 'Exportação CSV')
    return result
  },

  async insertBulk(connectionId: string, schema: string, table: string, rows: Row[], hash?: string[]) {
    await assertWritable(connectionId)
    if (hash?.length) {
      // bcrypt é lento de propósito (~70ms por senha): limita o lote para não travar o server
      if (rows.length > 200) throw badRequest('Com hash de senha, envie no máximo 200 linhas por vez', 'HASH_BATCH_TOO_LARGE')
      const hashed: Row[] = []
      for (const row of rows) hashed.push(await hashColumns(row, hash))
      rows = hashed
    }
    const { result } = await withConnection(connectionId, (c) => insertRowsBulk(c, schema, table, rows))
    log.info({ connectionId, table: `${schema}.${table}`, inserted: result }, 'Importação em lote')
    return result
  },

  async remove(connectionId: string, schema: string, table: string, keys: Row[]) {
    await assertWritable(connectionId)
    const { result } = await withConnection(connectionId, (c) => deleteRows(c, schema, table, keys))
    log.warn({ connectionId, table: `${schema}.${table}`, deleted: result }, 'Linhas excluídas')
    return result
  },

  /** Executa SQL livre, registra no histórico e loga (o SQL completo só em nível DEBUG). */
  /**
   * Executa SQL livre. `readOnly` força somente leitura mesmo numa conexão gravável
   * (usado pelas chaves MCP de leitura): roda em BEGIN READ ONLY e desfaz no fim.
   */
  async query(connectionId: string, sql: string, opts: { readOnly?: boolean; source?: string } = {}) {
    const connection = await connectionsService.get(connectionId)
    const forceReadOnly = Boolean(opts.readOnly) && !connection.readOnly
    if (connection.readOnly || opts.readOnly) assertReadOnlySafe(sql)

    const startedAt = performance.now()
    try {
      const { result } = await withConnection(connectionId, async (c) => {
        if (!forceReadOnly) return executeQuery(c, sql)
        await c.query('BEGIN READ ONLY')
        try {
          return await executeQuery(c, sql)
        } finally {
          await c.query('ROLLBACK').catch(() => undefined)
        }
      })
      void db
        .insert(queryHistory)
        .values({ connectionId, sql, command: result.command, durationMs: result.durationMs, rowCount: result.rowCount })
        .catch((err) => log.error({ err }, 'Falha ao gravar histórico de query'))

      const level = result.durationMs > 5_000 ? 'warn' : 'info'
      log[level](
        { connectionId, command: result.command, rowCount: result.rowCount, durationMs: result.durationMs, source: opts.source },
        result.durationMs > 5_000 ? 'Query lenta executada' : 'Query executada',
      )
      log.debug({ connectionId, sql }, 'SQL executado')
      return result
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt)
      if (error instanceof DatabaseQueryError) {
        void db
          .insert(queryHistory)
          .values({ connectionId, sql, durationMs, error: error.message })
          .catch(() => undefined)
        log.warn({ connectionId, durationMs, pgCode: (error.details as { pgCode?: string })?.pgCode }, `Query falhou: ${error.message}`)
      }
      throw error
    }
  },

  history: (connectionId: string, limit = 50) =>
    db
      .select()
      .from(queryHistory)
      .where(eq(queryHistory.connectionId, connectionId))
      .orderBy(desc(queryHistory.executedAt))
      .limit(limit),
}
