import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export type GraphColumn = {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  references?: { schema: string; table: string; column: string }
}
export type GraphTable = { schema: string; name: string; kind: 'table' | 'view'; rowEstimate: number | null; columns: GraphColumn[] }

/** Tabelas + colunas + FKs. Também alimenta o autocomplete do SQL Editor. */
export function useSchemaGraph(connectionId: string, schema?: string) {
  return useQuery({
    queryKey: ['schema-graph', connectionId, schema ?? 'all'],
    queryFn: () => api.get<GraphTable[]>(`/c/${connectionId}/schema-graph${schema ? `?schema=${encodeURIComponent(schema)}` : ''}`),
    staleTime: 60_000,
  })
}
