import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { isProduction } from '../config/env.ts'
import { unauthorized } from '../lib/errors.ts'
import { authService, type SessionUser } from '../modules/auth/auth.service.ts'

export const SESSION_COOKIE = 'dbhub_session'

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export function readSessionToken(request: FastifyRequest) {
  const raw = request.cookies[SESSION_COOKIE]
  if (!raw) return null
  const unsigned = request.unsignCookie(raw)
  return unsigned.valid ? unsigned.value : null
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    signed: true,
    expires: expiresAt,
  })
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

/** Decora `app.authenticate` — usado como hook nas rotas protegidas. */
export const authPlugin = fp(async (app) => {
  app.decorateRequest('user', null)

  app.decorate('authenticate', async (request: FastifyRequest) => {
    const token = readSessionToken(request)
    const user = token ? await authService.validate(token) : null
    if (!user) throw unauthorized()
    request.user = user
  })
})
