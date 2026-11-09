import { FileCode2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { SavedQuery } from '@/types/database'

type SavedQueriesProps = {
  queries: SavedQuery[]
  loading?: boolean
  activeId: string | null
  onSelect: (query: SavedQuery) => void
  onNew: () => void
}

export function SavedQueries({ queries, loading, activeId, onSelect, onNew }: SavedQueriesProps) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex h-12 items-center justify-between border-b px-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Queries salvas</p>
        <Button variant="ghost" size="icon-xs" aria-label="Nova query" onClick={onNew}>
          <Plus />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="mx-1 my-2 h-5" />)
          : queries.map((query) => (
              <button
                key={query.id}
                type="button"
                onClick={() => onSelect(query)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-accent',
                  activeId === query.id && 'bg-accent text-foreground',
                )}
              >
                <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{query.title}</span>
              </button>
            ))}
      </div>
    </aside>
  )
}
