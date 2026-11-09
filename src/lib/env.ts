/** Variáveis de ambiente do front, tipadas e com valores padrão. */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
  /** VITE_USE_MOCKS=true roda o front sozinho, com dados de exemplo (sem server). */
  useMocks: import.meta.env.VITE_USE_MOCKS === 'true',
} as const
