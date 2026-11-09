import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import { env, isProduction } from '../config/env.ts'

export const securityPlugin = fp(async (app) => {
  await app.register(helmet, {
    // CSP compatível com o front em Vite (fontes e estilos locais)
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })

  // Em produção o front é servido pelo próprio server (mesma origem): CORS só em dev
  if (!isProduction) {
    await app.register(cors, { origin: env.CORS_ORIGIN.split(','), credentials: true })
  }

  await app.register(cookie, { secret: env.SESSION_SECRET })

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: `Muitas requisições. Tente de novo em ${Math.ceil(context.ttl / 1000)}s`,
    }),
  })
})
