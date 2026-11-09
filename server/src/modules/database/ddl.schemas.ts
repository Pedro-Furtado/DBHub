import { z } from 'zod'

/** Tipos oferecidos na UI. Qualquer outro tipo continua possível pelo SQL Editor. */
export const COLUMN_TYPES = [
  'text',
  'varchar',
  'uuid',
  'int2',
  'int4',
  'int8',
  'numeric',
  'float4',
  'float8',
  'bool',
  'date',
  'time',
  'timestamp',
  'timestamptz',
  'interval',
  'json',
  'jsonb',
  'bytea',
] as const

/** Enum (ou outro tipo do usuário) qualificado: "schema.nome". */
const userType = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/, 'Tipo de coluna não suportado')

/** Tipo da coluna: um dos tipos nativos da lista ou um enum "schema.nome". */
export const columnTypeSchema = z.union([z.enum(COLUMN_TYPES), userType], { message: 'Tipo de coluna não suportado' })

/** Nome válido de identificador Postgres sem aspas (o que a UI aceita). */
const identifier = z
  .string()
  .trim()
  .min(1, 'Informe um nome')
  .max(63, 'Máximo de 63 caracteres')
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Use letras, números e _ (sem espaços ou acentos), começando por letra')

export const columnDefinition = z.object({
  name: identifier,
  type: columnTypeSchema,
  /** varchar(n) / numeric(p,s) */
  typeArgs: z
    .string()
    .trim()
    .regex(/^\d+(\s*,\s*\d+)?$/, 'Use números, ex.: 255 ou 10,2')
    .optional(),
  isArray: z.boolean().default(false),
  /** Expressão SQL do default, ex.: now(), gen_random_uuid(), 'ativo', 0 */
  defaultValue: z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v.includes(';'), 'O valor padrão não pode conter ;')
    .optional(),
  isIdentity: z.boolean().default(false),
  isPrimaryKey: z.boolean().default(false),
  nullable: z.boolean().default(true),
  unique: z.boolean().default(false),
  references: z
    .object({
      schema: identifier,
      table: identifier,
      column: identifier,
      onDelete: z.enum(['no action', 'cascade', 'set null', 'restrict']).default('no action'),
    })
    .optional(),
})

export const createTableBody = z
  .object({
    schema: identifier.default('public'),
    name: identifier,
    comment: z.string().trim().max(500).optional(),
    columns: columnDefinition.array().min(1, 'A tabela precisa de pelo menos uma coluna').max(200),
  })
  .superRefine((table, ctx) => {
    const seen = new Set<string>()
    table.columns.forEach((column, i) => {
      const key = column.name.toLowerCase()
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['columns', i, 'name'], message: `Coluna "${column.name}" repetida` })
      seen.add(key)
      if (column.isIdentity && !['int2', 'int4', 'int8'].includes(column.type)) {
        ctx.addIssue({ code: 'custom', path: ['columns', i, 'isIdentity'], message: 'Auto incremento só em colunas inteiras' })
      }
      if (column.isIdentity && column.defaultValue) {
        ctx.addIssue({ code: 'custom', path: ['columns', i, 'defaultValue'], message: 'Coluna auto incremento não aceita valor padrão' })
      }
    })
  })

export type CreateTableInput = z.infer<typeof createTableBody>
export type ColumnDefinition = z.infer<typeof columnDefinition>

// ── Alterar estrutura ────────────────────────────────────────────────

export const alterColumnBody = z
  .object({
    name: identifier,
    type: columnTypeSchema,
    typeArgs: z.string().trim().regex(/^\d+(\s*,\s*\d+)?$/, 'Use números, ex.: 255 ou 10,2').optional(),
    isArray: z.boolean(),
    nullable: z.boolean(),
    /** null = remover o default */
    defaultValue: z
      .string()
      .trim()
      .max(300)
      .refine((v) => !v.includes(';'), 'O valor padrão não pode conter ;')
      .nullable(),
    unique: z.boolean(),
    /** Coluna de senha: liga/desliga o hash bcrypt automático no banco */
    hashed: z.boolean(),
    /** Ao ligar o hash: converte também as senhas que já estão em texto puro */
    hashExisting: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para alterar')

export const alterTableBody = z
  .object({
    name: identifier,
    schema: identifier,
    /** null = remover a descrição */
    comment: z.string().trim().max(500).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para alterar')

export const dropQuery = z.object({
  dryRun: z.stringbool().default(false),
  cascade: z.stringbool().default(false),
})

export const dryRunQuery = z.object({ dryRun: z.stringbool().default(false) })

// ── Enums ────────────────────────────────────────────────────────────

/** Rótulo de um enum: texto livre (vai como literal escapado), até 63 bytes como no Postgres. */
const enumLabel = z
  .string()
  .trim()
  .min(1, 'Valor vazio')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 63, 'Máximo de 63 caracteres por valor')
  .refine((v) => !v.includes('\0'), 'Valor inválido')

const uniqueLabels = (values: string[], ctx: z.RefinementCtx, path: (string | number)[]) => {
  const seen = new Set<string>()
  values.forEach((v, i) => {
    if (seen.has(v)) ctx.addIssue({ code: 'custom', path: [...path, i], message: `Valor "${v}" repetido` })
    seen.add(v)
  })
}

export const createEnumBody = z
  .object({
    schema: identifier.default('public'),
    name: identifier,
    values: enumLabel.array().min(1, 'Informe pelo menos um valor').max(500),
  })
  .superRefine((input, ctx) => uniqueLabels(input.values, ctx, ['values']))

export const alterEnumBody = z
  .object({
    name: identifier,
    /** Novos valores, adicionados no fim (ou depois de `after`) */
    addValues: z.object({ value: enumLabel, after: enumLabel.optional() }).array().max(100),
    renameValues: z.object({ from: enumLabel, to: enumLabel }).array().max(100),
  })
  .partial()
  .refine((v) => Boolean(v.name || v.addValues?.length || v.renameValues?.length), 'Nada para alterar')

export const enumParams = z.object({ id: z.uuid(), schema: z.string().min(1).max(63), name: z.string().min(1).max(63) })

export type CreateEnumInput = z.infer<typeof createEnumBody>
export type AlterEnumInput = z.infer<typeof alterEnumBody>
export type AlterColumnInput = z.infer<typeof alterColumnBody>
export type AlterTableInput = z.infer<typeof alterTableBody>
