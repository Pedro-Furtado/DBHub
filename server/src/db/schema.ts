import { relations } from 'drizzle-orm'
import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid, bigint, varchar } from 'drizzle-orm/pg-core'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const environmentEnum = pgEnum('environment', ['production', 'staging', 'development'])
export const connectionStatusEnum = pgEnum('connection_status', ['online', 'offline', 'unknown'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  ...timestamps,
})

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 do token — o token em si só existe no cookie do usuário. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    userAgent: text('user_agent'),
    ip: varchar('ip', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  environment: environmentEnum('environment').notNull().default('development'),
  /** Connection string criptografada (AES-256-GCM). Nunca sai do server. */
  urlEncrypted: text('url_encrypted').notNull(),
  // Dados não sensíveis, extraídos da URL para exibição
  host: varchar('host', { length: 255 }).notNull(),
  port: integer('port').notNull(),
  database: varchar('database', { length: 255 }).notNull(),
  user: varchar('user', { length: 255 }).notNull(),
  readOnly: boolean('read_only').notNull().default(false),
  // Última verificação
  status: connectionStatusEnum('status').notNull().default('unknown'),
  version: varchar('version', { length: 120 }),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  tableCount: integer('table_count'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  ...timestamps,
})

export const savedQueries = pgTable(
  'saved_queries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    sql: text('sql').notNull(),
    ...timestamps,
  },
  (t) => [index('saved_queries_connection_idx').on(t.connectionId)],
)

export const queryHistory = pgTable(
  'query_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    sql: text('sql').notNull(),
    command: varchar('command', { length: 32 }),
    durationMs: integer('duration_ms').notNull(),
    rowCount: integer('row_count'),
    error: text('error'),
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('query_history_connection_idx').on(t.connectionId, t.executedAt)],
)

export const mcpAccessEnum = pgEnum('mcp_access', ['read', 'write'])

/**
 * Chaves de acesso ao servidor MCP (/mcp) — para agentes de IA usarem o DBHub.
 * A chave em si só aparece uma vez na criação; aqui fica só o SHA-256.
 */
export const mcpKeys = pgTable('mcp_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  /** Começo da chave (ex.: dbh_a1b2c3) para reconhecer na lista */
  prefix: varchar('prefix', { length: 16 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull().unique(),
  /** read = só consultas · write = também altera dados e estrutura */
  access: mcpAccessEnum('access').notNull().default('read'),
  /** null = todas as conexões; senão, só as listadas */
  connectionIds: uuid('connection_ids').array(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const connectionsRelations = relations(connections, ({ many }) => ({
  savedQueries: many(savedQueries),
  history: many(queryHistory),
}))
