import { z } from 'zod'

const identifier = z.string().min(1).max(128)

export const policyCommands = ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const

/** Expressão SQL livre (como no Supabase), sem ; para não empilhar comandos. */
const expression = z
  .string()
  .trim()
  .max(4000)
  .refine((v) => !v.includes(';'), 'A expressão não pode conter ;')
  .optional()
  .transform((v) => v || undefined)

export const policyBody = z
  .object({
    /** Nome livre (aceita espaços, como "Leitura pública") — vai entre aspas no SQL */
    name: z.string().trim().min(1, 'Informe o nome da política').max(63, 'Máximo de 63 caracteres'),
    command: z.enum(policyCommands, { message: 'Comando inválido' }),
    permissive: z.boolean().default(true),
    roles: z.array(identifier).min(1, 'Escolha pelo menos um role').default(['public']),
    using: expression,
    withCheck: expression,
  })
  .superRefine((p, ctx) => {
    if (p.command === 'INSERT' && p.using) {
      ctx.addIssue({ code: 'custom', path: ['using'], message: 'INSERT só usa WITH CHECK' })
    }
    if ((p.command === 'SELECT' || p.command === 'DELETE') && p.withCheck) {
      ctx.addIssue({ code: 'custom', path: ['withCheck'], message: `${p.command} só usa USING` })
    }
    if (p.command !== 'INSERT' && !p.using && !(p.command === 'UPDATE' && p.withCheck) && p.command !== 'ALL') {
      ctx.addIssue({ code: 'custom', path: ['using'], message: 'Informe a expressão USING (quais linhas a política alcança)' })
    }
    if (p.command === 'INSERT' && !p.withCheck) {
      ctx.addIssue({ code: 'custom', path: ['withCheck'], message: 'Informe a expressão WITH CHECK' })
    }
    if (p.command === 'ALL' && !p.using && !p.withCheck) {
      ctx.addIssue({ code: 'custom', path: ['using'], message: 'Informe USING e/ou WITH CHECK' })
    }
  })

export const tableScopeParams = z.object({ id: z.uuid(), schema: identifier, table: identifier })
export const policyParams = tableScopeParams.extend({ policy: z.string().min(1).max(63) })

export const rlsBody = z
  .object({ enabled: z.boolean(), forced: z.boolean() })
  .partial()
  .refine((v) => v.enabled !== undefined || v.forced !== undefined, 'Nada para alterar')

export type PolicyInput = z.infer<typeof policyBody>
