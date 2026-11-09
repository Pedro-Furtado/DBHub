import { api } from '@/lib/api-client'
import { env } from '@/lib/env'
import { sleep } from '@/lib/utils'
import { mockConnections } from '@/mocks/data'
import type { Connection, ConnectionInput } from '@/types/database'
import { parseConnectionUrl } from '../lib/parse-connection-url'

let store = [...mockConnections]

export type TestConnectionResult = { ok: boolean; version?: string; latencyMs?: number; message?: string }

const mock = {
  async list() {
    await sleep(250)
    return store
  },
  async get(id: string) {
    await sleep(150)
    const connection = store.find((c) => c.id === id)
    if (!connection) throw new Error('Conexão não encontrada')
    return connection
  },
  async create(input: ConnectionInput) {
    await sleep(400)
    const parsed = parseConnectionUrl(input.url)
    const connection: Connection = {
      id: `cn_${crypto.randomUUID().slice(0, 8)}`,
      name: input.name,
      environment: input.environment,
      readOnly: input.readOnly,
      host: parsed?.host ?? 'desconhecido',
      port: parsed?.port ?? 5432,
      database: parsed?.database ?? '',
      user: parsed?.user ?? '',
      status: 'unknown',
      createdAt: new Date().toISOString(),
    }
    store = [connection, ...store]
    return connection
  },
  async remove(id: string) {
    await sleep(250)
    store = store.filter((c) => c.id !== id)
  },
  async test(url: string): Promise<TestConnectionResult> {
    await sleep(700)
    return parseConnectionUrl(url)
      ? { ok: true, version: 'PostgreSQL 17.4', latencyMs: 42 }
      : { ok: false, message: 'URL inválida. Use o formato postgresql://usuario:senha@host:porta/banco' }
  },
}

const real = {
  list: () => api.get<Connection[]>('/connections'),
  get: (id: string) => api.get<Connection>(`/connections/${id}`),
  create: (input: ConnectionInput) => api.post<Connection>('/connections', input),
  remove: (id: string) => api.delete<void>(`/connections/${id}`),
  test: (url: string) => api.post<TestConnectionResult>('/connections/test', { url }),
}

export const connectionsApi = env.useMocks ? mock : real
