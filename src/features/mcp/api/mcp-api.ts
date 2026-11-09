import { api } from '@/lib/api-client'
import { env } from '@/lib/env'
import { sleep } from '@/lib/utils'

export type McpAccess = 'read' | 'write'

export type McpKey = {
  id: string
  name: string
  /** Começo da chave, para reconhecer (ex.: dbh_a1b2c3) */
  prefix: string
  access: McpAccess
  /** null = todas as conexões */
  connectionIds: string[] | null
  lastUsedAt: string | null
  createdAt: string
}

export type McpKeyInput = { name: string; access: McpAccess; connectionIds: string[] | null }

/** A chave completa só vem nesta resposta — depois não dá para ver de novo. */
export type CreatedMcpKey = { key: McpKey; token: string }

let store: McpKey[] = []

const mock = {
  async list() {
    await sleep(150)
    return store
  },
  async create(input: McpKeyInput): Promise<CreatedMcpKey> {
    await sleep(300)
    const token = `dbh_${crypto.randomUUID().replace(/-/g, '')}`
    const key: McpKey = { id: crypto.randomUUID(), prefix: token.slice(0, 10), lastUsedAt: null, createdAt: new Date().toISOString(), ...input }
    store = [key, ...store]
    return { key, token }
  },
  async revoke(id: string) {
    await sleep(200)
    store = store.filter((k) => k.id !== id)
  },
}

const real = {
  list: () => api.get<McpKey[]>('/mcp/keys'),
  create: (input: McpKeyInput) => api.post<CreatedMcpKey>('/mcp/keys', input),
  revoke: (id: string) => api.delete<void>(`/mcp/keys/${id}`),
}

export const mcpApi = env.useMocks ? mock : real
