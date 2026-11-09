import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PolicyInput } from '@/types/database'
import { policiesApi } from '../api/policies-api'

export const policyKeys = {
  overview: (id: string) => ['policies', id] as const,
  roles: (id: string) => ['roles', id] as const,
}

export function usePoliciesOverview(connectionId: string) {
  return useQuery({ queryKey: policyKeys.overview(connectionId), queryFn: () => policiesApi.overview(connectionId) })
}

export function useRoles(connectionId: string) {
  return useQuery({ queryKey: policyKeys.roles(connectionId), queryFn: () => policiesApi.roles(connectionId), staleTime: 5 * 60_000 })
}

function useInvalidate(connectionId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: policyKeys.overview(connectionId) })
}

type TableRef = { schema: string; table: string }

export function useSetRls(connectionId: string) {
  const invalidate = useInvalidate(connectionId)
  return useMutation({
    mutationFn: ({ schema, table, ...change }: TableRef & { enabled?: boolean; forced?: boolean }) =>
      policiesApi.setRls(connectionId, schema, table, change),
    onSuccess: invalidate,
  })
}

export function useSavePolicy(connectionId: string) {
  const invalidate = useInvalidate(connectionId)
  return useMutation({
    mutationFn: ({ schema, table, oldName, policy }: TableRef & { oldName?: string; policy: PolicyInput }) =>
      oldName
        ? policiesApi.update(connectionId, schema, table, oldName, policy)
        : policiesApi.create(connectionId, schema, table, policy),
    onSuccess: invalidate,
  })
}

export function useDeletePolicy(connectionId: string) {
  const invalidate = useInvalidate(connectionId)
  return useMutation({
    mutationFn: ({ schema, table, name }: TableRef & { name: string }) => policiesApi.remove(connectionId, schema, table, name),
    onSuccess: invalidate,
  })
}
