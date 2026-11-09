import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mcpApi, type McpKeyInput } from '../api/mcp-api'

const mcpKeys = ['mcp-keys'] as const

export function useMcpKeys() {
  return useQuery({ queryKey: mcpKeys, queryFn: mcpApi.list })
}

export function useCreateMcpKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: McpKeyInput) => mcpApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mcpKeys }),
  })
}

export function useRevokeMcpKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mcpApi.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mcpKeys }),
  })
}
