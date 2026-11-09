import type { FastifyError } from 'fastify'
import fp from 'fastify-plugin'
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod'
import { isProduction } from '../config/env.ts'
import { AppError } from '../lib/errors.ts'

type ErrorBody = { statusCode: number; code: string; message: string; details?: unknown; reqId?: string }

/**
 * Formato único de erro em toda a API:
 *   { statusCode, code, message, details?, reqId }
 * Erros 5xx são logados como ERROR com stack; o cliente recebe só uma mensagem genérica.
 */
export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    let body: ErrorBody

    if (hasZodFastifySchemaValidationErrors(error)) {
      body = {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: error.validation[0]?.message ?? 'Dados inválidos',
        details: error.validation.map((v) => ({ path: v.instancePath.replace(/^\//, '').replace(/\//g, '.'), message: v.message })),
      }
    } else if (error instanceof AppError) {
      body = { statusCode: error.statusCode, code: error.code, message: error.message, details: error.details }
    } else if (isResponseSerializationError(error)) {
      request.log.error({ err: error, module: 'http' }, 'Resposta não bate com o schema')
      body = { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno no servidor' }
    } else if (error.statusCode && error.statusCode < 500) {
      // Erros do próprio Fastify (429 do rate limit, JSON malformado, 415…)
      body = { statusCode: error.statusCode, code: error.code ?? 'REQUEST_ERROR', message: error.message }
    } else {
      request.log.error({ err: error, module: 'http', reqId: request.id }, `Erro não tratado: ${error.message}`)
      body = {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'Erro interno no servidor' : error.message,
      }
    }

    body.reqId = request.id
    return reply.status(body.statusCode).send(body)
  })
})
