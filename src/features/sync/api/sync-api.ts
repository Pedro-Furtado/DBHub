import { api, ApiError } from '@/lib/api-client'
import { env } from '@/lib/env'

export type CloneWarning = { level: 'info' | 'warn' | 'danger'; message: string }

export type ClonePlan = {
  source: { id: string; name: string; environment: string; database: string }
  target: { id: string; name: string; environment: string; database: string; readOnly: boolean }
  counts: {
    schemas: number
    extensions: number
    enums: number
    sequences: number
    functions: number
    tables: number
    views: number
    indexes: number
    foreignKeys: number
    triggers: number
    policies: number
  }
  tables: { key: string; schema: string; name: string; rowEstimate: number; sizeBytes: number; columns: number; hasPasswordHash: boolean }[]
  blocking: string[]
  warnings: CloneWarning[]
  requiresConfirm: boolean
  sql: string
}

export type CloneEvent =
  | { type: 'step'; id: string; label: string; status: 'running' | 'done' | 'skipped'; detail?: string }
  | { type: 'progress'; id: string; done: number; total: number; detail?: string }
  | { type: 'warn'; message: string }
  | { type: 'done'; durationMs: number; summary: { tables: number; rows: number } }
  | { type: 'error'; message: string; step?: string }

export type CloneRunInput = { sourceId: string; targetId: string; dataTables: string[]; confirm?: string }

export const syncApi = {
  planClone: (sourceId: string, targetId: string) => api.post<ClonePlan>('/sync/clone/plan', { sourceId, targetId }),

  /**
   * Executa o clone lendo o SSE do POST (EventSource não aceita POST/corpo).
   * Cada bloco `event:/data:` vira uma chamada de `onEvent`. Abortar o signal cancela no server (rollback).
   */
  async runClone(input: CloneRunInput, onEvent: (event: CloneEvent) => void, signal: AbortSignal) {
    const response = await fetch(`${env.apiUrl}/sync/clone/run`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(input),
      signal,
    })
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null)
      throw new ApiError(data?.message ?? 'Não foi possível iniciar o clone', response.status, data ?? undefined)
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let index: number
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (!data) continue // heartbeat (": ping")
        try {
          onEvent(JSON.parse(data) as CloneEvent)
        } catch {
          // bloco malformado: ignora
        }
      }
    }
  },
}
