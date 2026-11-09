import { createHash } from 'node:crypto'
import type pg from 'pg'
import { ident, qualified } from './pg-utils.ts'

/**
 * "Coluna de senha": um trigger no próprio banco aplica bcrypt (pgcrypto) em todo
 * INSERT/UPDATE — vale para o DBHub, para a sua aplicação, para o SQL Editor e para agentes.
 * Valores que já são bcrypt passam direto (não refaz o hash).
 */

const BCRYPT_REGEX = String.raw`^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$`
const PREFIX = 'dbhub_hash_'

/** Nome dentro do limite de 63 bytes do Postgres; se passar, encurta com um sufixo estável. */
function pgName(name: string) {
  if (Buffer.byteLength(name) <= 63) return name
  const suffix = createHash('md5').update(name).digest('hex').slice(0, 8)
  return `${name.slice(0, 54)}_${suffix}`
}

/** Trigger: um por coluna (o nome identifica a coluna). Função: uma por tabela+coluna. */
export const hashTriggerName = (column: string) => pgName(`${PREFIX}${column}`)
export const hashFunctionName = (table: string, column: string) => pgName(`${PREFIX}${table}_${column}`)

/** Schema onde o pgcrypto está (ou null se não está instalado). */
async function pgcryptoSchema(client: pg.PoolClient) {
  const { rows } = await client.query<{ schema: string }>(
    `select n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto'`,
  )
  return rows[0]?.schema ?? null
}

export async function buildEnableHashSql(client: pg.PoolClient, schema: string, table: string, column: string, convertExisting: boolean) {
  const installed = await pgcryptoSchema(client)
  const statements: string[] = []
  if (!installed) statements.push(`create extension if not exists pgcrypto with schema ${ident(schema)};`)
  const ext = ident(installed ?? schema)
  const fn = qualified(schema, hashFunctionName(table, column))
  const col = ident(column)

  statements.push(
    `create or replace function ${fn}() returns trigger language plpgsql as $fn$
begin
  -- DBHub: coluna de senha — salva sempre como hash bcrypt
  if new.${col} is not null and new.${col} !~ '${BCRYPT_REGEX}' then
    new.${col} := ${ext}.crypt(new.${col}, ${ext}.gen_salt('bf', 10));
  end if;
  return new;
end
$fn$;`,
    `create trigger ${ident(hashTriggerName(column))} before insert or update of ${col} on ${qualified(schema, table)} for each row execute function ${fn}();`,
  )
  if (convertExisting) {
    statements.push(
      `update ${qualified(schema, table)} set ${col} = ${ext}.crypt(${col}, ${ext}.gen_salt('bf', 10)) where ${col} is not null and ${col} !~ '${BCRYPT_REGEX}';`,
    )
  }
  return statements
}

export function buildDisableHashSql(schema: string, table: string, column: string) {
  return [
    `drop trigger if exists ${ident(hashTriggerName(column))} on ${qualified(schema, table)};`,
    `drop function if exists ${qualified(schema, hashFunctionName(table, column))}();`,
  ]
}
