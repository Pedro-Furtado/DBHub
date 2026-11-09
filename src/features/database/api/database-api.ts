import { api } from '@/lib/api-client'
import { env } from '@/lib/env'
import { sleep } from '@/lib/utils'
import { generateRows, mockColumns, mockSavedQueries, mockTables } from '@/mocks/data'
import type {
  AlterColumnInput,
  AlterEnumInput,
  AlterTableInput,
  ColumnDefinition,
  ColumnInfo,
  CreateEnumInput,
  CreateTableInput,
  DdlResult,
  EnumType,
  QueryResult,
  Row,
  RowsPage,
  SavedQuery,
  TableInfo,
  TableStructure,
} from '@/types/database'

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'starts' | 'ends' | 'in' | 'is_null' | 'not_null'
export type RowFilter = { column: string; op: FilterOperator; value?: string }

export type RowsParams = {
  schema: string
  table: string
  page: number
  pageSize: number
  sort?: { column: string; direction: 'asc' | 'desc' }
  search?: string
  filters?: RowFilter[]
  match?: 'all' | 'any'
}

/** Query string compartilhada entre listar linhas e exportar CSV. */
export function rowsSearchParams(params: Omit<RowsParams, 'schema' | 'table'>) {
  const search = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) })
  if (params.search) search.set('search', params.search)
  if (params.sort) search.set('sort', `${params.sort.column}:${params.sort.direction}`)
  if (params.filters?.length) {
    search.set('filters', JSON.stringify(params.filters))
    if (params.match) search.set('match', params.match)
  }
  return search
}

const mock = {
  async tables(_connectionId: string): Promise<TableInfo[]> {
    await sleep(200)
    return mockTables
  },
  async rows(_connectionId: string, params: RowsParams): Promise<RowsPage> {
    await sleep(300)
    const table = mockTables.find((t) => t.schema === params.schema && t.name === params.table)
    const total = table?.rowEstimate ?? 0
    const offset = (params.page - 1) * params.pageSize
    let rows = generateRows(Math.max(0, Math.min(params.pageSize, total - offset)), offset)
    if (params.search) {
      const term = params.search.toLowerCase()
      rows = rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(term)))
    }
    return { columns: mockColumns, rows, total, page: params.page, pageSize: params.pageSize }
  },
  async query(_connectionId: string, sql: string): Promise<QueryResult> {
    await sleep(450)
    const command = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? 'SELECT'
    if (command !== 'SELECT' && command !== 'WITH') {
      return { command, columns: [], rows: [], rowCount: 3, durationMs: 18 }
    }
    const rows = generateRows(25)
    return {
      command: 'SELECT',
      columns: mockColumns.map((c) => ({ name: c.name, type: c.type })),
      rows,
      rowCount: rows.length,
      durationMs: 37,
    }
  },
  async savedQueries(_connectionId: string): Promise<SavedQuery[]> {
    await sleep(150)
    return mockSavedQueries
  },
  async deleteRows(_connectionId: string, _schema: string, _table: string, keys: Row[]) {
    await sleep(300)
    return { deleted: keys.length }
  },
  async insertRow(_connectionId: string, _schema: string, _table: string, values: Row, _hash?: string[]): Promise<Row> {
    await sleep(300)
    return values
  },
  async updateRow(_connectionId: string, _schema: string, _table: string, key: Row, changes: Row, _hash?: string[]): Promise<Row> {
    await sleep(300)
    return { ...key, ...changes }
  },
  async structure(_connectionId: string, _schema: string, _table: string): Promise<TableStructure> {
    await sleep(150)
    return { columns: mockColumns, comment: null }
  },
  async ddl(): Promise<DdlResult> {
    await sleep(200)
    return { sql: '-- prévia indisponível no modo exemplo', applied: true }
  },
  async schemas(_connectionId: string) {
    await sleep(100)
    return ['public', 'audit']
  },
  async columns(_connectionId: string, _schema: string, _table: string): Promise<ColumnInfo[]> {
    await sleep(100)
    return mockColumns
  },
  async previewCreateTable(_connectionId: string, input: CreateTableInput) {
    await sleep(100)
    return { sql: `-- prévia (modo exemplo)\ncreate table ${input.schema}.${input.name} (...);` }
  },
  async createTable(_connectionId: string, input: CreateTableInput) {
    await sleep(400)
    return { schema: input.schema, name: input.name, sql: '' }
  },
  async saveQuery(_connectionId: string, input: { id?: string; title: string; sql: string }): Promise<SavedQuery> {
    await sleep(250)
    return { id: input.id ?? crypto.randomUUID(), title: input.title, sql: input.sql, updatedAt: new Date().toISOString() }
  },
}

const tablePath = (id: string, schema: string, table: string) => `/c/${id}/tables/${schema}/${table}`
const flags = (opts: { dryRun?: boolean; cascade?: boolean }) => {
  const q = new URLSearchParams()
  if (opts.dryRun) q.set('dryRun', 'true')
  if (opts.cascade) q.set('cascade', 'true')
  const s = q.toString()
  return s ? `?${s}` : ''
}

const real = {
  /** URL de download (o navegador baixa usando o cookie de sessão) */
  exportUrl: (id: string, schema: string, table: string, params: Omit<RowsParams, 'schema' | 'table' | 'page' | 'pageSize'>, delimiter: ',' | ';') => {
    const search = rowsSearchParams({ ...params, page: 1, pageSize: 1 })
    search.delete('page')
    search.delete('pageSize')
    search.set('delimiter', delimiter)
    return `${env.apiUrl}${tablePath(id, schema, table)}/rows/export?${search}`
  },
  insertBulk: (id: string, schema: string, table: string, rows: Row[]) =>
    api.post<{ inserted: number }>(`${tablePath(id, schema, table)}/rows/bulk`, { rows }),
  enums: (id: string) => api.get<EnumType[]>(`/c/${id}/enums`),
  createEnum: (id: string, input: CreateEnumInput, opts: { dryRun?: boolean } = {}) =>
    api.post<DdlResult & { schema: string; name: string }>(`/c/${id}/enums${flags(opts)}`, input),
  alterEnum: (id: string, schema: string, name: string, change: AlterEnumInput, opts: { dryRun?: boolean } = {}) =>
    api.patch<DdlResult & { schema: string; name: string }>(`/c/${id}/enums/${encodeURIComponent(schema)}/${encodeURIComponent(name)}${flags(opts)}`, change),
  dropEnum: (id: string, schema: string, name: string, opts: { dryRun?: boolean; cascade?: boolean } = {}) =>
    api.delete<DdlResult>(`/c/${id}/enums/${encodeURIComponent(schema)}/${encodeURIComponent(name)}${flags(opts)}`),
  structure: (id: string, schema: string, table: string) => api.get<TableStructure>(`${tablePath(id, schema, table)}/structure`),
  addColumn: (id: string, schema: string, table: string, column: ColumnDefinition, opts: { dryRun?: boolean } = {}) =>
    api.post<DdlResult>(`${tablePath(id, schema, table)}/columns${flags(opts)}`, column),
  alterColumn: (id: string, schema: string, table: string, column: string, change: AlterColumnInput, opts: { dryRun?: boolean } = {}) =>
    api.patch<DdlResult>(`${tablePath(id, schema, table)}/columns/${encodeURIComponent(column)}${flags(opts)}`, change),
  dropColumn: (id: string, schema: string, table: string, column: string, opts: { dryRun?: boolean; cascade?: boolean } = {}) =>
    api.delete<DdlResult>(`${tablePath(id, schema, table)}/columns/${encodeURIComponent(column)}${flags(opts)}`),
  alterTable: (id: string, schema: string, table: string, change: AlterTableInput, opts: { dryRun?: boolean } = {}) =>
    api.patch<DdlResult & { schema: string; name: string }>(`${tablePath(id, schema, table)}${flags(opts)}`, change),
  dropTable: (id: string, schema: string, table: string, opts: { dryRun?: boolean; cascade?: boolean } = {}) =>
    api.delete<DdlResult>(`${tablePath(id, schema, table)}${flags(opts)}`),
  tables: (connectionId: string) => api.get<TableInfo[]>(`/c/${connectionId}/tables`),
  rows: (connectionId: string, { schema, table, ...params }: RowsParams) =>
    api.get<RowsPage>(`/c/${connectionId}/tables/${schema}/${table}/rows?${rowsSearchParams(params)}`),
  query: (connectionId: string, sql: string) => api.post<QueryResult>(`/c/${connectionId}/query`, { sql }),
  savedQueries: (connectionId: string) => api.get<SavedQuery[]>(`/c/${connectionId}/saved-queries`),
  deleteRows: (connectionId: string, schema: string, table: string, keys: Row[]) =>
    api.delete<{ deleted: number }>(`/c/${connectionId}/tables/${schema}/${table}/rows`, { keys }),
  /** `hash`: colunas que o server salva como hash bcrypt (ex.: senha) */
  insertRow: (connectionId: string, schema: string, table: string, values: Row, hash?: string[]) =>
    api.post<Row>(`/c/${connectionId}/tables/${schema}/${table}/rows`, { values, ...(hash?.length ? { hash } : {}) }),
  updateRow: (connectionId: string, schema: string, table: string, key: Row, changes: Row, hash?: string[]) =>
    api.patch<Row>(`/c/${connectionId}/tables/${schema}/${table}/rows`, { key, changes, ...(hash?.length ? { hash } : {}) }),
  schemas: (connectionId: string) => api.get<string[]>(`/c/${connectionId}/schemas`),
  columns: (connectionId: string, schema: string, table: string) =>
    api.get<ColumnInfo[]>(`/c/${connectionId}/tables/${schema}/${table}/columns`),
  previewCreateTable: (connectionId: string, input: CreateTableInput) =>
    api.post<{ sql: string }>(`/c/${connectionId}/tables/preview`, input),
  createTable: (connectionId: string, input: CreateTableInput) =>
    api.post<{ schema: string; name: string; sql: string }>(`/c/${connectionId}/tables`, input),
  saveQuery: (connectionId: string, { id, ...input }: { id?: string; title: string; sql: string }) =>
    id
      ? api.patch<SavedQuery>(`/c/${connectionId}/saved-queries/${id}`, input)
      : api.post<SavedQuery>(`/c/${connectionId}/saved-queries`, input),
}

const mockDatabase = {
  ...mock,
  addColumn: mock.ddl,
  alterColumn: mock.ddl,
  dropColumn: mock.ddl,
  alterTable: async (_id: string, schema: string, table: string) => ({ ...(await mock.ddl()), schema, name: table }),
  exportUrl: () => '#',
  insertBulk: async (_id: string, _s: string, _t: string, rows: Row[]) => ({ inserted: rows.length }),
  dropTable: mock.ddl,
  enums: async (): Promise<EnumType[]> => [{ schema: 'public', name: 'status_pedido', values: ['pendente', 'pago', 'enviado'], usedBy: [] }],
  createEnum: async (_id: string, input: CreateEnumInput) => ({ ...(await mock.ddl()), schema: input.schema, name: input.name }),
  alterEnum: async (_id: string, schema: string, name: string) => ({ ...(await mock.ddl()), schema, name }),
  dropEnum: mock.ddl,
}

export const databaseApi = (env.useMocks ? mockDatabase : real) as typeof real
