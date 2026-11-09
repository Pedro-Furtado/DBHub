import type pg from 'pg'
import { notFound } from '../../lib/errors.ts'
import { commentsSql, policySql, readSnapshot, sequenceSql, tableSql } from '../sync/snapshot.ts'
import { ident, qualified } from './pg-utils.ts'

/** Tira aspas e "[]" para comparar nomes de tipo/função: "public"."status"[] → public.status */
const bare = (name: string) => name.replace(/\[\]/g, '').replace(/"/g, '').trim()
const stripSemicolon = (sql: string) => sql.trim().replace(/;\s*$/, '')

/**
 * SQL que recria uma tabela (ou view) do jeito que ela está: tipos enum usados, sequences,
 * create table com PK/UNIQUE/CHECK, comentários, FKs, índices, funções e triggers, RLS e policies.
 */
export async function tableDefinition(client: pg.ClientBase, schema: string, name: string) {
  const s = await readSnapshot(client)
  const key = `${schema}.${name}`

  const view = s.views.find((v) => v.schema === schema && v.name === name)
  if (view) {
    const kind = view.materialized ? 'materialized view' : 'view'
    return { kind, sql: `-- ${kind} ${key}\ncreate ${kind} ${qualified(schema, name)} as\n${stripSemicolon(view.def)};\n` }
  }

  const t = s.tables.find((x) => x.schema === schema && x.name === name)
  if (!t) throw notFound(`Tabela ${key} não encontrada`, 'TABLE_NOT_FOUND')

  const out: string[] = [`-- Tabela ${key}`, '']
  const section = (title: string, lines: string[]) => {
    if (lines.length) out.push(`-- ${title}`, ...lines, '')
  }

  // Tipos enum usados pelas colunas
  const usedTypes = new Set(t.columns.map((c) => bare(c.type)))
  const enums = s.enums.filter((e) => usedTypes.has(`${e.schema}.${e.name}`) || (e.schema === 'public' && usedTypes.has(e.name)))
  section('Enums usados', enums.map((e) => `create type ${qualified(e.schema, e.name)} as enum (${e.values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')});`))

  // Sequences de colunas serial (identity já vem na coluna)
  const sequences = s.sequences.filter((q) => q.ownerTable === key)
  section('Sequences', sequences.map(sequenceSql))

  section('Tabela', [tableSql(t), ...commentsSql(t)])
  section('Sequences: dono', sequences.filter((q) => q.ownedBy).map((q) => `alter sequence ${qualified(q.schema, q.name)} owned by ${q.ownedBy};`))
  section('Chaves estrangeiras', t.foreignKeys.map((f) => `alter table ${qualified(schema, name)} add constraint ${ident(f.name)} ${f.def};`))
  section('Índices', t.indexes.map((i) => `${i};`))

  // Funções chamadas pelos triggers desta tabela
  const triggerFns = new Set(
    t.triggers.map((tr) => /execute (?:function|procedure) ([^(]+)\(/i.exec(tr.def)?.[1]).filter((fn): fn is string => !!fn).map(bare),
  )
  const functions = s.functions.filter((f) => triggerFns.has(`${f.schema}.${f.name}`) || (f.schema === 'public' && triggerFns.has(f.name)))
  section('Funções dos triggers', functions.map((f) => `${stripSemicolon(f.def)};`))
  section('Triggers', t.triggers.map((tr) => `${tr.def};`))

  section('RLS e políticas', [
    ...(t.rls ? [`alter table ${qualified(schema, name)} enable row level security;`] : []),
    ...(t.forceRls ? [`alter table ${qualified(schema, name)} force row level security;`] : []),
    ...t.policies.map((p) => policySql(t, p)),
  ])

  return { kind: 'table', sql: out.join('\n') }
}
