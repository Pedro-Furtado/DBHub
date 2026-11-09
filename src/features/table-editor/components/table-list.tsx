import { Columns3, Ellipsis, Eye, Pencil, Plus, Search, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatNumber } from '@/lib/utils'
import type { TableInfo } from '@/types/database'
import { EditTableLoader } from './structure/edit-table-dialog'

type TableListProps = {
  connectionId: string
  tables: TableInfo[]
  loading?: boolean
  /** Some quando a conexão é somente leitura */
  onCreateTable?: () => void
}

export function TableList({ connectionId, tables, loading, onCreateTable }: TableListProps) {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<TableInfo | null>(null)
  // Sem "Nova tabela" = conexão somente leitura: não mostra ações de edição
  const canWrite = Boolean(onCreateTable)

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase()
    const map = new Map<string, TableInfo[]>()
    for (const table of tables) {
      if (term && !table.name.toLowerCase().includes(term)) continue
      map.set(table.schema, [...(map.get(table.schema) ?? []), table])
    }
    return [...map.entries()]
  }, [tables, search])

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="grid gap-2 border-b p-3">
        {onCreateTable && (
          <Button size="sm" variant="outline" className="w-full justify-start" onClick={onCreateTable}>
            <Plus /> Nova tabela
          </Button>
        )}
        <Input
          icon={<Search />}
          placeholder="Buscar tabela…"
          className="h-8 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-2" aria-label="Tabelas">
        {loading
          ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="mx-1 my-2 h-5" />)
          : groups.map(([schema, items]) => (
              <div key={schema} className="mb-3">
                <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{schema}</p>
                {items.map((table) => (
                  <div key={`${table.schema}.${table.name}`} className="group/item relative">
                  <NavLink
                    to={`/c/${connectionId}/tables/${table.schema}/${table.name}`}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-accent',
                        isActive && 'bg-accent font-medium text-foreground',
                        canWrite && table.kind === 'table' && 'pr-8',
                      )
                    }
                  >
                    {table.kind === 'view' ? (
                      <Eye className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{table.name}</span>
                    {table.kind === 'table' && table.rowEstimate !== null && (
                      <span className="ml-auto text-[11px] tabular-nums text-muted-foreground group-hover/item:opacity-0 group-has-[[data-state=open]]/item:opacity-0">
                        {formatNumber(table.rowEstimate)}
                      </span>
                    )}
                  </NavLink>
                  {canWrite && table.kind === 'table' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Ações da tabela ${table.name}`}
                          className="absolute right-1 top-1/2 size-6 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover/item:opacity-100 data-[state=open]:opacity-100"
                        >
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="right">
                        <DropdownMenuItem onSelect={() => setEditing(table)}>
                          <Pencil /> Editar tabela
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/c/${connectionId}/tables/${table.schema}/${table.name}?view=structure`}>
                            <Columns3 /> Editar colunas
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  </div>
                ))}
              </div>
            ))}
        {!loading && groups.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhuma tabela</p>}
      </nav>
      {editing && <EditTableLoader connectionId={connectionId} schema={editing.schema} table={editing.name} onClose={() => setEditing(null)} />}
    </aside>
  )
}

