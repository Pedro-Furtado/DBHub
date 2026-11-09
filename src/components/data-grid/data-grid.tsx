import { ArrowDown, ArrowUp, ArrowUpDown, KeyRound, Link2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Row } from '@/types/database'
import { CellEditor } from './cell-editor'
import { CellValue } from './cell-value'

export type GridColumn = {
  name: string
  type?: string
  isPrimaryKey?: boolean
  isForeignKey?: boolean
  nullable?: boolean
  /** Valores permitidos (enum): a edição inline vira um select */
  enumValues?: string[]
  /** Coluna de senha (hash no banco): o editor abre pedindo a senha nova */
  hashed?: boolean
}

type DataGridProps = {
  columns: GridColumn[]
  rows: Row[]
  loading?: boolean
  /** Coluna usada como key das linhas (normalmente a PK). */
  rowKey?: string
  selectedKeys?: Set<string>
  onToggleRow?: (key: string) => void
  onToggleAll?: () => void
  empty?: ReactNode
  className?: string
  /** Quando informado, duplo clique numa célula abre o editor inline. */
  onCellEdit?: (row: Row, column: GridColumn, value: string | null, opts?: { hash?: boolean }) => Promise<void>
  /** Colunas que não podem ser editadas (ex.: chave primária). */
  isColumnEditable?: (column: GridColumn) => boolean
  /** Ordenação controlada: clicar no cabeçalho alterna asc → desc → sem ordem. */
  sort?: { column: string; direction: 'asc' | 'desc' }
  onSortChange?: (sort: { column: string; direction: 'asc' | 'desc' } | undefined) => void
}

/**
 * Grid de dados reutilizável (Table Editor e resultado do SQL Editor).
 * Fase 2: trocar o corpo por TanStack Table + virtualização para milhares de linhas.
 */
export function DataGrid({
  columns,
  rows,
  loading,
  rowKey,
  selectedKeys,
  onToggleRow,
  onToggleAll,
  empty,
  className,
  onCellEdit,
  isColumnEditable = () => true,
  sort,
  onSortChange,
}: DataGridProps) {
  const [editing, setEditing] = useState<{ row: string; column: string } | null>(null)
  const selectable = Boolean(onToggleRow && rowKey)
  const selectedCount = selectedKeys?.size ?? 0
  // Cabeçalho: marcado (todas), indeterminado (algumas) ou desmarcado
  const headerState = rows.length > 0 && selectedCount === rows.length ? true : selectedCount > 0 ? 'indeterminate' : false

  return (
    <div className={cn('relative min-h-0 flex-1 overflow-auto', className)}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            {selectable && (
              <th className="w-10 border-b border-r bg-card px-3 align-middle">
<Checkbox
                  aria-label="Selecionar todas"
                  checked={headerState}
                  disabled={loading || rows.length === 0}
                  onCheckedChange={() => onToggleAll?.()}
                />
              </th>
            )}
            {columns.map((column) => {
              const sorted = sort?.column === column.name ? sort.direction : undefined
              const nextSort = () =>
                onSortChange?.(sorted === 'asc' ? { column: column.name, direction: 'desc' } : sorted === 'desc' ? undefined : { column: column.name, direction: 'asc' })
              const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown
              return (
                <th
                  key={column.name}
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                  className="h-9 min-w-36 border-b border-r bg-card p-0 text-left font-normal last:border-r-0"
                >
                  <button
                    type="button"
                    disabled={!onSortChange}
                    onClick={nextSort}
                    title={onSortChange ? 'Clique para ordenar' : undefined}
                    className="group/sort flex h-9 w-full items-center gap-1.5 px-3 text-left outline-none hover:bg-accent/50 focus-visible:bg-accent/50 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    {column.isPrimaryKey && <KeyRound className="size-3 shrink-0 text-warning" aria-label="Chave primária" />}
                    {column.isForeignKey && <Link2 className="size-3 shrink-0 text-primary" aria-label="Chave estrangeira" />}
                    <span className="font-medium text-foreground">{column.name}</span>
                    {column.type && <span className="truncate font-mono text-[11px] text-muted-foreground">{column.type}</span>}
                    {onSortChange && (
                      <SortIcon
                        className={cn(
                          'ml-auto size-3.5 shrink-0',
                          sorted ? 'text-primary' : 'text-muted-foreground opacity-0 group-hover/sort:opacity-100',
                        )}
                      />
                    )}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 12 }, (_, i) => (
                <tr key={i}>
                  {selectable && <td className="border-b border-r px-3 py-2" />}
                  {columns.map((column) => (
                    <td key={column.name} className="border-b border-r px-3 py-2 last:border-r-0">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, index) => {
                const key = rowKey ? String(row[rowKey]) : String(index)
                const selected = selectedKeys?.has(key)
                return (
                  <tr key={key} data-state={selected ? 'selected' : undefined} className="group hover:bg-muted/40 data-[state=selected]:bg-primary/10">
                    {selectable && (
                      <td className="border-b border-r px-3 align-middle leading-none">
<Checkbox
                          aria-label="Selecionar linha"
                          checked={selected ?? false}
                          onCheckedChange={() => onToggleRow?.(key)}
                        />
                      </td>
                    )}
                    {columns.map((column) => {
                      const canEdit = Boolean(onCellEdit) && isColumnEditable(column)
                      const isEditing = editing?.row === key && editing.column === column.name
                      return (
                        <td
                          key={column.name}
                          onDoubleClick={canEdit ? () => setEditing({ row: key, column: column.name }) : undefined}
                          title={canEdit && !isEditing ? 'Duplo clique para editar' : undefined}
                          className={cn(
                            'max-w-72 truncate border-b border-r px-3 py-1.5 last:border-r-0',
                            canEdit && 'cursor-cell',
                            isEditing && 'max-w-none overflow-visible px-1 py-0.5',
                          )}
                        >
                          {isEditing ? (
                            <CellEditor
                              value={row[column.name]}
                              type={column.type}
                              nullable={column.nullable}
                              options={column.enumValues}
                              columnName={column.name}
                              hashed={column.hashed}
                              onCancel={() => setEditing(null)}
                              onSave={async (value, opts) => {
                                await onCellEdit!(row, column, value, opts)
                                setEditing(null)
                              }}
                            />
                          ) : (
                            <CellValue value={row[column.name]} type={column.type} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
        </tbody>
      </table>
      {!loading && rows.length === 0 && (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">{empty ?? 'Nenhuma linha'}</div>
      )}
    </div>
  )
}
