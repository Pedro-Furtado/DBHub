import { LoaderCircle } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Spinner({ className, ...props }: ComponentProps<'svg'>) {
  return <LoaderCircle role="status" aria-label="Carregando" className={cn('size-4 animate-spin', className)} {...props} />
}
