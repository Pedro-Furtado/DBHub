import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ConnectionInput } from '@/types/database'
import { connectionsApi } from '../api/connections-api'

/** Chaves de cache centralizadas — evita string solta espalhada pelo app. */
export const connectionKeys = {
  all: ['connections'] as const,
  detail: (id: string) => ['connections', id] as const,
}

export function useConnections() {
  return useQuery({ queryKey: connectionKeys.all, queryFn: connectionsApi.list })
}

export function useConnection(id: string | undefined) {
  return useQuery({
    queryKey: connectionKeys.detail(id ?? ''),
    queryFn: () => connectionsApi.get(id!),
    enabled: Boolean(id),
  })
}

export function useCreateConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ConnectionInput) => connectionsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionKeys.all }),
  })
}

export function useDeleteConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => connectionsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectionKeys.all }),
  })
}

export function useTestConnection() {
  return useMutation({ mutationFn: (url: string) => connectionsApi.test(url) })
}
