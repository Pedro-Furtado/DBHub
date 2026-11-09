import pg from 'pg'
import { decrypt, encrypt } from '../../lib/crypto.ts'
import { notFound } from '../../lib/errors.ts'
import { createLogger } from '../../lib/logger.ts'
import { getDatabaseStats } from '../database/introspection.service.ts'
import { poolManager } from '../database/pool-manager.ts'
import { parseConnectionUrl } from './connection-url.ts'
import { type ConnectionRow, connectionsRepository } from './connections.repository.ts'
import type { CreateConnectionInput, UpdateConnectionInput } from './connections.schemas.ts'

const log = createLogger('connections')

/** Remove o campo sensível antes de devolver para a API. */
export function toPublicConnection({ urlEncrypted: _omit, updatedAt: _u, ...rest }: ConnectionRow) {
  return rest
}

/** Abre uma conexão avulsa (fora dos pools) só para testar a URL e coletar métricas. */
async function probe(url: string) {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 10_000,
    application_name: 'dbhub-probe',
  })
  const startedAt = performance.now()
  try {
    await client.connect()
    const stats = await getDatabaseStats(client as unknown as pg.PoolClient)
    return { ok: true as const, ...stats, latencyMs: Math.round(performance.now() - startedAt) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao conectar'
    return { ok: false as const, message: friendlyConnectError(message) }
  } finally {
    await client.end().catch(() => undefined)
  }
}

function friendlyConnectError(message: string) {
  if (/password authentication failed/i.test(message)) return 'Usuário ou senha incorretos'
  if (/ENOTFOUND|getaddrinfo/i.test(message)) return 'Host não encontrado — confira o endereço'
  if (/ECONNREFUSED/i.test(message)) return 'Conexão recusada — o banco está acessível nessa porta?'
  if (/timeout/i.test(message)) return 'Tempo esgotado ao conectar — o banco aceita conexões externas?'
  if (/does not exist/i.test(message)) return 'Banco de dados não encontrado'
  return message
}

/** Métricas (tabelas, tamanho, versão) mais velhas que isso são recalculadas ao abrir. */
const STATS_MAX_AGE_MS = 10_000
/** A lista não espera banco lento/offline: devolve o que tiver e termina de atualizar em segundo plano. */
const LIST_WAIT_MS = 2_500

/** Uma atualização por conexão de cada vez (várias telas pedindo juntas reaproveitam a mesma). */
const refreshing = new Map<string, Promise<ConnectionRow>>()

function isStale(row: ConnectionRow) {
  return !row.lastCheckedAt || Date.now() - row.lastCheckedAt.getTime() > STATS_MAX_AGE_MS
}

function refreshRow(row: ConnectionRow): Promise<ConnectionRow> {
  const running = refreshing.get(row.id)
  if (running) return running
  const task = (async () => {
    const result = await probe(decrypt(row.urlEncrypted))
    const updated = await connectionsRepository.update(row.id, {
      status: result.ok ? 'online' : 'offline',
      lastCheckedAt: new Date(),
      ...(result.ok && { version: result.version, sizeBytes: result.sizeBytes, tableCount: result.tableCount }),
    })
    if (!result.ok) log.warn({ connectionId: row.id, reason: result.message }, 'Conexão offline')
    return updated ?? row
  })()
    .catch((error) => {
      log.warn({ connectionId: row.id, err: error }, 'Falha ao atualizar métricas da conexão')
      return row
    })
    .finally(() => refreshing.delete(row.id))
  refreshing.set(row.id, task)
  return task
}

export const connectionsService = {
  async list() {
    const rows = await connectionsRepository.list()
    const fresh = await Promise.all(
      rows.map((row) => {
        if (!isStale(row)) return row
        // Espera no máximo LIST_WAIT_MS; se demorar, usa o valor salvo (a atualização segue e vale na próxima)
        return Promise.race([refreshRow(row), new Promise<ConnectionRow>((resolve) => setTimeout(() => resolve(row), LIST_WAIT_MS))])
      }),
    )
    return fresh.map(toPublicConnection)
  },

  /** Detalhe da conexão com métricas atualizadas (o número de tabelas muda quando você cria/apaga). */
  async getFresh(id: string) {
    const row = await this.get(id)
    return toPublicConnection(isStale(row) ? await refreshRow(row) : row)
  },

  async get(id: string) {
    const row = await connectionsRepository.findById(id)
    if (!row) throw notFound('Conexão não encontrada', 'CONNECTION_NOT_FOUND')
    return row
  },

  async test(url: string) {
    parseConnectionUrl(url)
    const result = await probe(url)
    log.info({ ok: result.ok, latencyMs: result.ok ? result.latencyMs : undefined }, 'Teste de connection string')
    return result.ok ? { ok: true, version: result.version, latencyMs: result.latencyMs } : { ok: false, message: result.message }
  },

  async create(input: CreateConnectionInput) {
    const info = parseConnectionUrl(input.url)
    const result = await probe(input.url)

    const row = await connectionsRepository.create({
      name: input.name,
      environment: input.environment,
      readOnly: input.readOnly,
      urlEncrypted: encrypt(input.url),
      ...info,
      status: result.ok ? 'online' : 'offline',
      version: result.ok ? result.version : null,
      sizeBytes: result.ok ? result.sizeBytes : null,
      tableCount: result.ok ? result.tableCount : null,
      lastCheckedAt: new Date(),
    })

    log.info(
      { connectionId: row.id, connection: row.name, host: row.host, environment: row.environment, status: row.status },
      'Conexão criada',
    )
    return toPublicConnection(row)
  },

  async update(id: string, input: UpdateConnectionInput) {
    await this.get(id)
    const { url, ...rest } = input
    const data = url ? { ...rest, ...parseConnectionUrl(url), urlEncrypted: encrypt(url), status: 'unknown' as const } : rest

    const row = await connectionsRepository.update(id, data)
    if (!row) throw notFound('Conexão não encontrada', 'CONNECTION_NOT_FOUND')
    // URL ou modo mudou: o pool antigo não serve mais
    await poolManager.close(id)
    log.info({ connectionId: id, fields: Object.keys(input) }, 'Conexão atualizada')
    return toPublicConnection(row)
  },

  /** Reverifica status/métricas de uma conexão salva. */
  async refresh(id: string) {
    return toPublicConnection(await refreshRow(await this.get(id)))
  },

  async remove(id: string) {
    const row = await connectionsRepository.remove(id)
    if (!row) throw notFound('Conexão não encontrada', 'CONNECTION_NOT_FOUND')
    await poolManager.close(id)
    log.info({ connectionId: id }, 'Conexão removida')
  },
}
