import { env } from './config/env.ts'
import { buildApp } from './app.ts'
import { pool } from './db/client.ts'
import { runMigrations } from './db/migrate.ts'
import { createLogger, logger } from './lib/logger.ts'
import { authService } from './modules/auth/auth.service.ts'
import { poolManager } from './modules/database/pool-manager.ts'

const log = createLogger('server')

async function main() {
  log.info({ nodeEnv: env.NODE_ENV, node: process.version }, 'Iniciando DBHub server')

  await runMigrations()
  await authService.ensureAccessKey()

  const app = await buildApp()
  await app.listen({ port: env.PORT, host: env.HOST })
  log.info(`Servidor ouvindo em http://localhost:${env.PORT}`)

  // Limpeza de sessões expiradas a cada hora
  const purge = setInterval(() => void authService.purgeExpired().catch((err) => log.error({ err }, 'Falha ao limpar sessões')), 3_600_000)
  purge.unref()

  // Encerramento gracioso: o Railway envia SIGTERM antes de trocar o deploy
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    log.info({ signal }, 'Encerrando servidor…')
    const force = setTimeout(() => {
      log.error('Encerramento demorou demais — forçando saída')
      process.exit(1)
    }, 10_000)
    force.unref()

    await app.close()
    await poolManager.closeAll()
    await pool.end()
    log.info('Servidor encerrado')
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason, module: 'process' }, 'Promise rejeitada sem tratamento')
})

process.on('uncaughtException', (err) => {
  logger.fatal({ err, module: 'process' }, 'Exceção não capturada — encerrando')
  process.exit(1)
})

main().catch((err) => {
  log.fatal({ err }, 'Falha ao iniciar o servidor')
  process.exit(1)
})
