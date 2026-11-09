import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  connectionParams,
  connectionResponse,
  createConnectionBody,
  testConnectionBody,
  testConnectionResponse,
  updateConnectionBody,
} from './connections.schemas.ts'
import { connectionsService, toPublicConnection } from './connections.service.ts'

export const connectionsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { schema: { response: { 200: connectionResponse.array() } } }, () => connectionsService.list())

  app.post(
    '/test',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { body: testConnectionBody, response: { 200: testConnectionResponse } } },
    (request) => connectionsService.test(request.body.url),
  )

  app.post('/', { schema: { body: createConnectionBody, response: { 201: connectionResponse } } }, async (request, reply) => {
    const connection = await connectionsService.create(request.body)
    return reply.status(201).send(connection)
  })

  app.get('/:id', { schema: { params: connectionParams, response: { 200: connectionResponse } } }, async (request) => {
    return toPublicConnection(await connectionsService.get(request.params.id))
  })

  app.patch('/:id', { schema: { params: connectionParams, body: updateConnectionBody, response: { 200: connectionResponse } } }, (request) =>
    connectionsService.update(request.params.id, request.body),
  )

  app.post('/:id/refresh', { schema: { params: connectionParams, response: { 200: connectionResponse } } }, (request) =>
    connectionsService.refresh(request.params.id),
  )

  app.delete('/:id', { schema: { params: connectionParams } }, async (request, reply) => {
    await connectionsService.remove(request.params.id)
    return reply.status(204).send()
  })
}
