import { env } from '@/lib/env'

/** Formato de erro padrão do server: { statusCode, code, message, details?, reqId } */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly reqId?: string
  readonly details?: unknown

  constructor(message: string, status: number, body?: { code?: string; reqId?: string; details?: unknown }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = body?.code
    this.reqId = body?.reqId
    this.details = body?.details
  }
}

/** Chamado quando a sessão expira (401) — o app redireciona para o login. */
let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

/**
 * Cliente HTTP único do app. Toda chamada ao server passa por aqui:
 * cookies de sessão, JSON e tratamento de erro ficam centralizados.
 */
async function request<T>(path: string, { body, headers, ...init }: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) return undefined as T

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.()
    throw new ApiError(data?.message ?? 'Erro inesperado no servidor', response.status, data ?? undefined)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, init?: RequestOptions) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, init?: RequestOptions) => request<T>(path, { ...init, method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'DELETE', body }),
}
