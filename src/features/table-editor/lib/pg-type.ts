import type { ColumnType } from '@/types/database'

const aliases: Record<string, ColumnType> = {
  text: 'text',
  'character varying': 'varchar',
  varchar: 'varchar',
  uuid: 'uuid',
  smallint: 'int2',
  integer: 'int4',
  bigint: 'int8',
  numeric: 'numeric',
  real: 'float4',
  'double precision': 'float8',
  boolean: 'bool',
  date: 'date',
  'time without time zone': 'time',
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamptz',
  interval: 'interval',
  json: 'json',
  jsonb: 'jsonb',
  bytea: 'bytea',
}

/**
 * Converte o tipo que o Postgres mostra (format_type) para o tipo da UI.
 * Ex.: "character varying(30)[]" → { type: 'varchar', typeArgs: '30', isArray: true }.
 * Tipos fora da lista (enums, geometria…) retornam null e ficam "mantidos".
 */
export function parsePgType(pgType: string): { type: ColumnType; typeArgs?: string; isArray: boolean } | null {
  const isArray = pgType.endsWith('[]')
  const base = pgType.replace(/\[\]$/, '')
  const match = base.match(/^([a-z ]+?)(?:\((\d+(?:,\d+)?)\))?(?: (with(?:out)? time zone))?$/)
  if (!match) return null
  const name = match[3] ? `${match[1]} ${match[3]}` : match[1]!
  const type = aliases[name.trim()]
  if (!type) return null
  return { type, typeArgs: match[2], isArray }
}
