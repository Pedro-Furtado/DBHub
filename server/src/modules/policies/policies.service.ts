import type pg from 'pg'
import { badRequest, conflict, notFound } from '../../lib/errors.ts'
import { ident, qualified } from '../database/pg-utils.ts'
import type { PolicyInput } from './policies.schemas.ts'

export type Policy = {
  name: string
  command: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  permissive: boolean
  roles: string[]
  using: string | null
  withCheck: string | null
}

export type TableRls = {
  schema: string
  table: string
  rlsEnabled: boolean
  rlsForced: boolean
  policies: Policy[]
}

const roleSql = (role: string) => (role === 'public' ? 'public' : ident(role))

/** Gera o CREATE POLICY — nomes sempre entre aspas, roles conferidos contra pg_roles antes de executar. */
export function buildCreatePolicySql(schema: string, table: string, p: PolicyInput) {
  const lines = [
    `create policy ${ident(p.name)}`,
    `  on ${qualified(schema, table)}`,
    `  as ${p.permissive ? 'permissive' : 'restrictive'}`,
    `  for ${p.command.toLowerCase()}`,
    `  to ${p.roles.map(roleSql).join(', ')}`,
  ]
  if (p.using) lines.push(`  using (${p.using})`)
  if (p.withCheck) lines.push(`  with check (${p.withCheck})`)
  return `${lines.join('\n')};`
}

/** Usuário com que o DBHub conecta: superuser/BYPASSRLS ignora todas as políticas. */
export async function getSessionInfo(client: pg.PoolClient) {
  const { rows } = await client.query<{ user: string; superuser: boolean; bypass: boolean }>(`
    select current_user as user, r.rolsuper as superuser, r.rolbypassrls as bypass
      from pg_roles r where r.rolname = current_user
  `)
  return rows[0] ?? { user: 'desconhecido', superuser: false, bypass: false }
}

export async function listRoles(client: pg.PoolClient) {
  const { rows } = await client.query<{ name: string }>(`
    select rolname as name from pg_roles
     where rolname not like 'pg\\_%'
     order by rolname
  `)
  return ['public', ...rows.map((r) => r.name)]
}

/** Visão geral: todas as tabelas com status de RLS e suas políticas. */
export async function listTablesRls(client: pg.PoolClient, filter?: { schema: string; table: string }): Promise<TableRls[]> {
  const params = filter ? [filter.schema, filter.table] : []
  const { rows } = await client.query<{
    schema: string
    table: string
    rls_enabled: boolean
    rls_forced: boolean
    policies: Policy[] | null
  }>(
    `
    select n.nspname as schema, c.relname as table,
           c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
           (select json_agg(json_build_object(
                     'name', p.policyname,
                     'command', p.cmd,
                     'permissive', p.permissive = 'PERMISSIVE',
                     'roles', p.roles,
                     'using', p.qual,
                     'withCheck', p.with_check) order by p.policyname)
              from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p')
       and not c.relispartition
       and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
       and n.nspname not like 'pg_temp_%'
       ${filter ? 'and n.nspname = $1 and c.relname = $2' : ''}
     order by n.nspname = 'public' desc, n.nspname, c.relname
    `,
    params,
  )
  return rows.map((r) => ({
    schema: r.schema,
    table: r.table,
    rlsEnabled: r.rls_enabled,
    rlsForced: r.rls_forced,
    policies: r.policies ?? [],
  }))
}

async function assertTable(client: pg.PoolClient, schema: string, table: string) {
  const [found] = await listTablesRls(client, { schema, table })
  if (!found) throw notFound(`Tabela ${schema}.${table} não encontrada`, 'TABLE_NOT_FOUND')
  return found
}

async function assertRoles(client: pg.PoolClient, roles: string[]) {
  const known = new Set(await listRoles(client))
  const unknown = roles.filter((r) => !known.has(r))
  if (unknown.length) throw badRequest(`Roles inexistentes: ${unknown.join(', ')}`, 'UNKNOWN_ROLES')
}

async function inTransaction<T>(client: pg.PoolClient, fn: () => Promise<T>) {
  await client.query('BEGIN')
  try {
    const result = await fn()
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export async function setRls(client: pg.PoolClient, schema: string, table: string, change: { enabled?: boolean; forced?: boolean }) {
  await assertTable(client, schema, table)
  const target = qualified(schema, table)
  const statements: string[] = []
  if (change.enabled !== undefined) statements.push(`alter table ${target} ${change.enabled ? 'enable' : 'disable'} row level security;`)
  if (change.forced !== undefined) statements.push(`alter table ${target} ${change.forced ? 'force' : 'no force'} row level security;`)
  await inTransaction(client, async () => {
    for (const sql of statements) await client.query(sql)
  })
  return { ...(await assertTable(client, schema, table)), sql: statements.join('\n') }
}

export async function createPolicy(client: pg.PoolClient, schema: string, table: string, input: PolicyInput) {
  const current = await assertTable(client, schema, table)
  if (current.policies.some((p) => p.name === input.name)) throw conflict(`Já existe uma política "${input.name}" nesta tabela`, 'POLICY_EXISTS')
  await assertRoles(client, input.roles)
  const sql = buildCreatePolicySql(schema, table, input)
  await inTransaction(client, () => client.query(sql))
  return { sql }
}

/** Editar = drop + create na mesma transação (o Postgres não altera comando/tipo com ALTER POLICY). */
export async function replacePolicy(client: pg.PoolClient, schema: string, table: string, oldName: string, input: PolicyInput) {
  const current = await assertTable(client, schema, table)
  if (!current.policies.some((p) => p.name === oldName)) throw notFound(`Política "${oldName}" não encontrada`, 'POLICY_NOT_FOUND')
  if (input.name !== oldName && current.policies.some((p) => p.name === input.name)) {
    throw conflict(`Já existe uma política "${input.name}" nesta tabela`, 'POLICY_EXISTS')
  }
  await assertRoles(client, input.roles)
  const sql = `drop policy ${ident(oldName)} on ${qualified(schema, table)};\n${buildCreatePolicySql(schema, table, input)}`
  await inTransaction(client, () => client.query(sql))
  return { sql }
}

export async function dropPolicy(client: pg.PoolClient, schema: string, table: string, name: string) {
  const current = await assertTable(client, schema, table)
  if (!current.policies.some((p) => p.name === name)) throw notFound(`Política "${name}" não encontrada`, 'POLICY_NOT_FOUND')
  const sql = `drop policy ${ident(name)} on ${qualified(schema, table)};`
  await client.query(sql)
  return { sql }
}
