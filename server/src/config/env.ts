import { z } from 'zod'

// Em dev carrega o .env automaticamente (no Railway as variáveis já vêm do ambiente)
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile()
  } catch {
    // sem .env — segue com as variáveis do ambiente
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TZ: z.string().default('America/Araguaina'),

  DATABASE_URL: z.url({ message: 'DATABASE_URL precisa ser uma URL postgres válida' }),

  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY precisa ter 32 bytes em base64'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa ter pelo menos 32 caracteres'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),

  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD precisa ter pelo menos 8 caracteres').optional(),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  QUERY_MAX_ROWS: z.coerce.number().int().positive().default(1000),
  POOL_IDLE_TTL_MS: z.coerce.number().int().positive().default(600_000),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  // Ainda não há logger configurado aqui: falha cedo e de forma legível
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  console.error(`\n[FATAL] Variáveis de ambiente inválidas:\n${issues}\n`)
  process.exit(1)
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'
export type Env = typeof env
