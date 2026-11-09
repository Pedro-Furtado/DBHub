import { api } from '@/lib/api-client'
import { env } from '@/lib/env'
import { sleep } from '@/lib/utils'

export type User = { id: string; email: string }

const mockUser: User = { id: 'usr_demo', email: 'demo@dbhub.dev' }

const mock = {
  me: async () => mockUser,
  login: async (_email: string, _password: string) => {
    await sleep(400)
    return mockUser
  },
  logout: async () => undefined,
}

const real = {
  me: () => api.get<User>('/auth/me'),
  login: (email: string, password: string) => api.post<User>('/auth/login', { email, password }),
  logout: () => api.post<void>('/auth/logout'),
}

export const authApi = env.useMocks ? mock : real
