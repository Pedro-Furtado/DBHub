import type pg from 'pg'
import { badRequest, conflict, notFound } from '../../lib/errors.ts'
import type { AlterEnumInput, CreateEnumInput } from './ddl.schemas.ts'
import { ident, qualified } from './pg-utils.ts'

export type EnumInfo = {
  schema: string
  name: string
  values: string[]
  /** Colunas que usam o enum ("schema.tabela.coluna") */
  usedBy: string[]
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`

/** Mesmo esquema das alterações de estrutura: dryRun devolve só o SQL; sem dryRun aplica tudo numa transação. */
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

export async function listEnums(client: pg.PoolClient): Promise<EnumInfo[]> {
  const { rows } = await client.query<EnumInfo>(`
    select n.nspname::text as schema,
           t.typname::text as name,
           array(select e.enumlabel::text from pg_enum e where e.enumtypid = t.oid order by e.enumsortorder) as values,
           array(
             select cn.nspname || '.' || c.relname || '.' || a.attname
               from pg_attribute a
               join pg_class c on c.oid = a.attrelid and c.relkind in ('r', 'p', 'v', 'm')
               join pg_namespace cn on cn.oid = c.relnamespace
               join pg_type at on at.oid = a.atttypid
              where a.attnum > 0 and not a.attisdropped
                and (a.atttypid = t.oid or (at.typcategory = 'A' and at.typelem = t.oid))
              order by 1
           ) as "usedBy"
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where t.typtype = 'e'
       and n.nspname not in ('pg_catalog', 'information_schema')
       and has_schema_privilege(n.oid, 'USAGE')
     order by n.nspname = 'public' desc, n.nspname, t.typname
  `)
  return rows
}

async function findEnum(client: pg.PoolClient, schema: string, name: string) {
  const found = (await listEnums(client)).find((e) => e.schema === schema && e.name === name)
  if (!found) throw notFound(`Enum ${schema}.${name} não encontrado`, 'ENUM_NOT_FOUND')
  return found
}

export function buildCreateEnumSql(input: CreateEnumInput) {
  return `create type ${qualified(input.schema, input.name)} as enum (${input.values.map(literal).join(', ')});`
}

export async function createEnum(client: pg.PoolClient, input: CreateEnumInput, dryRun: boolean) {
  const { rows } = await client.query(
    `select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = $1 and t.typname = $2`,
    [input.schema, input.name],
  )
  if (rows.length) throw conflict(`Já existe um tipo ${input.schema}.${input.name}`, 'TYPE_EXISTS')
  const result = await apply(client, [buildCreateEnumSql(input)], dryRun)
  return { ...result, schema: input.schema, name: input.name }
}

/**
 * Postgres não remove nem reordena valores de enum — só adiciona e renomeia.
 * Para remover um valor é preciso recriar o tipo (fica para o SQL Editor).
 */
export async function alterEnum(client: pg.PoolClient, schema: string, name: string, change: AlterEnumInput, dryRun: boolean) {
  const current = await findEnum(client, schema, name)
  const target = qualified(schema, name)
  const statements: string[] = []
  const values = new Set(current.values)

  for (const { from, to } of change.renameValues ?? []) {
    if (from === to) continue
    if (!values.has(from)) throw badRequest(`O valor "${from}" não existe no enum`, 'ENUM_VALUE_NOT_FOUND')
    if (values.has(to)) throw badRequest(`O valor "${to}" já existe no enum`, 'ENUM_VALUE_EXISTS')
    statements.push(`alter type ${target} rename value ${literal(from)} to ${literal(to)};`)
    values.delete(from)
    values.add(to)
  }
  for (const { value, after } of change.addValues ?? []) {
    if (values.has(value)) throw badRequest(`O valor "${value}" já existe no enum`, 'ENUM_VALUE_EXISTS')
    if (after && !values.has(after)) throw badRequest(`O valor "${after}" não existe no enum`, 'ENUM_VALUE_NOT_FOUND')
    statements.push(`alter type ${target} add value ${literal(value)}${after ? ` after ${literal(after)}` : ''};`)
    values.add(value)
  }
  // Renomear o tipo por último: os comandos acima usam o nome atual
  if (change.name && change.name !== name) statements.push(`alter type ${target} rename to ${ident(change.name)};`)

  const result = await apply(client, statements, dryRun)
  return { ...result, schema, name: change.name ?? name }
}

export async function dropEnum(client: pg.PoolClient, schema: string, name: string, opts: { cascade: boolean; dryRun: boolean }) {
  await findEnum(client, schema, name)
  return apply(client, [`drop type ${qualified(schema, name)}${opts.cascade ? ' cascade' : ''};`], opts.dryRun)
}
