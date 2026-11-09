import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z, ZodError } from 'zod'
import { AppError, forbidden } from '../../lib/errors.ts'
import { createLogger } from '../../lib/logger.ts'
import { runAdvisors } from '../advisors/advisors.service.ts'
import { connectionsService } from '../connections/connections.service.ts'
import { rowFilter } from '../database/database.schemas.ts'
import { databaseService, withConnection } from '../database/database.service.ts'
import { alterColumnBody, alterEnumBody, columnDefinition, createEnumBody, createTableBody } from '../database/ddl.schemas.ts'
import { buildCreateTableSql } from '../database/ddl.service.ts'
import { getSessionInfo, listTablesRls } from '../policies/policies.service.ts'
import type { McpKeyContext } from './mcp-keys.service.ts'

const log = createLogger('mcp')

const INSTRUCTIONS = `
DBHub é um painel que gerencia vários bancos PostgreSQL (ex.: bancos no Railway de clientes).
Fluxo recomendado:
1. list_connections — veja os bancos disponíveis para esta chave e pegue o connection_id.
2. list_tables / describe_table — entenda a estrutura antes de consultar ou alterar.
3. execute_sql — SQL livre (SELECT, e com chave de escrita também INSERT/UPDATE/DDL/RLS).
4. Ferramentas de estrutura (create_table, add_column, alter_column, drop_*, create_enum…) aceitam dry_run=true:
   use para mostrar o SQL ao usuário antes de executar alterações destrutivas.
Regras: conexões marcadas como somente leitura recusam qualquer escrita; chaves de leitura só consultam.
`.trim()

// ── Esquemas compartilhados ────────────────────────────────────────
const connectionId = z.uuid().describe('ID da conexão (veja list_connections)')
const schemaName = z.string().min(1).max(63).default('public').describe('Schema, padrão public')
const tableName = z.string().min(1).max(63).describe('Nome da tabela')
const dryRun = z.boolean().default(false).describe('true = só gera o SQL, sem executar')

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

const text = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

/** Converte erros em resposta de ferramenta (isError) — o agente vê a mensagem e pode corrigir. */
function toToolError(error: unknown): ToolResult {
  if (error instanceof ZodError) {
    const issues = error.issues.map((i) => `- ${i.path.join('.') || 'entrada'}: ${i.message}`).join('\n')
    return { isError: true, content: [{ type: 'text', text: `Entrada inválida:\n${issues}` }] }
  }
  if (error instanceof AppError) {
    const details = error.details ? `\n${JSON.stringify(error.details)}` : ''
    return { isError: true, content: [{ type: 'text', text: `[${error.code}] ${error.message}${details}` }] }
  }
  return { isError: true, content: [{ type: 'text', text: 'Erro interno ao executar a ferramenta' }] }
}

/**
 * Cria um servidor MCP para uma chave.
 * Ferramentas de escrita só são registradas para chaves "write";
 * o escopo de conexões é checado em toda chamada.
 */
export function buildMcpServer(key: McpKeyContext) {
  const server = new McpServer({ name: 'dbhub', version: '0.1.0' }, { instructions: INSTRUCTIONS })
  const canWrite = key.access === 'write'

  async function allow(id: string) {
    if (key.connectionIds && !key.connectionIds.includes(id)) {
      throw forbidden('Esta chave MCP não tem acesso a essa conexão', 'MCP_SCOPE')
    }
    return connectionsService.get(id)
  }

  /** Envolve a ferramenta: log padronizado + erros como resposta legível. */
  function handler<A>(tool: string, fn: (args: A) => Promise<unknown>) {
    return async (args: A): Promise<ToolResult> => {
      const startedAt = performance.now()
      const target = (args as { connection_id?: string }).connection_id
      try {
        const result = await fn(args)
        const durationMs = Math.round(performance.now() - startedAt)
        log.info({ tool, keyId: key.id, keyName: key.name, connectionId: target, durationMs }, `MCP ${tool}`)
        return text(result)
      } catch (error) {
        const durationMs = Math.round(performance.now() - startedAt)
        const level = error instanceof AppError || error instanceof ZodError ? 'warn' : 'error'
        log[level](
          { tool, keyId: key.id, keyName: key.name, connectionId: target, durationMs, ...(level === 'error' ? { err: error } : {}) },
          `MCP ${tool} falhou${error instanceof Error ? `: ${error.message}` : ''}`,
        )
        return toToolError(error)
      }
    }
  }

  const readOnlyHint = { readOnlyHint: true, openWorldHint: false }

  // ── Leitura ──────────────────────────────────────────────────────
  server.registerTool(
    'list_connections',
    {
      title: 'Listar conexões',
      description: 'Lista os bancos Postgres cadastrados no DBHub que esta chave pode acessar.',
      annotations: readOnlyHint,
    },
    handler('list_connections', async () => {
      const all = await connectionsService.list()
      return all
        .filter((c) => !key.connectionIds || key.connectionIds.includes(c.id))
        .map((c) => ({
          connection_id: c.id,
          name: c.name,
          environment: c.environment,
          read_only: c.readOnly,
          database: c.database,
          host: c.host,
          status: c.status,
          version: c.version,
        }))
    }),
  )

  server.registerTool(
    'list_tables',
    {
      title: 'Listar tabelas',
      description: 'Tabelas e views do banco, com schema, estimativa de linhas e tamanho.',
      inputSchema: { connection_id: connectionId },
      annotations: readOnlyHint,
    },
    handler('list_tables', async ({ connection_id }: { connection_id: string }) => {
      await allow(connection_id)
      return databaseService.tables(connection_id)
    }),
  )

  server.registerTool(
    'list_schemas',
    {
      title: 'Listar schemas',
      description: 'Schemas do banco (exceto os de sistema).',
      inputSchema: { connection_id: connectionId },
      annotations: readOnlyHint,
    },
    handler('list_schemas', async ({ connection_id }: { connection_id: string }) => {
      await allow(connection_id)
      return databaseService.schemas(connection_id)
    }),
  )

  server.registerTool(
    'describe_table',
    {
      title: 'Descrever tabela',
      description: 'Colunas (tipo, nulo, padrão, PK, FK, enum), descrição da tabela e políticas RLS.',
      inputSchema: { connection_id: connectionId, schema: schemaName, table: tableName },
      annotations: readOnlyHint,
    },
    handler('describe_table', async ({ connection_id, schema, table }: { connection_id: string; schema: string; table: string }) => {
      await allow(connection_id)
      const structure = await databaseService.structure(connection_id, schema, table)
      const { result: rls } = await withConnection(connection_id, (c) => listTablesRls(c, { schema, table }))
      return { schema, table, ...structure, rls: rls[0] ?? null }
    }),
  )

  server.registerTool(
    'list_enums',
    {
      title: 'Listar enums',
      description: 'Tipos enum do banco com seus valores e as colunas que os usam.',
      inputSchema: { connection_id: connectionId },
      annotations: readOnlyHint,
    },
    handler('list_enums', async ({ connection_id }: { connection_id: string }) => {
      await allow(connection_id)
      return databaseService.enums(connection_id)
    }),
  )

  server.registerTool(
    'get_rows',
    {
      title: 'Ler linhas',
      description: 'Lê linhas de uma tabela com paginação, filtros e ordenação (sem escrever SQL).',
      inputSchema: {
        connection_id: connectionId,
        schema: schemaName,
        table: tableName,
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(1).max(200).default(50),
        filters: rowFilter.array().max(20).optional().describe('Ex.: [{"column":"status","op":"eq","value":"ativo"}]'),
        match: z.enum(['all', 'any']).default('all').describe('all = E · any = OU'),
        sort: z.object({ column: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
        search: z.string().max(200).optional().describe('Busca em colunas de texto'),
      },
      annotations: readOnlyHint,
    },
    handler(
      'get_rows',
      async (a: {
        connection_id: string
        schema: string
        table: string
        page: number
        page_size: number
        filters?: z.infer<typeof rowFilter>[]
        match: 'all' | 'any'
        sort?: { column: string; direction: 'asc' | 'desc' }
        search?: string
      }) => {
        await allow(a.connection_id)
        const { columns: _c, ...page } = await databaseService.rows(a.connection_id, a.schema, a.table, {
          page: a.page,
          pageSize: a.page_size,
          filters: a.filters,
          match: a.match,
          sort: a.sort,
          search: a.search,
        })
        return page
      },
    ),
  )

  server.registerTool(
    'execute_sql',
    {
      title: 'Executar SQL',
      description: canWrite
        ? 'Executa SQL no banco (consultas, INSERT/UPDATE/DELETE, DDL, RLS). Respeita conexões somente leitura.'
        : 'Executa SQL somente leitura (SELECT, EXPLAIN…). Esta chave não permite alterações.',
      inputSchema: {
        connection_id: connectionId,
        sql: z.string().min(1).max(100_000),
        max_rows: z.number().int().min(1).max(1000).default(200).describe('Máximo de linhas devolvidas'),
      },
      annotations: canWrite ? { destructiveHint: true, openWorldHint: false } : readOnlyHint,
    },
    handler('execute_sql', async ({ connection_id, sql, max_rows }: { connection_id: string; sql: string; max_rows: number }) => {
      await allow(connection_id)
      const result = await databaseService.query(connection_id, sql, { readOnly: !canWrite, source: `mcp:${key.name}` })
      const truncated = result.truncated || result.rows.length > max_rows
      return { ...result, rows: result.rows.slice(0, max_rows), truncated }
    }),
  )

  server.registerTool(
    'list_policies',
    {
      title: 'Listar RLS e políticas',
      description: 'Status do RLS por tabela, políticas e com qual usuário o DBHub conecta (superuser ignora RLS).',
      inputSchema: { connection_id: connectionId },
      annotations: readOnlyHint,
    },
    handler('list_policies', async ({ connection_id }: { connection_id: string }) => {
      await allow(connection_id)
      const { result } = await withConnection(connection_id, async (c) => ({ session: await getSessionInfo(c), tables: await listTablesRls(c) }))
      return result
    }),
  )

  server.registerTool(
    'run_advisors',
    {
      title: 'Advisors',
      description: 'Checagens de segurança, integridade e performance do banco (só leitura).',
      inputSchema: { connection_id: connectionId },
      annotations: readOnlyHint,
    },
    handler('run_advisors', async ({ connection_id }: { connection_id: string }) => {
      await allow(connection_id)
      const { result } = await withConnection(connection_id, async (c) => {
        await c.query('begin read only')
        try {
          return await runAdvisors(c)
        } finally {
          await c.query('rollback').catch(() => undefined)
        }
      })
      return result
    }),
  )

  if (!canWrite) return server

  // ── Escrita (só chaves "write") ──────────────────────────────────
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }

  server.registerTool(
    'create_table',
    {
      title: 'Criar tabela',
      description:
        'Cria uma tabela. Tipos: text, varchar, uuid, int2/int4/int8, numeric, float4/float8, bool, date, time, timestamp, timestamptz, interval, json, jsonb, bytea ou um enum "schema.nome".',
      inputSchema: {
        connection_id: connectionId,
        schema: schemaName,
        name: tableName,
        comment: z.string().max(500).optional(),
        columns: columnDefinition.array().min(1).max(200),
        dry_run: dryRun,
      },
      annotations: write,
    },
    handler('create_table', async ({ connection_id, dry_run, ...input }: { connection_id: string; dry_run: boolean; schema: string; name: string; comment?: string; columns: unknown[] }) => {
      await allow(connection_id)
      const parsed = createTableBody.parse(input)
      if (dry_run) return { sql: buildCreateTableSql(parsed), applied: false }
      return { ...(await databaseService.createTable(connection_id, parsed)), applied: true }
    }),
  )

  server.registerTool(
    'add_column',
    {
      title: 'Adicionar coluna',
      description: 'Adiciona uma coluna a uma tabela existente.',
      inputSchema: { connection_id: connectionId, schema: schemaName, table: tableName, column: columnDefinition, dry_run: dryRun },
      annotations: write,
    },
    handler('add_column', async (a: { connection_id: string; schema: string; table: string; column: z.infer<typeof columnDefinition>; dry_run: boolean }) => {
      await allow(a.connection_id)
      return databaseService.addColumn(a.connection_id, a.schema, a.table, a.column, a.dry_run)
    }),
  )

  server.registerTool(
    'alter_column',
    {
      title: 'Alterar coluna',
      description: 'Renomeia, muda tipo (converte os dados com USING), nulo, padrão (null remove) ou único. Envie só o que muda.',
      inputSchema: { connection_id: connectionId, schema: schemaName, table: tableName, column: z.string().min(1).max(63), changes: alterColumnBody, dry_run: dryRun },
      annotations: destructive,
    },
    handler('alter_column', async (a: { connection_id: string; schema: string; table: string; column: string; changes: z.infer<typeof alterColumnBody>; dry_run: boolean }) => {
      await allow(a.connection_id)
      return databaseService.alterColumn(a.connection_id, a.schema, a.table, a.column, a.changes, a.dry_run)
    }),
  )

  server.registerTool(
    'drop_column',
    {
      title: 'Excluir coluna',
      description: 'Remove uma coluna (e seus dados). cascade remove também objetos que dependem dela.',
      inputSchema: { connection_id: connectionId, schema: schemaName, table: tableName, column: z.string().min(1).max(63), cascade: z.boolean().default(false), dry_run: dryRun },
      annotations: destructive,
    },
    handler('drop_column', async (a: { connection_id: string; schema: string; table: string; column: string; cascade: boolean; dry_run: boolean }) => {
      await allow(a.connection_id)
      return databaseService.dropColumn(a.connection_id, a.schema, a.table, a.column, { cascade: a.cascade, dryRun: a.dry_run })
    }),
  )

  server.registerTool(
    'drop_table',
    {
      title: 'Excluir tabela',
      description: 'Exclui uma tabela e todos os dados. cascade remove também FKs/views que dependem dela.',
      inputSchema: { connection_id: connectionId, schema: schemaName, table: tableName, cascade: z.boolean().default(false), dry_run: dryRun },
      annotations: destructive,
    },
    handler('drop_table', async (a: { connection_id: string; schema: string; table: string; cascade: boolean; dry_run: boolean }) => {
      await allow(a.connection_id)
      return databaseService.dropTable(a.connection_id, a.schema, a.table, { cascade: a.cascade, dryRun: a.dry_run })
    }),
  )

  server.registerTool(
    'create_enum',
    {
      title: 'Criar enum',
      description: 'Cria um tipo enum (lista fechada de valores) para usar em colunas como "schema.nome".',
      inputSchema: { connection_id: connectionId, schema: schemaName, name: z.string().min(1).max(63), values: z.string().min(1).array().min(1).max(500), dry_run: dryRun },
      annotations: write,
    },
    handler('create_enum', async ({ connection_id, dry_run, ...input }: { connection_id: string; dry_run: boolean; schema: string; name: string; values: string[] }) => {
      await allow(connection_id)
      return databaseService.createEnum(connection_id, createEnumBody.parse(input), dry_run)
    }),
  )

  server.registerTool(
    'alter_enum',
    {
      title: 'Alterar enum',
      description: 'Adiciona valores (no fim ou depois de "after"), renomeia valores ou o tipo. O Postgres não remove valores de enum.',
      inputSchema: { connection_id: connectionId, schema: schemaName, name: z.string().min(1).max(63), changes: alterEnumBody, dry_run: dryRun },
      annotations: write,
    },
    handler('alter_enum', async (a: { connection_id: string; schema: string; name: string; changes: z.infer<typeof alterEnumBody>; dry_run: boolean }) => {
      await allow(a.connection_id)
      return databaseService.alterEnum(a.connection_id, a.schema, a.name, a.changes, a.dry_run)
    }),
  )

  server.registerTool(
    'insert_rows',
    {
      title: 'Inserir linhas',
      description:
        'Insere até 1000 linhas numa transação (ou todas entram, ou nenhuma). Colunas omitidas usam o padrão. Use hash_columns para senhas: o valor é salvo como hash bcrypt.',
      inputSchema: {
        connection_id: connectionId,
        schema: schemaName,
        table: tableName,
        rows: z.record(z.string(), z.unknown()).array().min(1).max(1000),
        hash_columns: z.string().min(1).max(63).array().max(50).optional().describe('Colunas salvas como hash bcrypt, ex.: ["senha"]'),
      },
      annotations: write,
    },
    handler('insert_rows', async (a: { connection_id: string; schema: string; table: string; rows: Record<string, unknown>[]; hash_columns?: string[] }) => {
      await allow(a.connection_id)
      return { inserted: await databaseService.insertBulk(a.connection_id, a.schema, a.table, a.rows, a.hash_columns) }
    }),
  )

  server.registerTool(
    'update_rows',
    {
      title: 'Atualizar linha',
      description: 'Atualiza uma linha identificada pela chave primária (key). Use hash_columns para salvar senha como hash bcrypt.',
      inputSchema: {
        connection_id: connectionId,
        schema: schemaName,
        table: tableName,
        key: z.record(z.string(), z.unknown()).describe('Chave primária, ex.: {"id": 1}'),
        changes: z.record(z.string(), z.unknown()),
        hash_columns: z.string().min(1).max(63).array().max(50).optional(),
      },
      annotations: destructive,
    },
    handler('update_rows', async (a: { connection_id: string; schema: string; table: string; key: Record<string, unknown>; changes: Record<string, unknown>; hash_columns?: string[] }) => {
      await allow(a.connection_id)
      return databaseService.update(a.connection_id, a.schema, a.table, a.key, a.changes, a.hash_columns)
    }),
  )

  return server
}
