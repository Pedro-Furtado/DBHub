import type { Environment } from '@/types/database'

export const environmentOptions: { value: Environment; label: string }[] = [
  { value: 'production', label: 'Produção' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Desenvolvimento' },
]

export const environmentLabel: Record<Environment, string> = {
  production: 'Produção',
  staging: 'Staging',
  development: 'Dev',
}
