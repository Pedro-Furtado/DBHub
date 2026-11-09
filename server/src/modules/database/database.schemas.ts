import { z } from 'zod'

const identifier = z.string().min(1).max(128)

export const connectionScopeParams = z.object({ id: z.uuid('ID de conexão inválido') })
export const tableParams = connectionScopeParams.extend({ schema: identifier, table: identifier })

export const filterOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts', 'ends', 'in', 'is_null', 'not_null'] as const

export const rowFilter = z.object({
  column: identifier,
  op: z.enum(filterOperators, { message: 'Operador inválido' }),
  value: z.string().max(1000).optional(),
})
export type RowFilter = z.infer<typeof rowFilter>

/** filters vem na URL como JSON: ?filters=[{"column":"status","op":"eq","value":"ativo"}] */
const filtersParam = z
  .string()
  .max(10_000)
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      ctx.addIssue({ code: 'custom', message: 'filters precisa ser um JSON válido' })
      return z.NEVER
    }
  })
  .pipe(rowFilter.array().max(20, 'Máximo de 20 filtros'))

export const rowsQuerystring = z.object({
  filters: filtersParam.optional(),
  match: z.enum(['all', 'any']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(100),
  search: z.string().trim().max(200).optional(),
  /** Formato: coluna:asc | coluna:desc */
  sort: z
    .string()
    .regex(/^.+:(asc|desc)$/, 'Use coluna:asc ou coluna:desc')
    .transform((v) => {
      const i = v.lastIndexOf(':')
      return { column: v.slice(0, i), direction: v.slice(i + 1) as 'asc' | 'desc' }
    })
    .optional(),
})

const rowValues = z.record(z.string(), z.unknown())

/** Colunas cujo valor deve ser salvo como hash bcrypt (ex.: senha) */
const hashList = identifier.array().max(50).optional()

export const insertRowBody = z.object({ values: rowValues, hash: hashList })
export const updateRowBody = z.object({ key: rowValues, changes: rowValues, hash: hashList })
export const deleteRowsBody = z.object({ keys: rowValues.array().min(1).max(1000) })

export const queryBody = z.object({ sql: z.string().trim().min(1, 'Query vazia').max(100_000) })

export const exportQuerystring = rowsQuerystring.omit({ page: true, pageSize: true }).extend({
  delimiter: z.enum([',', ';']).default(','),
})

export const bulkInsertBody = z.object({
  rows: z.record(z.string(), z.unknown()).array().min(1).max(1000, 'Envie no máximo 1000 linhas por vez'),
  hash: hashList,
})
