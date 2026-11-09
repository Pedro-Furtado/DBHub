import type pg from 'pg'
import { badRequest, forbidden } from '../../lib/errors.ts'
import type { RowFilter } from './database.schemas.ts'
import { type ColumnInfo, getColumns } from './introspection.service.ts'
import { ident, qualified } from './pg-utils.ts'

export type RowsQuery = {
  page: number
  pageSize: number
  search?: string
  sort?: { column: string; direction: 'asc' | 'desc' }
  filters?: RowFilter[]
  /** all = todos os filtros (E) · any = qualquer um (OU) */
  match?: 'all' | 'any'
}

const likeEscape = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Monta o WHERE dos filtros. Valores sempre como parâmetro; o Postgres converte para o tipo da coluna. */
function buildFilters(columns: ColumnInfo[], filters: RowFilter[], match: 'all' | 'any', params: unknown[]) {
  const known = new Set(columns.map((c) => c.name))
  const parts = filters.map((f) => {
    if (!known.has(f.column)) throw badRequest(`Coluna inexistente no filtro: ${f.column}`, 'UNKNOWN_COLUMNS')
    const col = ident(f.column)
    const push = (v: unknown) => {
      params.push(v)
      return `$${params.length}`
    }
    const value = f.value ?? ''
    switch (f.op) {
      case 'is_null':
        return `${col} is null`
      case 'not_null':
        return `${col} is not null`
      case 'contains':
        return `${col}::text ilike ${push(`%${likeEscape(value)}%`)}`
      case 'starts':
        return `${col}::text ilike ${push(`${likeEscape(value)}%`)}`
      case 'ends':
        return `${col}::text ilike ${push(`%${likeEscape(value)}`)}`
      case 'in':
        return `${col}::text = any(${push(value.split(',').map((v) => v.trim()))}::text[])`
      default: {
        const op = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[f.op]
        return `${col} ${op} ${push(value)}`
      }
    }
  })
  return parts.length ? `(${parts.join(match === 'any' ? ' or ' : ' and ')})` : ''
}

type Row = Record<string, unknown>

/** Acima disso usamos a estimativa do Postgres em vez de count(*) (que varre a tabela). */
const EXACT_COUNT_LIMIT = 100_000

/** WHERE + ORDER BY compartilhados entre listar e exportar. */
function rowsQueryParts(columns: ColumnInfo[], query: Omit<RowsQuery, 'page' | 'pageSize'>) {
  const params: unknown[] = []
  const conditions: string[] = []
  if (query.search) {
    params.push(`%${likeEscape(query.search)}%`)
    const p = `$${params.length}`
    conditions.push(`(${columns.map((c) => `${ident(c.name)}::text ilike ${p}`).join(' or ')})`)
  }
  if (query.filters?.length) conditions.push(buildFilters(columns, query.filters, query.match ?? 'all', params))
  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''

  const sortColumn = query.sort && columns.some((c) => c.name === query.sort!.column) ? query.sort : undefined
  const pk = columns.filter((c) => c.isPrimaryKey).map((c) => ident(c.name))
  const orderBy = sortColumn
    ? `order by ${ident(sortColumn.column)} ${sortColumn.direction === 'desc' ? 'desc' : 'asc'} nulls last`
    : pk.length
      ? `order by ${pk.join(', ')}`
      : ''
  return { params, where, orderBy }
}

export async function listRows(client: pg.PoolClient, schema: string, table: string, query: RowsQuery) {
  const columns = await getColumns(client, schema, table)
  const { params, where, orderBy } = rowsQueryParts(columns, query)
  const offset = (query.page - 1) * query.pageSize
  const { rows } = await client.query<Row>(
    `select * from ${qualified(schema, table)} ${where} ${orderBy} limit ${query.pageSize} offset ${offset}`,
    params,
  )

  const total = await countRows(client, schema, table, where, params)
  return { columns, rows, total: total.value, totalIsEstimate: total.estimate, page: query.page, pageSize: query.pageSize }
}

/** Limite de segurança da exportação (evita derrubar o server com tabelas gigantes). */
export const EXPORT_MAX_ROWS = 100_000

export async function exportRows(client: pg.PoolClient, schema: string, table: string, query: Omit<RowsQuery, 'page' | 'pageSize'>) {
  const columns = await getColumns(client, schema, table)
  const { params, where, orderBy } = rowsQueryParts(columns, query)
  const { rows } = await client.query<Row>(
    `select * from ${qualified(schema, table)} ${where} ${orderBy} limit ${EXPORT_MAX_ROWS + 1}`,
    params,
  )
  return { columns, rows: rows.slice(0, EXPORT_MAX_ROWS), truncated: rows.length > EXPORT_MAX_ROWS }
}

/**
 * Inserção em lote (importação de CSV): um INSERT com várias linhas numa transação.
 * Colunas ausentes numa linha usam DEFAULT.
 */
export async function insertRowsBulk(client: pg.PoolClient, schema: string, table: string, rows: Row[]) {
  const columns = await getColumns(client, schema, table)
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  assertColumns(columns, names)
  if (!names.length) throw badRequest('Nenhuma coluna para inserir', 'EMPTY_ROWS')

  const params: unknown[] = []
  const values = rows.map((row) =>
    `(${names
      .map((n) => {
        if (!(n in row)) return 'default'
        params.push(row[n])
        return `$${params.length}`
      })
      .join(', ')})`,
  )

  await client.query('BEGIN')
  try {
    const result = await client.query(
      `insert into ${qualified(schema, table)} (${names.map(ident).join(', ')}) values ${values.join(', ')}`,
      params,
    )
    await client.query('COMMIT')
    return result.rowCount ?? 0
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function countRows(client: pg.PoolClient, schema: string, table: string, where: string, params: unknown[]) {
  if (!where) {
    const { rows } = await client.query<{ estimate: string }>(
      `select greatest(c.reltuples, 0)::bigint as estimate
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relname = $2`,
      [schema, table],
    )
    const estimate = Number(rows[0]?.estimate ?? 0)
    if (estimate > EXACT_COUNT_LIMIT) return { value: estimate, estimate: true }
  }
  const { rows } = await client.query<{ total: string }>(
    `select count(*) as total from ${qualified(schema, table)} ${where}`,
    params,
  )
  return { value: Number(rows[0]?.total ?? 0), estimate: false }
}

// ── Escrita ─────────────────────────────────────────────────────────────

function assertColumns(columns: ColumnInfo[], names: string[]) {
  const known = new Set(columns.map((c) => c.name))
  const unknown = names.filter((n) => !known.has(n))
  if (unknown.length) throw badRequest(`Colunas inexistentes: ${unknown.join(', ')}`, 'UNKNOWN_COLUMNS')
}

function primaryKey(columns: ColumnInfo[]) {
  const pk = columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
  if (!pk.length) throw forbidden('Tabela sem chave primária: edição bloqueada para evitar alterar linhas erradas', 'NO_PRIMARY_KEY')
  return pk
}

function pkWhere(pk: string[], values: Row, startAt = 1) {
  const missing = pk.filter((k) => !(k in values))
  if (missing.length) throw badRequest(`Informe a chave primária: ${missing.join(', ')}`, 'MISSING_PRIMARY_KEY')
  return {
    sql: pk.map((k, i) => `${ident(k)} = $${startAt + i}`).join(' and '),
    params: pk.map((k) => values[k]),
  }
}

export async function insertRow(client: pg.PoolClient, schema: string, table: string, values: Row) {
  const columns = await getColumns(client, schema, table)
  const names = Object.keys(values)
  assertColumns(columns, names)
  const sql = names.length
    ? `insert into ${qualified(schema, table)} (${names.map(ident).join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')}) returning *`
    : `insert into ${qualified(schema, table)} default values returning *`
  const { rows } = await client.query<Row>(sql, names.map((n) => values[n]))
  return rows[0]
}

export async function updateRow(client: pg.PoolClient, schema: string, table: string, key: Row, changes: Row) {
  const columns = await getColumns(client, schema, table)
  const pk = primaryKey(columns)
  const names = Object.keys(changes)
  if (!names.length) throw badRequest('Nada para atualizar', 'EMPTY_CHANGES')
  assertColumns(columns, names)

  const set = names.map((n, i) => `${ident(n)} = $${i + 1}`).join(', ')
  const where = pkWhere(pk, key, names.length + 1)
  const { rows, rowCount } = await client.query<Row>(
    `update ${qualified(schema, table)} set ${set} where ${where.sql} returning *`,
    [...names.map((n) => changes[n]), ...where.params],
  )
  if (rowCount === 0) throw badRequest('Linha não encontrada (pode ter sido alterada ou removida)', 'ROW_NOT_FOUND')
  return rows[0]
}

export async function deleteRows(client: pg.PoolClient, schema: string, table: string, keys: Row[]) {
  const columns = await getColumns(client, schema, table)
  const pk = primaryKey(columns)
  if (!keys.length) return 0

  // Tudo numa transação: ou apaga todas as linhas selecionadas, ou nenhuma
  await client.query('BEGIN')
  try {
    let deleted = 0
    for (const key of keys) {
      const where = pkWhere(pk, key)
      const result = await client.query(`delete from ${qualified(schema, table)} where ${where.sql}`, where.params)
      deleted += result.rowCount ?? 0
    }
    await client.query('COMMIT')
    return deleted
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}
