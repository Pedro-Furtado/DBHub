import { memo } from 'react'
import { cn } from '@/lib/utils'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })

/** Renderiza um valor do Postgres de acordo com o tipo da coluna. */
export const CellValue = memo(function CellValue({ value, type }: { value: unknown; type?: string }) {
  if (value === null || value === undefined) {
    return <span className="font-mono text-xs italic text-muted-foreground/70">NULL</span>
  }

  if (typeof value === 'boolean') {
    return (
      <span className={cn('font-mono text-xs', value ? 'text-primary' : 'text-muted-foreground')}>{String(value)}</span>
    )
  }

  if (typeof value === 'object') {
    return <span className="font-mono text-xs text-muted-foreground">{JSON.stringify(value)}</span>
  }

  if (type?.startsWith('timestamp') && typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return <span className="tabular-nums">{dateFormatter.format(date)}</span>
  }

  if (typeof value === 'number') return <span className="tabular-nums">{value}</span>

  const isMono = type === 'uuid' || type?.startsWith('int') || type === 'numeric'
  return <span className={cn(isMono && 'font-mono text-xs')}>{String(value)}</span>
})
