import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createLogger } from '../lib/logger.ts'
import { db, pool } from './client.ts'

const log = createLogger('migrate')
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

/** Aplica as migrations pendentes. Roda no boot do server e via `npm run db:migrate`. */
export async function runMigrations() {
  const startedAt = performance.now()
  log.info('Aplicando migrations do banco interno…')
  await migrate(db, { migrationsFolder })
  log.info({ durationMs: Math.round(performance.now() - startedAt) }, 'Migrations aplicadas')
}

// Execução direta: npm run db:migrate
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => pool.end())
    .catch(async (err) => {
      log.error({ err }, 'Falha ao aplicar migrations')
      await pool.end()
      process.exit(1)
    })
}
