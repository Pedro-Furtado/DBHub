import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import type pg from 'pg'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.ts'
import { ident, qualified } from '../database/pg-utils.ts'
import type { CreateRoleInput, GrantItem, UpdateRoleInput } from './roles.schemas.ts'

export type DbRole = {
  name: string
  canLogin: boolean
  superuser: boolean
  bypassRls: boolean
  createDb: boolean
  createRole: boolean
  connectionLimit: number
  memberOf: string[]
  isCurrent: boolean
}

/**
 * A senha é enviada já como verificador SCRAM-SHA-256 (o mesmo formato que o Postgres guarda).
 * Assim o texto da senha nunca trafega no SQL — nem aparece nos logs do banco, se o log de DDL estiver ligado.
 */
export function scramVerifier(password: string, iterations = 4096) {
  const salt = randomBytes(16)
  const salted = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256')
  const clientKey = createHmac('sha256', salted).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest()
  const serverKey = createHmac('sha256', salted).update('Server Key').digest()
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`
/** Na prévia (e no retorno da API) a senha aparece mascarada */
const MASK = "'••••••'"

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

export async function listDbRoles(client: pg.PoolClient): Promise<DbRole[]> {
  const { rows } = await client.query<{
    name: string
    can_login: boolean
    superuser: boolean
    bypass: boolean
    createdb: boolean
    createrole: boolean
    connlimit: number
    member_of: string[] | null
    is_current: boolean
  }>(`
    select r.rolname as name, r.rolcanlogin as can_login, r.rolsuper as superuser, r.rolbypassrls as bypass,
           r.rolcreatedb as createdb, r.rolcreaterole as createrole, r.rolconnlimit as connlimit,
           (select array_agg(g.rolname order by g.rolname)
              from pg_auth_members m join pg_roles g on g.oid = m.roleid
             where m.member = r.oid) as member_of,
           r.rolname = current_user as is_current
      from pg_roles r
     where r.rolname not like 'pg\\_%'
     order by r.rolsuper desc, r.rolname
  `)
  return rows.map((r) => ({
    name: r.name,
    canLogin: r.can_login,
    superuser: r.superuser,
    bypassRls: r.bypass,
    createDb: r.createdb,
    createRole: r.createrole,
    connectionLimit: r.connlimit,
    memberOf: r.member_of ?? [],
    isCurrent: r.is_current,
  }))
}

async function findRole(client: pg.PoolClient, name: string) {
  const role = (await listDbRoles(client)).find((r) => r.name === name)
  if (!role) throw notFound(`Role ${name} não encontrado`, 'ROLE_NOT_FOUND')
  return role
}

function roleOptions(input: { canLogin?: boolean; connectionLimit?: number }, password: string | undefined, mask: boolean) {
  const opts: string[] = []
  if (input.canLogin !== undefined) opts.push(input.canLogin ? 'login' : 'nologin')
  if (input.connectionLimit !== undefined) opts.push(`connection limit ${input.connectionLimit}`)
  if (password !== undefined) opts.push(`password ${mask ? MASK : literal(scramVerifier(password))}`)
  return opts.join(' ')
}

/** Cria o role. Retorna o SQL com a senha mascarada (o real só é executado). */
export async function createDbRole(client: pg.PoolClient, input: CreateRoleInput, dryRun: boolean) {
  const exists = (await listDbRoles(client)).some((r) => r.name === input.name)
  if (exists) throw conflict(`Já existe o role ${input.name}`, 'ROLE_EXISTS')
  const build = (mask: boolean) => `create role ${ident(input.name)} ${roleOptions(input, input.password, mask)};`.replace(/\s+;$/, ';')
  if (!dryRun) await client.query(build(false))
  return { sql: build(true), applied: !dryRun }
}

export async function updateDbRole(client: pg.PoolClient, name: string, input: UpdateRoleInput, dryRun: boolean) {
  const role = await findRole(client, name)
  if (role.isCurrent && input.canLogin === false) throw forbidden('Não dá para tirar o login do usuário que o DBHub usa', 'CURRENT_ROLE')
  const build = (mask: boolean) => `alter role ${ident(name)} ${roleOptions(input, input.password, mask)};`
  if (!dryRun) await client.query(build(false))
  return { sql: build(true), applied: !dryRun }
}

export async function dropDbRole(client: pg.PoolClient, name: string, opts: { reassign: boolean; dryRun: boolean }) {
  const role = await findRole(client, name)
  if (role.isCurrent) throw forbidden('Não dá para excluir o usuário que o DBHub usa para conectar', 'CURRENT_ROLE')
  const statements = opts.reassign
    ? [`reassign owned by ${ident(name)} to current_user;`, `drop owned by ${ident(name)};`, `drop role ${ident(name)};`]
    : [`drop role ${ident(name)};`]
  if (!opts.dryRun) {
    try {
      await inTransaction(client, async () => {
        for (const sql of statements) await client.query(sql)
      })
    } catch (error) {
      // 2BP01: o role ainda é dono de objetos ou tem privilégios
      if (error instanceof Error && 'code' in error && error.code === '2BP01') {
        throw badRequest(
          `O role ${name} ainda tem objetos ou permissões no banco. Marque "transferir objetos e remover permissões" para excluir mesmo assim.`,
          'ROLE_HAS_DEPENDENCIES',
        )
      }
      throw error
    }
  }
  return { sql: statements.join('\n'), applied: !opts.dryRun }
}

/** Privilégios diretos (GRANT explícito) do role em cada tabela/view — não conta superuser nem PUBLIC. */
export async function listGrants(client: pg.PoolClient, name: string) {
  await findRole(client, name)
  const { rows } = await client.query<{ schema: string; table: string; kind: string; privileges: string[] | null; owner: boolean }>(
    `
    select n.nspname as schema, c.relname as table, c.relkind as kind,
           (select array_agg(distinct a.privilege_type order by a.privilege_type)
              from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
             where a.grantee = (select oid from pg_roles where rolname = $1)
               and a.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) as privileges,
           pg_get_userbyid(c.relowner) = $1 as owner
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r','p','v','m') and not c.relispartition
       and n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp_%'
     order by n.nspname = 'public' desc, n.nspname, c.relname
    `,
    [name],
  )
  return rows.map((r) => ({ schema: r.schema, table: r.table, kind: r.kind === 'v' || r.kind === 'm' ? 'view' : 'table', privileges: r.privileges ?? [], owner: r.owner }))
}

/**
 * Define exatamente os privilégios de cada tabela (revoga e concede de novo), numa transação.
 * Também garante USAGE no schema e nas sequences das tabelas que recebem INSERT (senão o serial falha).
 */
export async function setGrants(client: pg.PoolClient, name: string, items: GrantItem[], dryRun: boolean) {
  await findRole(client, name)
  const role = ident(name)
  const statements: string[] = []
  const schemasWithAccess = new Set<string>()

  for (const item of items) {
    const target = qualified(item.schema, item.table)
    statements.push(`revoke select, insert, update, delete on ${target} from ${role};`)
    if (item.privileges.length) {
      statements.push(`grant ${item.privileges.map((p) => p.toLowerCase()).join(', ')} on ${target} to ${role};`)
      schemasWithAccess.add(item.schema)
    }
    if (item.privileges.includes('INSERT')) {
      const { rows } = await client.query<{ seq: string }>(
        `select quote_ident(sn.nspname) || '.' || quote_ident(s.relname) as seq
           from pg_class t join pg_namespace tn on tn.oid = t.relnamespace
           join pg_depend d on d.refobjid = t.oid and d.deptype in ('a','i')
           join pg_class s on s.oid = d.objid and s.relkind = 'S'
           join pg_namespace sn on sn.oid = s.relnamespace
          where tn.nspname = $1 and t.relname = $2`,
        [item.schema, item.table],
      )
      for (const r of rows) statements.push(`grant usage, select on sequence ${r.seq} to ${role};`)
    }
  }
  for (const schema of schemasWithAccess) statements.unshift(`grant usage on schema ${ident(schema)} to ${role};`)

  if (!dryRun) {
    await inTransaction(client, async () => {
      for (const sql of statements) await client.query(sql)
    })
  }
  return { sql: statements.join('\n'), applied: !dryRun }
}
