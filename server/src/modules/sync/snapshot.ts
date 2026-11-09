import type pg from 'pg'
import { ident, qualified } from '../database/pg-utils.ts'

/**
 * Foto da estrutura de um banco (só os objetos do usuário — nada de catálogo do sistema
 * nem objetos que pertencem a extensões). Serve para gerar o SQL que recria tudo em outro banco.
 */

const USER_SCHEMA = `n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\\_%'`
const NOT_EXTENSION = (oid: string, catalog: string) =>
  `not exists (select 1 from pg_depend d where d.classid = '${catalog}'::regclass and d.objid = ${oid} and d.deptype = 'e')`

export type Column = {
  name: string
  type: string
  notNull: boolean
  default: string | null
  identity: '' | 'a' | 'd'
  generated: string | null
  comment: string | null
}

export type Table = {
  oid: number
  schema: string
  name: string
  comment: string | null
  rowEstimate: number
  sizeBytes: number
  rls: boolean
  forceRls: boolean
  columns: Column[]
  /** PK, UNIQUE, CHECK, EXCLUDE (vão junto com o CREATE TABLE) */
  constraints: { name: string; def: string }[]
  foreignKeys: { name: string; def: string; references: string }[]
  indexes: string[]
  triggers: { name: string; def: string }[]
  policies: { name: string; permissive: boolean; roles: string[]; command: string; using: string | null; check: string | null }[]
}

export type Snapshot = {
  extensions: { name: string; schema: string }[]
  schemas: string[]
  enums: { schema: string; name: string; values: string[] }[]
  sequences: { schema: string; name: string; type: string; start: string; increment: string; min: string; max: string; cache: string; cycle: boolean; ownedBy: string | null; ownerTable: string | null; lastValue: string | null }[]
  functions: { schema: string; name: string; def: string }[]
  tables: Table[]
  views: { schema: string; name: string; materialized: boolean; def: string }[]
  /** O que existe mas o clone não recria (vira alerta na revisão) */
  unsupported: { kind: string; name: string }[]
}

export async function readSnapshot(client: pg.ClientBase): Promise<Snapshot> {
  const q = async <T extends pg.QueryResultRow>(sql: string) => (await client.query<T>(sql)).rows

  const extensions = await q<{ name: string; schema: string }>(`
    select e.extname as name, n.nspname as schema
      from pg_extension e join pg_namespace n on n.oid = e.extnamespace
     where e.extname <> 'plpgsql' order by e.extname`)

  const schemas = (
    await q<{ name: string }>(`
      select n.nspname as name from pg_namespace n
       where ${USER_SCHEMA} and ${NOT_EXTENSION('n.oid', 'pg_namespace')}
       order by n.nspname = 'public' desc, n.nspname`)
  ).map((r) => r.name)

  const enums = await q<{ schema: string; name: string; values: string[] }>(`
    select n.nspname as schema, t.typname as name,
           array(select e.enumlabel::text from pg_enum e where e.enumtypid = t.oid order by e.enumsortorder) as values
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where t.typtype = 'e' and ${USER_SCHEMA} and ${NOT_EXTENSION('t.oid', 'pg_type')}
     order by t.oid`)

  const unsupported = await q<{ kind: string; name: string }>(`
    select case t.typtype when 'd' then 'domínio' when 'c' then 'tipo composto' when 'r' then 'tipo range' else 'tipo' end as kind,
           n.nspname || '.' || t.typname as name
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where (t.typtype in ('d', 'r') or (t.typtype = 'c' and (select relkind from pg_class where oid = t.typrelid) = 'c'))
       and ${USER_SCHEMA} and ${NOT_EXTENSION('t.oid', 'pg_type')}
    union all
    select 'tabela particionada', n.nspname || '.' || c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where (c.relkind = 'p' or c.relispartition) and ${USER_SCHEMA}`)

  const sequences = await q<Snapshot['sequences'][number]>(`
    select n.nspname as schema, c.relname as name, format_type(s.seqtypid, null) as type,
           s.seqstart::text as start, s.seqincrement::text as increment, s.seqmin::text as min, s.seqmax::text as max,
           s.seqcache::text as cache, s.seqcycle as cycle,
           (select quote_ident(tn.nspname) || '.' || quote_ident(tc.relname) || '.' || quote_ident(a.attname)
              from pg_depend d
              join pg_class tc on tc.oid = d.refobjid
              join pg_namespace tn on tn.oid = tc.relnamespace
              join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
             where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'a' limit 1) as "ownedBy",
           (select tn.nspname || '.' || tc.relname
              from pg_depend d
              join pg_class tc on tc.oid = d.refobjid
              join pg_namespace tn on tn.oid = tc.relnamespace
             where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'a' limit 1) as "ownerTable",
           ps.last_value::text as "lastValue"
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_sequence s on s.seqrelid = c.oid
      left join pg_sequences ps on ps.schemaname = n.nspname and ps.sequencename = c.relname
     where c.relkind = 'S' and ${USER_SCHEMA} and ${NOT_EXTENSION('c.oid', 'pg_class')}
       -- sequences de colunas identity são recriadas pela própria coluna
       and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'i')
     order by c.oid`)

  const functions = await q<{ schema: string; name: string; def: string }>(`
    select n.nspname as schema, p.proname as name, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prokind in ('f', 'p') and ${USER_SCHEMA} and ${NOT_EXTENSION('p.oid', 'pg_proc')}
     order by p.oid`)

  const tableRows = await q<{ oid: number; schema: string; name: string; comment: string | null; row_estimate: string; size_bytes: string; rls: boolean; force_rls: boolean }>(`
    select c.oid::int as oid, n.nspname as schema, c.relname as name, obj_description(c.oid, 'pg_class') as comment,
           greatest(c.reltuples, 0)::bigint::text as row_estimate, pg_total_relation_size(c.oid)::text as size_bytes,
           c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and not c.relispartition and ${USER_SCHEMA} and ${NOT_EXTENSION('c.oid', 'pg_class')}
     order by n.nspname = 'public' desc, n.nspname, c.relname`)

  const columns = await q<Column & { table: number }>(`
    select a.attrelid::int as "table", a.attname as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as "notNull",
           case when a.attgenerated = '' and a.attidentity = '' then pg_get_expr(d.adbin, d.adrelid) end as default,
           a.attidentity as identity,
           case when a.attgenerated = 's' then pg_get_expr(d.adbin, d.adrelid) end as generated,
           col_description(a.attrelid, a.attnum) as comment
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attnum > 0 and not a.attisdropped
       and a.attrelid in (select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and ${USER_SCHEMA})
     order by a.attrelid, a.attnum`)

  const constraints = await q<{ table: number; name: string; type: string; def: string; references: string | null }>(`
    select con.conrelid::int as "table", con.conname as name, con.contype as type, pg_get_constraintdef(con.oid) as def,
           case when con.contype = 'f' then con.confrelid::regclass::text end as "references"
      from pg_constraint con
     where con.contype in ('p', 'u', 'c', 'x', 'f') and con.conislocal
       and con.conrelid in (select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and ${USER_SCHEMA})
     order by con.conrelid, con.contype = 'p' desc, con.oid`)

  const indexes = await q<{ table: number; def: string }>(`
    select i.indrelid::int as "table", pg_get_indexdef(i.indexrelid) as def
      from pg_index i
     where i.indrelid in (select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and ${USER_SCHEMA})
       and not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid and con.contype in ('p', 'u', 'x'))
     order by i.indexrelid`)

  const triggers = await q<{ table: number; name: string; def: string }>(`
    select t.tgrelid::int as "table", t.tgname as name, pg_get_triggerdef(t.oid) as def
      from pg_trigger t
     where not t.tgisinternal
       and t.tgrelid in (select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and ${USER_SCHEMA})
     order by t.oid`)

  const policies = await q<{ schema: string; table: string; name: string; permissive: string; roles: string[]; command: string; using: string | null; check: string | null }>(`
    select schemaname as schema, tablename as table, policyname as name, permissive, roles::text[] as roles, cmd as command,
           qual as using, with_check as check
      from pg_policies order by schemaname, tablename, policyname`)

  const views = await q<{ schema: string; name: string; materialized: boolean; def: string }>(`
    select n.nspname as schema, c.relname as name, c.relkind = 'm' as materialized, pg_get_viewdef(c.oid) as def
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('v', 'm') and ${USER_SCHEMA} and ${NOT_EXTENSION('c.oid', 'pg_class')}
     order by c.oid`)

  const tables: Table[] = tableRows.map((t) => ({
    oid: t.oid,
    schema: t.schema,
    name: t.name,
    comment: t.comment,
    rowEstimate: Number(t.row_estimate),
    sizeBytes: Number(t.size_bytes),
    rls: t.rls,
    forceRls: t.force_rls,
    columns: columns.filter((c) => c.table === t.oid).map(({ table: _t, ...c }) => c),
    constraints: constraints.filter((c) => c.table === t.oid && c.type !== 'f').map((c) => ({ name: c.name, def: c.def })),
    foreignKeys: constraints.filter((c) => c.table === t.oid && c.type === 'f').map((c) => ({ name: c.name, def: c.def, references: c.references ?? '' })),
    indexes: indexes.filter((i) => i.table === t.oid).map((i) => i.def),
    triggers: triggers.filter((tr) => tr.table === t.oid).map((tr) => ({ name: tr.name, def: tr.def })),
    policies: policies
      .filter((p) => p.schema === t.schema && p.table === t.name)
      .map((p) => ({ name: p.name, permissive: p.permissive === 'PERMISSIVE', roles: p.roles, command: p.command, using: p.using, check: p.check })),
  }))

  return { extensions, schemas, enums, sequences, functions, tables, views, unsupported }
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`

// ── Geração do SQL (agrupado por etapa, na ordem em que precisa rodar) ──

export function tableSql(t: Table) {
  const lines = t.columns.map((c) => {
    const parts = [ident(c.name), c.type]
    if (c.identity) parts.push(`generated ${c.identity === 'a' ? 'always' : 'by default'} as identity`)
    if (c.generated) parts.push(`generated always as (${c.generated}) stored`)
    if (c.default) parts.push(`default ${c.default}`)
    if (c.notNull) parts.push('not null')
    return `  ${parts.join(' ')}`
  })
  for (const con of t.constraints) lines.push(`  constraint ${ident(con.name)} ${con.def}`)
  return `create table ${qualified(t.schema, t.name)} (\n${lines.join(',\n')}\n);`
}

export function commentsSql(t: Table) {
  const target = qualified(t.schema, t.name)
  const out: string[] = []
  if (t.comment) out.push(`comment on table ${target} is ${literal(t.comment)};`)
  for (const c of t.columns) if (c.comment) out.push(`comment on column ${target}.${ident(c.name)} is ${literal(c.comment)};`)
  return out
}

export function policySql(t: Table, p: Table['policies'][number]) {
  const roles = p.roles.map((r) => (r === 'public' ? 'public' : ident(r))).join(', ')
  return [
    `create policy ${ident(p.name)} on ${qualified(t.schema, t.name)}`,
    `  as ${p.permissive ? 'permissive' : 'restrictive'} for ${p.command.toLowerCase()} to ${roles}`,
    p.using ? `  using (${p.using})` : null,
    p.check ? `  with check (${p.check})` : null,
  ]
    .filter(Boolean)
    .join('\n')
    .concat(';')
}

export function sequenceSql(s: Snapshot['sequences'][number]) {
  return `create sequence if not exists ${qualified(s.schema, s.name)} as ${s.type} increment by ${s.increment} minvalue ${s.min} maxvalue ${s.max} start with ${s.start} cache ${s.cache}${s.cycle ? ' cycle' : ''};`
}

export { literal }
