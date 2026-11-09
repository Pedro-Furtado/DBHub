import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rolesApi, type CreateRoleInput, type GrantItem, type UpdateRoleInput } from '../api/roles-api'

export const roleKeys = {
  list: (id: string) => ['db-roles', id] as const,
  grants: (id: string, role: string) => ['db-roles', id, role, 'grants'] as const,
}

export const useDbRoles = (id: string) => useQuery({ queryKey: roleKeys.list(id), queryFn: () => rolesApi.list(id) })

export const useRoleGrants = (id: string, role: string | undefined) =>
  useQuery({ queryKey: roleKeys.grants(id, role ?? ''), queryFn: () => rolesApi.grants(id, role!), enabled: Boolean(role) })

function useInvalidateRoles(id: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['db-roles', id] }),
      // a lista de roles também aparece no formulário de políticas
      queryClient.invalidateQueries({ queryKey: ['roles', id] }),
    ])
}

export function useCreateRole(id: string) {
  const invalidate = useInvalidateRoles(id)
  return useMutation({ mutationFn: (input: CreateRoleInput) => rolesApi.create(id, input), onSuccess: invalidate })
}

export function useUpdateRole(id: string) {
  const invalidate = useInvalidateRoles(id)
  return useMutation({ mutationFn: ({ role, input }: { role: string; input: UpdateRoleInput }) => rolesApi.update(id, role, input), onSuccess: invalidate })
}

export function useDropRole(id: string) {
  const invalidate = useInvalidateRoles(id)
  return useMutation({ mutationFn: ({ role, reassign }: { role: string; reassign: boolean }) => rolesApi.remove(id, role, { reassign }), onSuccess: invalidate })
}

export function useSetGrants(id: string, role: string) {
  const invalidate = useInvalidateRoles(id)
  return useMutation({ mutationFn: (items: GrantItem[]) => rolesApi.setGrants(id, role, items), onSuccess: invalidate })
}
