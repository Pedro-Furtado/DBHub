import { Badge } from '@/components/ui/badge'
import type { Environment } from '@/types/database'
import { environmentLabel } from '../lib/environment'

const variant = {
  production: 'destructive',
  staging: 'warning',
  development: 'secondary',
} as const

export function EnvironmentBadge({ environment }: { environment: Environment }) {
  return <Badge variant={variant[environment]}>{environmentLabel[environment]}</Badge>
}
