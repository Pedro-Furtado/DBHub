import type pg from 'pg'
import { badRequest, notFound } from '../../lib/errors.ts'
import type { AlterColumnInput, AlterTableInput, ColumnDefinition } from './ddl.schemas.ts'
import { columnSql, columnType } from './ddl.service.ts'
import { getColumns } from './introspection.service.ts'
import { buildDisableHashSql, buildEnableHashSql } from './password-column.service.ts'
import { ident, qualified } from './pg-utils.ts'

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`

/**
 * Toda alteração de estrutura passa por aqui:
 * 1. monta a lista de comandos SQL;
 * 2. com dryRun devolve só o SQL (prévia na UI);
 * 3. sem dryRun executa tudo numa transação — ou aplica tudo, ou nada.
 */
async function apply(client: pg.PoolClient, statements: string[], dryRun: boolean) {
  const sql = statements.join('\n')
  if (dryRun || statements.length === 0) return { sql, applied: false }
  await client.query('BEGIN')
  try {
    for (const statement of statements) await client.query(statement)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
  return { sql, applied: true }
}

async function findColumn(client: pg.PoolClient, schema: string, table: string, column: string) {
  const columns = await getColumns(client, schema, table)
  const found = columns.find((c) => c.name === column)
  if (!found) throw notFound(`Coluna ${column} não encontrada em ${schema}.${table}`, 'COLUMN_NOT_FOUND')
  return { found, columns }
}

async function uniqueConstraintName(client: pg.PoolClient, schema: string, table: string, column: string) {
  const { rows } = await client.query<{ name: string }>(
    `select con.conname as name
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attname = $3
      where n.nspname = $1 and c.relname = $2 and con.contype = 'u' and con.conkey = array[a.attnum]::int2[]
      limit 1`,
    [schema, table, column],
  )
  return rows[0]?.name
}

export async function addColumn(client: pg.PoolClient, schema: string, table: string, column: ColumnDefinition, dryRun: boolean) {
  const columns = await getColumns(client, schema, table)
  if (columns.some((c) => c.name === column.name)) throw badRequest(`Já existe a coluna ${column.name}`, 'COLUMN_EXISTS')
  if (column.isPrimaryKey && columns.some((c) => c.isPrimaryKey)) {
    throw badRequest('A tabela já tem chave primária', 'PRIMARY_KEY_EXISTS')
  }
  return apply(client, [`alter table ${qualified(schema, table)} add column ${columnSql(column, true)};`], dryRun)
}

export async function alterColumn(client: pg.PoolClient, schema: string, table: string, column: string, change: AlterColumnInput, dryRun: boolean) {
  const { found, columns } = await findColumn(client, schema, table, column)
  const target = qualified(schema, table)
  const col = ident(column)
  const statements: string[] = []

  if (change.type) {
    const type = columnType({ type: change.type, typeArgs: change.typeArgs, isArray: change.isArray ?? false })
    // USING converte os dados existentes; se algum valor não converter, o Postgres recusa e nada muda
    statements.push(`alter table ${target} alter column ${col} type ${type} using ${col}::${type};`)
  }
  if (change.nullable !== undefined && change.nullable !== found.nullable) {
    if (found.isPrimaryKey && change.nullable) throw badRequest('Coluna da chave primária não pode aceitar nulo', 'PK_NOT_NULL')
    statements.push(`alter table ${target} alter column ${col} ${change.nullable ? 'drop' : 'set'} not null;`)
  }
  if (change.defaultValue !== undefined) {
    if (found.isIdentity) throw badRequest('Coluna auto incremento não aceita valor padrão', 'IDENTITY_DEFAULT')
    statements.push(
      change.defaultValue === null || change.defaultValue === ''
        ? `alter table ${target} alter column ${col} drop default;`
        : `alter table ${target} alter column ${col} set default ${change.defaultValue};`,
    )
  }
  if (change.unique !== undefined && change.unique !== Boolean(found.isUnique)) {
    if (change.unique) {
      statements.push(`alter table ${target} add constraint ${ident(`${table}_${column}_key`.slice(0, 63))} unique (${col});`)
    } else {
      const name = await uniqueConstraintName(client, schema, table, column)
      if (name) statements.push(`alter table ${target} drop constraint ${ident(name)};`)
    }
  }
  const wantsHash = change.hashed ?? Boolean(found.isHashed)
  if (wantsHash) {
    const finalType = change.type ?? found.type
    if (!/^(text|character varying|varchar|character|char|bpchar|citext)\b/.test(finalType) || change.isArray) {
      throw badRequest('Só colunas de texto (text/varchar) podem guardar hash de senha', 'HASH_NOT_TEXT')
    }
  }
  if (change.hashed === false && found.isHashed) statements.push(...buildDisableHashSql(schema, table, column))

  // Renomear por último: os comandos acima usam o nome atual
  const finalName = change.name && change.name !== column ? change.name : column
  if (finalName !== column) {
    if (columns.some((c) => c.name === change.name)) throw badRequest(`Já existe a coluna ${change.name}`, 'COLUMN_EXISTS')
    // O trigger de hash usa o nome da coluna: recria com o nome novo
    if (found.isHashed && change.hashed !== false) statements.push(...buildDisableHashSql(schema, table, column))
    statements.push(`alter table ${target} rename column ${col} to ${ident(finalName)};`)
  }

  const enabling = change.hashed === true && !found.isHashed
  const recreating = found.isHashed && change.hashed !== false && finalName !== column
  if (enabling || recreating) {
    statements.push(...(await buildEnableHashSql(client, schema, table, finalName, enabling && change.hashExisting !== false)))
  }

  return apply(client, statements, dryRun)
}

export async function dropColumn(client: pg.PoolClient, schema: string, table: string, column: string, opts: { cascade: boolean; dryRun: boolean }) {
  const { columns } = await findColumn(client, schema, table, column)
  if (columns.length === 1) throw badRequest('A tabela precisa ter pelo menos uma coluna', 'LAST_COLUMN')
  return apply(client, [`alter table ${qualified(schema, table)} drop column ${ident(column)}${opts.cascade ? ' cascade' : ''};`], opts.dryRun)
}

export async function alterTable(client: pg.PoolClient, schema: string, table: string, change: AlterTableInput, dryRun: boolean) {
  await getColumns(client, schema, table) // garante que existe
  const statements: string[] = []
  let current = qualified(schema, table)
  let currentSchema = schema

  if (change.comment !== undefined) {
    statements.push(`comment on table ${current} is ${change.comment ? literal(change.comment) : 'null'};`)
  }
  if (change.name && change.name !== table) {
    statements.push(`alter table ${current} rename to ${ident(change.name)};`)
    current = qualified(schema, change.name)
  }
  if (change.schema && change.schema !== schema) {
    statements.push(`alter table ${current} set schema ${ident(change.schema)};`)
    currentSchema = change.schema
  }
  const result = await apply(client, statements, dryRun)
  return { ...result, schema: currentSchema, name: change.name ?? table }
}

export async function dropTable(client: pg.PoolClient, schema: string, table: string, opts: { cascade: boolean; dryRun: boolean }) {
  await getColumns(client, schema, table)
  return apply(client, [`drop table ${qualified(schema, table)}${opts.cascade ? ' cascade' : ''};`], opts.dryRun)
}

export async function getTableComment(client: pg.PoolClient, schema: string, table: string) {
  const { rows } = await client.query<{ comment: string | null }>(
    `select obj_description(c.oid, 'pg_class') as comment
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2`,
    [schema, table],
  )
  return rows[0]?.comment ?? null
}
