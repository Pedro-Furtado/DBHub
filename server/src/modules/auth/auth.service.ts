import { randomBytes } from 'node:crypto'
import { and, asc, eq, gt, lt } from 'drizzle-orm'
import { env } from '../../config/env.ts'
import { db } from '../../db/client.ts'
import { sessions, users } from '../../db/schema.ts'
import { generateToken, hashPassword, sha256, verifyPassword } from '../../lib/crypto.ts'
import { unauthorized } from '../../lib/errors.ts'
import { createLogger } from '../../lib/logger.ts'

const log = createLogger('auth')

export type SessionUser = { id: string; email: string }

/** O painel tem um único acesso: a chave. Ela fica guardada (em hash) neste usuário interno. */
const ACCESS_USER = 'admin'

const generateAccessKey = () => `dbhub_${randomBytes(24).toString('base64url')}`

/** Mostra a chave gerada em destaque no log (só acontece uma vez: depois ela não pode ser recuperada). */
function printAccessKey(key: string) {
  const line = '═'.repeat(68)
  process.stdout.write(
    `\n${line}\n  DBHub — chave de acesso gerada (guarde agora, ela não aparece de novo)\n\n    ${key}\n\n` +
      `  Perdeu? Defina a variável DBHUB_ACCESS_KEY com uma chave nova e reinicie.\n${line}\n\n`,
  )
}

async function accessUser() {
  const [user] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1)
  return user
}

export const authService = {
  /**
   * Garante que existe uma chave de acesso:
   * - DBHUB_ACCESS_KEY definida → é ela (se mudou, troca o hash e encerra as sessões abertas);
   * - sem variável e sem chave salva → gera uma aleatória e mostra no log;
   * - sem variável e com chave salva → mantém a atual.
   */
  async ensureAccessKey() {
    const user = await accessUser()
    const fromEnv = env.DBHUB_ACCESS_KEY

    if (fromEnv) {
      if (!user) {
        await db.insert(users).values({ email: ACCESS_USER, passwordHash: await hashPassword(fromEnv) })
        log.info('Chave de acesso definida pela variável DBHUB_ACCESS_KEY')
      } else if (!(await verifyPassword(fromEnv, user.passwordHash))) {
        await db.update(users).set({ passwordHash: await hashPassword(fromEnv) }).where(eq(users.id, user.id))
        await db.delete(sessions)
        log.warn('DBHUB_ACCESS_KEY mudou: chave atualizada e sessões abertas encerradas')
      }
      return
    }

    if (user) return
    const key = generateAccessKey()
    await db.insert(users).values({ email: ACCESS_USER, passwordHash: await hashPassword(key) })
    log.warn('Nenhuma DBHUB_ACCESS_KEY definida: chave de acesso gerada (veja abaixo)')
    printAccessKey(key)
  },

  async login(key: string, meta: { ip: string; userAgent?: string }) {
    const user = await accessUser()
    const valid = user ? await verifyPassword(key.trim(), user.passwordHash) : false

    if (!user || !valid) {
      log.warn({ ip: meta.ip }, 'Tentativa de login inválida')
      throw unauthorized('Chave de acesso incorreta')
    }

    const token = generateToken()
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000)
    await db.insert(sessions).values({ userId: user.id, tokenHash: sha256(token), ip: meta.ip, userAgent: meta.userAgent, expiresAt })

    log.info({ ip: meta.ip }, 'Login realizado')
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
