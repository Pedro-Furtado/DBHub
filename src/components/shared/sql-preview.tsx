import { Code2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type SqlPreviewProps = {
  sql?: string
  error?: Error | null
  loading?: boolean
  /** Mensagem quando ainda não há o que mostrar */
  placeholder?: string
  title?: string
  className?: string
}

/** Caixa "SQL gerado" — mostra exatamente o que o server vai executar. */
export function SqlPreview({ sql, error, loading, placeholder = 'Preencha os campos para ver o SQL.', title = 'SQL gerado', className }: SqlPreviewProps) {
  return (
    <section className={cn('grid min-w-0 gap-2', className)}>
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Code2 className="size-4" /> {title}
      </p>
      <div className="min-w-0 rounded-lg border bg-sidebar">
        {error ? (
          <p className="p-4 text-xs text-destructive">{error.message}</p>
        ) : sql ? (
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">{sql}</pre>
        ) : loading ? (
          <div className="grid gap-2 p-4">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-72" />
          </div>
        ) : (
          <p className="p-4 text-xs text-muted-foreground">{placeholder}</p>
        )}
      </div>
    </section>
  )
}
