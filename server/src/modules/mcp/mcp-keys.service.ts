import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { mcpKeys } from '../../db/schema.ts'
import { badRequest, notFound } from '../../lib/errors.ts'
import { createLogger } from '../../lib/logger.ts'
import { connectionsRepository } from '../connections/connections.repository.ts'

const log = createLogger('mcp')

export type McpAccess = 'read' | 'write'
export type McpKey = typeof mcpKeys.$inferSelect

/** O que a chave pode fazer — vai para cada ferramenta do servidor MCP. */
export type McpKeyContext = { id: string; name: string; access: McpAccess; connectionIds: string[] | null }

const PREFIX = 'dbh_'
const hash = (token: string) => createHash('sha256').update(token).digest('hex')

/** Nunca devolve o hash; a chave em texto só sai uma vez, na criação. */
export const toPublicKey = ({ keyHash: _omit, ...rest }: McpKey) => rest

// Não grava "último uso" a cada chamada: no máximo 1x por minuto por chave
const lastTouch = new Map<string, number>()

export const mcpKeysService = {
  async list() {
    const rows = await db.select().from(mcpKeys).where(isNull(mcpKeys.revokedAt)).orderBy(desc(mcpKeys.createdAt))
    return rows.map(toPublicKey)
  },

  async create(input: { name: string; access: McpAccess; connectionIds: string[] | null }) {
    if (input.connectionIds) {
      const existing = new Set((await connectionsRepository.list()).map((c) => c.id))
      const missing = input.connectionIds.filter((id) => !existing.has(id))
      if (missing.length) throw badRequest('Conexão não encontrada na lista', 'CONNECTION_NOT_FOUND')
    }
    // 32 bytes aleatórios → 43 caracteres base64url
    const token = PREFIX + randomBytes(32).toString('base64url')
    const [row] = await db
      .insert(mcpKeys)
      .values({
        name: input.name,
        access: input.access,
        connectionIds: input.connectionIds,
        prefix: token.slice(0, 10),
        keyHash: hash(token),
      })
      .returning()
    log.warn({ keyId: row!.id, keyName: row!.name, access: row!.access, scoped: Boolean(input.connectionIds) }, 'Chave MCP criada')
    return { key: toPublicKey(row!), token }
  },

  async revoke(id: string) {
    const [row] = await db
      .update(mcpKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(mcpKeys.id, id), isNull(mcpKeys.revokedAt)))
      .returning()
    if (!row) throw notFound('Chave não encontrada', 'MCP_KEY_NOT_FOUND')
    lastTouch.delete(id)
    log.warn({ keyId: row.id, keyName: row.name }, 'Chave MCP revogada')
  },

  /** Valida o token recebido do agente. Retorna null se inválido ou revogado. */
  async verify(token: string | undefined): Promise<McpKeyContext | null> {
    if (!token?.startsWith(PREFIX) || token.length > 100) return null
    const digest = hash(token)
    const [row] = await db.select().from(mcpKeys).where(and(eq(mcpKeys.keyHash, digest), isNull(mcpKeys.revokedAt))).limit(1)
    // Comparação em tempo constante (defesa extra; a busca já foi pelo hash)
    if (!row || !timingSafeEqual(Buffer.from(row.keyHash), Buffer.from(digest))) return null

    const now = Date.now()
    if ((lastTouch.get(row.id) ?? 0) < now - 60_000) {
      lastTouch.set(row.id, now)
      void db.update(mcpKeys).set({ lastUsedAt: new Date() }).where(eq(mcpKeys.id, row.id)).catch(() => undefined)
    }
    return { id: row.id, name: row.name, access: row.access, connectionIds: row.connectionIds ?? null }
  },
}
