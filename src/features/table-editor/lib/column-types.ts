import type { BuiltinColumnType, ColumnDefinition, ColumnType, EnumType } from '@/types/database'

type TypeOption = { value: BuiltinColumnType; label: string; group: string; defaults?: string[] }

/** Tipos da UI, agrupados como no Supabase, com sugestões de valor padrão. */
export const columnTypeOptions: TypeOption[] = [
  { value: 'text', label: 'text', group: 'Texto', defaults: ["''"] },
  { value: 'varchar', label: 'varchar', group: 'Texto' },
  { value: 'uuid', label: 'uuid', group: 'Texto', defaults: ['gen_random_uuid()'] },
  { value: 'int2', label: 'int2 (smallint)', group: 'Número', defaults: ['0'] },
  { value: 'int4', label: 'int4 (integer)', group: 'Número', defaults: ['0'] },
  { value: 'int8', label: 'int8 (bigint)', group: 'Número', defaults: ['0'] },
  { value: 'numeric', label: 'numeric', group: 'Número', defaults: ['0'] },
  { value: 'float4', label: 'float4', group: 'Número', defaults: ['0'] },
  { value: 'float8', label: 'float8', group: 'Número', defaults: ['0'] },
  { value: 'bool', label: 'bool', group: 'Booleano', defaults: ['false', 'true'] },
  { value: 'date', label: 'date', group: 'Data e hora', defaults: ['current_date'] },
  { value: 'time', label: 'time', group: 'Data e hora', defaults: ['current_time'] },
  { value: 'timestamp', label: 'timestamp', group: 'Data e hora', defaults: ['now()'] },
  { value: 'timestamptz', label: 'timestamptz', group: 'Data e hora', defaults: ['now()'] },
  { value: 'interval', label: 'interval', group: 'Data e hora' },
  { value: 'json', label: 'json', group: 'JSON', defaults: ["'{}'::json"] },
  { value: 'jsonb', label: 'jsonb', group: 'JSON', defaults: ["'{}'::jsonb", "'[]'::jsonb"] },
  { value: 'bytea', label: 'bytea', group: 'Outros' },
]

export const typeGroups = [...new Set(columnTypeOptions.map((t) => t.group))]
export const isIntegerType = (type: ColumnType) => type === 'int2' || type === 'int4' || type === 'int8'
export const acceptsTypeArgs = (type: ColumnType) => type === 'varchar' || type === 'numeric'
/** Enum do usuário: o tipo vem como "schema.nome". */
export const isEnumType = (type: ColumnType) => type.includes('.')
export const enumKey = (e: Pick<EnumType, 'schema' | 'name'>) => `${e.schema}.${e.name}` as ColumnType
/** Como o tipo aparece na UI: enums do public sem o prefixo. */
export const typeLabel = (type: ColumnType) => (type.startsWith('public.') ? type.slice('public.'.length) : type)
const sqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`

export function defaultSuggestions(type: ColumnType, enums: EnumType[] = []) {
  if (isEnumType(type)) return enums.find((e) => enumKey(e) === type)?.values.map(sqlLiteral) ?? []
  return columnTypeOptions.find((t) => t.value === type)?.defaults ?? []
}

let seq = 0
export type DraftColumn = ColumnDefinition & { key: number }

export function newColumn(partial: Partial<ColumnDefinition> = {}): DraftColumn {
  return {
    key: ++seq,
    name: '',
    type: 'text',
    isArray: false,
    isIdentity: false,
    isPrimaryKey: false,
    nullable: true,
    unique: false,
    ...partial,
  }
}

/** Ponto de partida igual ao do Supabase: id auto incremento + created_at. */
export const initialColumns = () => [
  newColumn({ name: 'id', type: 'int8', isIdentity: true, isPrimaryKey: true, nullable: false }),
  newColumn({ name: 'created_at', type: 'timestamptz', defaultValue: 'now()', nullable: false }),
]
