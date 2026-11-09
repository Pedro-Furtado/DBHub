import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/auth-api'

export const authKeys = { me: ['auth', 'me'] as const }

export function useMe() {
  return useQuery({ queryKey: authKeys.me, queryFn: authApi.me, retry: false, staleTime: 5 * 60_000 })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => authApi.login(email, password),
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: authApi.logout,
    // Sai e limpa todo o cache (dados de bancos não ficam na memória)
    onSettled: () => queryClient.clear(),
  })
}
