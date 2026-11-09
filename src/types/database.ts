/** Tipos de domínio compartilhados entre features (espelham as respostas do server). */

export type Environment = 'production' | 'staging' | 'development'
export type ConnectionStatus = 'online' | 'offline' | 'unknown'

export type Connection = {
  id: string
  name: string
  environment: Environment
  /** Dados exibidos — a URL completa nunca volta do server. */
  host: string
  port: number
  database: string
  user: string
  readOnly: boolean
  status: ConnectionStatus
  version?: string | null
  sizeBytes?: number | null
  tableCount?: number | null
  lastUsedAt?: string | null
  createdAt: string
}

export type ConnectionInput = {
  name: string
  url: string
  environment: Environment
  readOnly: boolean
}

export type TableInfo = {
  schema: string
  name: string
  kind: 'table' | 'view'
  /** null quando o Postgres ainda não analisou a tabela */
  rowEstimate: number | null
  sizeBytes: number
}

export type ColumnInfo = {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
  isUnique?: boolean
  /** Coluna de senha: o banco salva sempre como hash bcrypt (trigger do DBHub) */
  isHashed?: boolean
  isIdentity?: boolean
  comment?: string | null
  foreignKey?: { table: string; column: string; constraint?: string }
  /** Coluna do tipo enum (ou array de enum): valores permitidos, na ordem */
  enum?: { schema: string; name: string; values: string[] }
}

export type EnumType = {
  schema: string
  name: string
  values: string[]
  /** Colunas que usam o enum ("schema.tabela.coluna") */
  usedBy: string[]
}

export type CreateEnumInput = { schema: string; name: string; values: string[] }

export type AlterEnumInput = Partial<{
  name: string
  addValues: { value: string; after?: string }[]
  renameValues: { from: string; to: string }[]
}>

export type Row = Record<string, unknown>

export type RowsPage = {
  columns: ColumnInfo[]
  rows: Row[]
  total: number
  /** true quando o total vem da estimativa do Postgres (tabelas muito grandes) */
  totalIsEstimate?: boolean
  page: number
  pageSize: number
}

export type QueryResult = {
  command: string
  columns: { name: string; type: string }[]
  rows: Row[]
  rowCount: number
  /** true quando o resultado passou do limite de linhas do server */
  truncated?: boolean
  durationMs: number
}

export type SavedQuery = {
  id: string
  title: string
  sql: string
  updatedAt: string
}

export type BuiltinColumnType =
  | 'text' | 'varchar' | 'uuid' | 'int2' | 'int4' | 'int8' | 'numeric' | 'float4' | 'float8'
  | 'bool' | 'date' | 'time' | 'timestamp' | 'timestamptz' | 'interval' | 'json' | 'jsonb' | 'bytea'

/** Tipo nativo da lista ou enum do usuário no formato "schema.nome". */
export type ColumnType = BuiltinColumnType | `${string}.${string}`

export type ColumnDefinition = {
  name: string
  type: ColumnType
  typeArgs?: string
  isArray: boolean
  defaultValue?: string
  isIdentity: boolean
  isPrimaryKey: boolean
  nullable: boolean
  unique: boolean
  references?: { schema: string; table: string; column: string; onDelete: 'no action' | 'cascade' | 'set null' | 'restrict' }
}

export type CreateTableInput = {
  schema: string
  name: string
  comment?: string
  columns: ColumnDefinition[]
}

export type PolicyCommand = 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'

export type Policy = {
  name: string
  command: PolicyCommand
  permissive: boolean
  roles: string[]
  using: string | null
  withCheck: string | null
}

export type PolicyInput = {
  name: string
  command: PolicyCommand
  permissive: boolean
  roles: string[]
  using?: string
  withCheck?: string
}

export type TableRls = {
  schema: string
  table: string
  rlsEnabled: boolean
  rlsForced: boolean
  policies: Policy[]
}

export type PoliciesOverview = {
  /** Usuário com que o DBHub conecta — superuser/bypass ignora RLS */
  session: { user: string; superuser: boolean; bypass: boolean }
  tables: TableRls[]
}

export type TableStructure = { columns: ColumnInfo[]; comment: string | null }

export type AlterColumnInput = Partial<{
  name: string
  type: ColumnType
  typeArgs: string
  isArray: boolean
  nullable: boolean
  defaultValue: string | null
  unique: boolean
  hashed: boolean
  hashExisting: boolean
}>

export type AlterTableInput = Partial<{ name: string; schema: string; comment: string | null }>

/** Resposta das alterações de estrutura: o SQL gerado e se foi executado (dryRun = prévia). */
export type DdlResult = { sql: string; applied: boolean }
