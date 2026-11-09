import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { clearSessionCookie, readSessionToken, setSessionCookie } from '../../plugins/auth.ts'
import { authService } from './auth.service.ts'

const userResponse = z.object({ id: z.string(), email: z.string() })

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/login',
    {
      // Força bruta: no máximo 10 tentativas por minuto por IP
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: z.object({ email: z.email('E-mail inválido'), password: z.string().min(1, 'Informe a senha') }),
        response: { 200: userResponse },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body
      const session = await authService.login(email, password, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      })
      setSessionCookie(reply, session.token, session.expiresAt)
      return session.user
    },
  )

  app.post('/logout', async (request, reply) => {
    const token = readSessionToken(request)
    if (token) await authService.logout(token)
    clearSessionCookie(reply)
    return reply.status(204).send()
  })

  app.get('/me', { onRequest: app.authenticate, schema: { response: { 200: userResponse } } }, async (request) => request.user!)
}
