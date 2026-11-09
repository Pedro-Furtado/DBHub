import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createLogger } from '../../lib/logger.ts'
import { mcpKeysService } from './mcp-keys.service.ts'
import { buildMcpServer } from './mcp.server.ts'

const log = createLogger('mcp')

const jsonRpcError = (reply: FastifyReply, status: number, code: number, message: string) =>
  reply.status(status).send({ jsonrpc: '2.0', error: { code, message }, id: null })

/** Chave pelo header (Authorization: Bearer dbh_…) ou pela URL (/mcp/dbh_…) para clientes que não mandam header. */
function readToken(request: FastifyRequest<{ Params: { token?: string } }>) {
  const header = request.headers.authorization
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  return request.params.token
}

/**
 * Servidor MCP (Streamable HTTP, sem sessão): cada POST cria um servidor
 * com as permissões da chave, responde em JSON e é descartado.
 */
export const mcpRoutes: FastifyPluginAsync = async (app) => {
  async function handle(request: FastifyRequest<{ Params: { token?: string } }>, reply: FastifyReply) {
    const key = await mcpKeysService.verify(readToken(request))
    if (!key) {
      log.warn({ ip: request.ip }, 'MCP: chave inválida ou revogada')
      return reply
        .header('www-authenticate', 'Bearer realm="dbhub-mcp"')
        .status(401)
        .send({ jsonrpc: '2.0', error: { code: -32001, message: 'Chave MCP inválida ou revogada' }, id: null })
    }

    const server = buildMcpServer(key)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    reply.hijack()
    // Com hijack o log de acesso padrão não roda: registramos aqui, sem a chave
    reply.raw.on('finish', () => {
      const status = reply.raw.statusCode
      const durationMs = Math.round(reply.elapsedTime)
      log[status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info']({ statusCode: status, durationMs, keyName: key.name }, `POST /mcp ${status} - ${durationMs}ms`)
    })
    reply.raw.on('close', () => {
      void transport.close()
      void server.close()
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(request.raw, reply.raw, request.body)
    } catch (err) {
      log.error({ err, keyId: key.id }, 'MCP: erro ao processar requisição')
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' })
        reply.raw.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno' }, id: null }))
      }
    }
  }

  const config = { rateLimit: { max: 300, timeWindow: '1 minute' } }
  app.post('/mcp', { config, bodyLimit: 2 * 1024 * 1024 }, handle)
  app.post('/mcp/:token', { config, bodyLimit: 2 * 1024 * 1024 }, handle)

  // Sem sessão no servidor: não há stream GET nem DELETE de sessão
  for (const path of ['/mcp', '/mcp/:token']) {
    app.get(path, (_req, reply) => jsonRpcError(reply.header('allow', 'POST'), 405, -32000, 'Use POST (Streamable HTTP sem sessão)'))
    app.delete(path, (_req, reply) => jsonRpcError(reply.header('allow', 'POST'), 405, -32000, 'Sem sessões para encerrar'))
  }
}
