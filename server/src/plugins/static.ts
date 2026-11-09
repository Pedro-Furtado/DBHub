import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('static')
/** Build do front (vite build) — fica em ../dist, na raiz do repositório */
const webDist = fileURLToPath(new URL('../../../dist', import.meta.url))

function apiNotFound(request: FastifyRequest, reply: FastifyReply) {
  return reply
    .status(404)
    .send({ statusCode: 404, code: 'ROUTE_NOT_FOUND', message: `Rota ${request.method} ${request.url} não existe`, reqId: request.id })
}

/** Em produção o server também entrega o front (um serviço só no Railway). */
export const staticPlugin = fp(async (app) => {
  const hasWeb = existsSync(webDist)

  if (!hasWeb) {
    log.warn({ path: webDist }, 'Build do front não encontrado — servindo só a API')
    app.setNotFoundHandler((request, reply) => apiNotFound(request, reply))
    return
  }

  await app.register(fastifyStatic, {
    root: webDist,
    wildcard: false,
    maxAge: '1y',
    immutable: true,
    index: false,
    setHeaders: (res, path) => {
      // index.html nunca em cache, para o deploy novo aparecer na hora
      if (path.endsWith('index.html')) res.header('Cache-Control', 'no-cache')
    },
  })

  // SPA: qualquer rota que não seja /api devolve o index.html
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? ''
    if (path.startsWith('/api')) return apiNotFound(request, reply)
    // Arquivo que não existe (ex.: /assets/x.js de um build antigo) → 404 de verdade, não o index.html
    if (path.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(path)) {
      return reply.status(404).type('text/plain').send('Arquivo não encontrado')
    }
    return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
  })
  log.info({ path: webDist }, 'Servindo o front')
})
