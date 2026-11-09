import { api } from '@/lib/api-client'
import { env } from '@/lib/env'
import { sleep } from '@/lib/utils'

export type User = { id: string; email: string }

const mockUser: User = { id: 'usr_demo', email: 'demo@dbhub.dev' }

const mock = {
  me: async () => mockUser,
  login: async (_key: string) => {
    await sleep(400)
    return mockUser
  },
  logout: async () => undefined,
}

const real = {
  me: () => api.get<User>('/auth/me'),
  login: (key: string) => api.post<User>('/auth/login', { key }),
  logout: () => api.post<void>('/auth/logout'),
}

export const authApi = env.useMocks ? mock : real
