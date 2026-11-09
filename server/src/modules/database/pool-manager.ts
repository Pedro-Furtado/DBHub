import pg from 'pg'
import { env } from '../../config/env.ts'
import { decrypt } from '../../lib/crypto.ts'
import { createLogger } from '../../lib/logger.ts'
import { externalTypes, toQueryError } from './pg-utils.ts'

const log = createLogger('pool-manager')

export type ExternalConnection = { id: string; name: string; urlEncrypted: string; readOnly: boolean }

type PoolEntry = { pool: pg.Pool; lastUsedAt: number; readOnly: boolean }

/**
 * Gerencia um pool por banco externo:
 * - criado sob demanda na primeira query;
 * - fechado automaticamente após POOL_IDLE_TTL_MS sem uso;
 * - toda sessão nasce com statement_timeout e, se for o caso, somente leitura.
 */
class PoolManager {
  private pools = new Map<string, PoolEntry>()
  private sweeper: NodeJS.Timeout

  constructor() {
    this.sweeper = setInterval(() => void this.sweepIdle(), 60_000)
    this.sweeper.unref()
  }

  private getPool(connection: ExternalConnection) {
    const existing = this.pools.get(connection.id)
    if (existing && existing.readOnly === connection.readOnly) {
      existing.lastUsedAt = Date.now()
      return existing.pool
    }
    if (existing) void this.close(connection.id)

    const pool = new pg.Pool({
      connectionString: decrypt(connection.urlEncrypted),
      max: 5,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: env.QUERY_TIMEOUT_MS,
      idle_in_transaction_session_timeout: env.QUERY_TIMEOUT_MS * 2,
      application_name: 'dbhub',
      options: connection.readOnly ? '-c default_transaction_read_only=on' : undefined,
      types: externalTypes,
    })
    pool.on('error', (err) => log.warn({ err, connectionId: connection.id }, 'Erro em conexão ociosa do banco externo'))

    this.pools.set(connection.id, { pool, lastUsedAt: Date.now(), readOnly: connection.readOnly })
    log.info({ connectionId: connection.id, connection: connection.name, readOnly: connection.readOnly }, 'Pool externo criado')
    return pool
  }

  /**
   * Executa `fn` com um client do banco externo.
   * Em conexões somente leitura tudo roda dentro de BEGIN READ ONLY.
   */
  async withClient<T>(connection: ExternalConnection, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    let client: pg.PoolClient
    try {
      client = await this.getPool(connection).connect()
    } catch (error) {
      log.warn({ err: error, connectionId: connection.id }, 'Não foi possível conectar ao banco externo')
      return toQueryError(error)
    }

    try {
      if (connection.readOnly) await client.query('BEGIN READ ONLY')
      const result = await fn(client)
      if (connection.readOnly) await client.query('COMMIT')
      return result
    } catch (error) {
      if (connection.readOnly) await client.query('ROLLBACK').catch(() => undefined)
      return toQueryError(error)
    } finally {
      client.release()
    }
  }

  async close(connectionId: string) {
    const entry = this.pools.get(connectionId)
    if (!entry) return
    this.pools.delete(connectionId)
    await entry.pool.end().catch(() => undefined)
    log.info({ connectionId }, 'Pool externo fechado')
  }

  private async sweepIdle() {
    const now = Date.now()
    for (const [id, entry] of this.pools) {
      if (now - entry.lastUsedAt > env.POOL_IDLE_TTL_MS) await this.close(id)
    }
  }

  async closeAll() {
    clearInterval(this.sweeper)
    await Promise.all([...this.pools.keys()].map((id) => this.close(id)))
  }

  get size() {
    return this.pools.size
  }
}

export const poolManager = new PoolManager()
