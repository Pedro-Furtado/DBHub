import { and, count, eq, gt, lt } from 'drizzle-orm'
import { env } from '../../config/env.ts'
import { db } from '../../db/client.ts'
import { sessions, users } from '../../db/schema.ts'
import { generateToken, hashPassword, sha256, verifyPassword } from '../../lib/crypto.ts'
import { unauthorized } from '../../lib/errors.ts'
import { createLogger } from '../../lib/logger.ts'

const log = createLogger('auth')

export type SessionUser = { id: string; email: string }

/** Hash fixo para comparar quando o e-mail não existe (evita descobrir e-mails pelo tempo de resposta). */
const dummyHash = hashPassword('dbhub-timing-protection')

export const authService = {
  /** Cria o admin a partir de ADMIN_EMAIL/ADMIN_PASSWORD se ainda não houver usuários. */
  async ensureAdmin() {
    const [{ total }] = (await db.select({ total: count() }).from(users)) as [{ total: number }]
    if (total > 0) return
    if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
      log.warn('Nenhum usuário cadastrado: defina ADMIN_EMAIL e ADMIN_PASSWORD para criar o administrador')
      return
    }
    await db.insert(users).values({ email: env.ADMIN_EMAIL.toLowerCase(), passwordHash: await hashPassword(env.ADMIN_PASSWORD) })
    log.info({ email: env.ADMIN_EMAIL }, 'Usuário administrador criado')
  },

  async login(email: string, password: string, meta: { ip: string; userAgent?: string }) {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1)
    const valid = user ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, await dummyHash), false)

    if (!user || !valid) {
      log.warn({ email, ip: meta.ip }, 'Tentativa de login inválida')
      throw unauthorized('E-mail ou senha incorretos')
    }

    const token = generateToken()
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000)
    await db.insert(sessions).values({ userId: user.id, tokenHash: sha256(token), ip: meta.ip, userAgent: meta.userAgent, expiresAt })

    log.info({ userId: user.id, ip: meta.ip }, 'Login realizado')
    return { token, expiresAt, user: { id: user.id, email: user.email } satisfies SessionUser }
  },

  async validate(token: string): Promise<SessionUser | null> {
    const [row] = await db
      .select({ id: users.id, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
      .limit(1)
    return row ?? null
  },

  async logout(token: string) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)))
  },

  async purgeExpired() {
    const removed = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id })
    if (removed.length) log.info({ removed: removed.length }, 'Sessões expiradas removidas')
  },
}
