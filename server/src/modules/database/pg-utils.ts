import pg from 'pg'
import { AppError, DatabaseQueryError } from '../../lib/errors.ts'

/** Escapa identificadores (schema, tabela, coluna) — valores sempre vão como parâmetro ($1). */
export const ident = (name: string) => `"${name.replace(/"/g, '""')}"`
export const qualified = (schema: string, table: string) => `${ident(schema)}.${ident(table)}`

/**
 * Parsers de tipo para os bancos externos: mantém os valores como o Postgres
 * mostra (sem converter fuso de datas nem perder precisão de bigint/numeric).
 */
const { builtins } = pg.types
const asText = (value: string) => value
const textTypes = [
  builtins.TIMESTAMP,
  builtins.TIMESTAMPTZ,
  builtins.DATE,
  builtins.TIME,
  builtins.TIMETZ,
  builtins.INTERVAL,
  builtins.INT8,
  builtins.NUMERIC,
  builtins.MONEY,
  builtins.BYTEA,
]

export const externalTypes = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
    if (textTypes.includes(oid)) return asText
    return pg.types.getTypeParser(oid, format)
  }) as typeof pg.types.getTypeParser,
}

/** Converte erros do driver em erro amigável para a API. */
export function toQueryError(error: unknown): never {
  // Erros nossos (tabela não encontrada, sem PK…) passam direto
  if (error instanceof AppError) throw error
  if (error instanceof Error && 'code' in error) {
    const e = error as Error & { code?: string; position?: string; detail?: string; hint?: string }
    if (e.code === '57014') {
      throw new DatabaseQueryError('A query passou do tempo limite e foi cancelada', e.code)
    }
    if (e.code === '22P02' || e.code === '22007' || e.code === '22008') {
      throw new DatabaseQueryError(`Valor inválido para o tipo da coluna — ${e.message}`, e.code)
    }
    if (e.code === '25006') {
      throw new DatabaseQueryError('Conexão em modo somente leitura: comandos de escrita estão bloqueados', e.code)
    }
    const message = [e.message, e.detail, e.hint && `Dica: ${e.hint}`].filter(Boolean).join(' — ')
    throw new DatabaseQueryError(message, e.code, e.position)
  }
  throw error
}

/** Nome legível do tipo a partir do OID (para o cabeçalho do resultado do SQL Editor). */
const oidNames: Record<number, string> = {
  16: 'bool', 17: 'bytea', 18: 'char', 19: 'name', 20: 'int8', 21: 'int2', 23: 'int4', 25: 'text',
  26: 'oid', 114: 'json', 142: 'xml', 700: 'float4', 701: 'float8', 790: 'money', 1042: 'bpchar',
  1043: 'varchar', 1082: 'date', 1083: 'time', 1114: 'timestamp', 1184: 'timestamptz', 1186: 'interval',
  1266: 'timetz', 1700: 'numeric', 2950: 'uuid', 3802: 'jsonb', 1000: 'bool[]', 1007: 'int4[]',
  1009: 'text[]', 1016: 'int8[]', 2951: 'uuid[]',
}
export const typeName = (oid: number) => oidNames[oid] ?? `oid:${oid}`
