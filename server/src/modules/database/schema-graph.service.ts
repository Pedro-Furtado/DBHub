import type pg from 'pg'

export type GraphColumn = { name: string; type: string; nullable: boolean; isPrimaryKey: boolean; references?: { schema: string; table: string; column: string } }
export type GraphTable = { schema: string; name: string; kind: 'table' | 'view'; rowEstimate: number | null; columns: GraphColumn[] }

/**
 * Tabelas + colunas + chaves estrangeiras de um schema em uma consulta só
 * (usado pelo Schema Visualizer e pelo autocomplete do SQL Editor).
 * Relacionamentos para outros schemas também vêm, para desenhar a aresta.
 */
export async function getSchemaGraph(client: pg.PoolClient, schemas: string[] | 'all') {
  const { rows } = await client.query<{
    schema: string
    table: string
    relkind: string
    row_estimate: string | null
    column: string
    type: string
    nullable: boolean
    is_pk: boolean
    ref_schema: string | null
    ref_table: string | null
    ref_column: string | null
  }>(
    `
    select n.nspname as schema, c.relname as table, c.relkind,
           case when c.reltuples < 0 then null else c.reltuples::bigint end as row_estimate,
           a.attname as column, format_type(a.atttypid, a.atttypmod) as type, not a.attnotnull as nullable,
           exists (select 1 from pg_index i where i.indrelid = c.oid and i.indisprimary and a.attnum = any(i.indkey)) as is_pk,
           fk.ref_schema, fk.ref_table, fk.ref_column
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join lateral (
        select fn.nspname as ref_schema, fc.relname as ref_table, fa.attname as ref_column
          from pg_constraint con
          join pg_class fc on fc.oid = con.confrelid
          join pg_namespace fn on fn.oid = fc.relnamespace
          join pg_attribute fa on fa.attrelid = con.confrelid and fa.attnum = con.confkey[array_position(con.conkey, a.attnum)]
         where con.conrelid = c.oid and con.contype = 'f' and a.attnum = any(con.conkey)
         limit 1
      ) fk on true
     where c.relkind in ('r', 'p', 'v', 'm') and not c.relispartition
       and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and n.nspname not like 'pg_temp_%'
       ${schemas === 'all' ? '' : 'and n.nspname = any($1)'}
     order by n.nspname, c.relname, a.attnum
    `,
    schemas === 'all' ? [] : [schemas],
  )

  const tables = new Map<string, GraphTable>()
  for (const r of rows) {
    const key = `${r.schema}.${r.table}`
    let table = tables.get(key)
    if (!table) {
      table = {
        schema: r.schema,
        name: r.table,
        kind: r.relkind === 'v' || r.relkind === 'm' ? 'view' : 'table',
        rowEstimate: r.row_estimate === null ? null : Number(r.row_estimate),
        columns: [],
      }
      tables.set(key, table)
    }
    table.columns.push({
      name: r.column,
      type: r.type,
      nullable: r.nullable,
      isPrimaryKey: r.is_pk,
      ...(r.ref_table ? { references: { schema: r.ref_schema!, table: r.ref_table, column: r.ref_column! } } : {}),
    })
  }
  return [...tables.values()]
}
