import type pg from 'pg'
import { env } from '../../config/env.ts'
import { forbidden } from '../../lib/errors.ts'
import { typeName } from './pg-utils.ts'

export type QueryResult = {
  command: string
  columns: { name: string; type: string }[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  durationMs: number
}

/** Bloqueia tentativas de sair do modo somente leitura pela própria query. */
const READ_ONLY_ESCAPE = /\b(transaction_read_only|default_transaction_read_only|session\s+characteristics)\b|^\s*(commit|end|rollback|abort)\b|;\s*(commit|end|rollback|abort)\b/im

export function assertReadOnlySafe(sql: string) {
  if (READ_ONLY_ESCAPE.test(sql)) {
    throw forbidden('Essa conexão é somente leitura: controle de transação e troca de modo não são permitidos', 'READ_ONLY')
  }
}

export async function executeQuery(client: pg.PoolClient, sql: string): Promise<QueryResult> {
  const startedAt = performance.now()
  const raw = await client.query({ text: sql, rowMode: 'array' })
  const durationMs = Math.round(performance.now() - startedAt)

  // Com várias instruções o pg retorna um array: mostramos o resultado da última
  const result = (Array.isArray(raw) ? raw.at(-1) : raw) as pg.QueryArrayResult

  // Nomes repetidos (ex.: dois "id" num join) viram id, id_2…
  const seen = new Map<string, number>()
  const columns = (result.fields ?? []).map((f) => {
    const count = (seen.get(f.name) ?? 0) + 1
    seen.set(f.name, count)
    return { name: count > 1 ? `${f.name}_${count}` : f.name, type: typeName(f.dataTypeID) }
  })

  // Tipos fora da tabela fixa (enums, domínios, extensões): pergunta o nome ao próprio banco
  const unknown = [...new Set((result.fields ?? []).map((f) => f.dataTypeID).filter((oid) => typeName(oid).startsWith('oid:')))]
  if (unknown.length) {
    const { rows } = await client.query<{ oid: number; name: string }>('select oid::int, format_type(oid, null) as name from pg_type where oid = any($1)', [unknown])
    const names = new Map(rows.map((r) => [r.oid, r.name]))
    ;(result.fields ?? []).forEach((f, i) => {
      if (names.has(f.dataTypeID)) columns[i]!.type = names.get(f.dataTypeID)!
    })
  }

  const allRows = result.rows ?? []
  const rows = allRows.slice(0, env.QUERY_MAX_ROWS).map((values) =>
    Object.fromEntries(columns.map((c, i) => [c.name, values[i]])),
  )

  return {
    command: result.command ?? 'UNKNOWN',
    columns,
    rows,
    rowCount: result.command === 'SELECT' ? allRows.length : (result.rowCount ?? 0),
    truncated: allRows.length > env.QUERY_MAX_ROWS,
    durationMs,
  }
}
