import { z } from 'zod'

export const environmentSchema = z.enum(['production', 'staging', 'development'])

export const connectionUrlSchema = z
  .string()
  .trim()
  .min(1, 'Informe a connection string')
  .max(2048)
  .regex(/^postgres(ql)?:\/\//i, 'A URL precisa começar com postgresql://')

export const createConnectionBody = z.object({
  name: z.string().trim().min(1, 'Informe um nome').max(120),
  url: connectionUrlSchema,
  environment: environmentSchema.default('development'),
  readOnly: z.boolean().default(false),
})

export const updateConnectionBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    url: connectionUrlSchema,
    environment: environmentSchema,
    readOnly: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar')

export const testConnectionBody = z.object({ url: connectionUrlSchema })

export const connectionParams = z.object({ id: z.uuid('ID de conexão inválido') })

/** O que a API devolve — sem a URL criptografada. */
export const connectionResponse = z.object({
  id: z.string(),
  name: z.string(),
  environment: environmentSchema,
  host: z.string(),
  port: z.number(),
  database: z.string(),
  user: z.string(),
  readOnly: z.boolean(),
  status: z.enum(['online', 'offline', 'unknown']),
  version: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  tableCount: z.number().nullable(),
  lastCheckedAt: z.date().nullable(),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
})

export const testConnectionResponse = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  latencyMs: z.number().optional(),
  message: z.string().optional(),
})

export type CreateConnectionInput = z.infer<typeof createConnectionBody>
export type UpdateConnectionInput = z.infer<typeof updateConnectionBody>
