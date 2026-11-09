import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createLogger } from '../../lib/logger.ts'
import { type CloneEvent, planClone, runClone } from './clone.service.ts'

const log = createLogger('clone')

const pair = z.object({ sourceId: z.uuid('Escolha a origem'), targetId: z.uuid('Escolha o destino') })
const runBody = pair.extend({
  /** "schema.tabela" das tabelas que levam dados junto */
  dataTables: z.string().max(200).array().max(2000).default([]),
  confirm: z.string().max(200).optional(),
})

/** Copiar a estrutura (e, se quiser, dados) de um banco para outro: /api/sync/... */
export const syncRoutes: FastifyPluginAsyncZod = async (app) => {
  /** Revisão: lê os dois bancos e diz o que vai acontecer — não altera nada. */
  app.post('/clone/plan', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { body: pair } }, ({ body }) =>
    planClone(body.sourceId, body.targetId),
  )

  /**
   * Executa o clone e transmite cada etapa via SSE (text/event-stream).
   * Fechar a tela cancela o clone e desfaz tudo no destino.
   */
  app.post('/clone/run', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { body: runBody } }, async (request, reply) => {
    const abort = new AbortController()
    reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Railway/nginx: não segurar o stream em buffer
      'x-accel-buffering': 'no',
      'x-request-id': request.id,
    })
    res.on('close', () => {
      if (!res.writableFinished) abort.abort()
    })

    const send = (event: CloneEvent) => {
      if (!res.writableEnded) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    }
    // Mantém a conexão viva em etapas longas (proxies derrubam stream parado)
    const heartbeat = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), 15_000)

    const startedAt = Date.now()
    try {
      await runClone(request.body, send, abort.signal)
    } finally {
      clearInterval(heartbeat)
      res.end()
      log.info({ durationMs: Date.now() - startedAt, aborted: abort.signal.aborted }, `POST /api/sync/clone/run 200 - ${Date.now() - startedAt}ms`)
    }
  })
}
