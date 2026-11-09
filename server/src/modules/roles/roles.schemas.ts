import { z } from 'zod'

const roleName = z
  .string()
  .trim()
  .min(1, 'Informe o nome')
  .max(63, 'Máximo de 63 caracteres')
  .regex(/^[a-z_][a-z0-9_]*$/, 'Use minúsculas, números e _ (ex.: app_user)')

const password = z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(200)

export const tablePrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const

export const createRoleBody = z.object({
  name: roleName,
  password: password.optional(),
  canLogin: z.boolean().default(true),
  connectionLimit: z.number().int().min(-1).max(10_000).default(-1),
})

export const updateRoleBody = z
  .object({
    password,
    canLogin: z.boolean(),
    connectionLimit: z.number().int().min(-1).max(10_000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para alterar')

export const roleParams = z.object({ id: z.uuid(), role: z.string().min(1).max(63) })

export const grantsBody = z.object({
  items: z
    .object({
      schema: z.string().min(1).max(128),
      table: z.string().min(1).max(128),
      privileges: z.enum(tablePrivileges).array(),
    })
    .array()
    .min(1)
    .max(2000),
})

export const dropRoleQuery = z.object({
  /** Transfere os objetos do role para o usuário do DBHub e remove os privilégios antes de apagar */
  reassign: z.stringbool().default(false),
})

export type CreateRoleInput = z.infer<typeof createRoleBody>
export type UpdateRoleInput = z.infer<typeof updateRoleBody>
export type GrantItem = z.infer<typeof grantsBody>['items'][number]
